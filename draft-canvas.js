/* ==========================================================================
   纸上草稿 · draft-canvas.js
   --------------------------------------------------------------------------
   鼠标 = 铅笔：划过留下多股细线 + 沿途掉下的石墨屑
   点一下 = 顿笔：渗出一团墨点，外面再被随手一圈的铅笔圈注围住
   上传的音频 = 只改手感：能量→墨色深浅，谱通量→抖动与湍流，谱质心→疏密与游走方向
   没有鼠标、没有点击、没有音频时，画布一个像素都不画（不做无意义自动动画）。
   整个文件是一个 IIFE：不往 window 上挂变量，不碰站内任何元素、不写 localStorage。
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- 1. 颜色与手感常量（只用这 6 个颜色，和站内 token 一致） ---------- */
  var C = {
    paper:  [243, 234, 215],   /* #f3ead7 纸   —— 擦除痕用 */
    pencil: [122, 116, 106],   /* #7a746a 铅笔灰 —— 线、石墨屑、圈注 */
    ink:    [42, 38, 34],      /* #2a2622 墨   —— 墨点 */
    blue:   [169, 195, 214],   /* #a9c3d6 褪色蓝 —— 音频开启时的湿墨边缘 */
    red:    [217, 139, 139],   /* #d98b8b 淡红 —— 音频高频时的边注点 */
    stamp:  [178, 58, 46]      /* #b23a2e 印章红 —— 顿笔中心偶尔出现的一点 */
  };

  /* 浓度档位：用户选的是「中等」 */
  var ALPHA = { pencil: 0.45, ink: 0.62 };

  /* 三档画质：高 / 中 / 低。低端设备或掉帧时自动往下走 */
  var TIERS = [
    { strands: 5, maxStrokes: 48, maxDust: 360, maxBlots: 20, maxLoops: 12, dpr: 2 },
    { strands: 3, maxStrokes: 30, maxDust: 140, maxBlots: 12, maxLoops: 8,  dpr: 1.5 },
    { strands: 2, maxStrokes: 18, maxDust: 0,   maxBlots: 8,  maxLoops: 5,  dpr: 1 }
  ];

  /* ---------- 2. 找到自己的地盘 ---------- */
  var wrap = document.querySelector('[data-hjl-draft]');
  if (!wrap) { return; }
  var box = wrap.querySelector('.hjl-canvas') || wrap;
  var cv = box.querySelector('canvas');
  if (!cv || !cv.getContext) { return; }
  var ctx = cv.getContext('2d');
  if (!ctx) { return; }

  var fileInput = wrap.querySelector('.hjl-canvas-input');
  var stopBtn   = wrap.querySelector('.hjl-canvas-stop');
  var stateEl   = wrap.querySelector('.hjl-canvas-state');

  var W = 0, H = 0;
  var tier = (window.matchMedia && window.matchMedia('(max-width: 700px)').matches) ? 1 : 0;
  var Q = TIERS[tier];
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var strokes = [], dust = [], blots = [], loops = [];
  var raf = null, lastT = 0, emaDt = 16.7, slowFrames = 0;
  var visible = true, bounds = null, cur = null, idleTimer = 0, lastPt = null;

  /* ---------- 3. 小工具 ---------- */
  /* 确定性伪随机：同一笔每次重画出来的抖动都一样，笔迹不会闪 */
  function nz(i, s) {
    var t = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
    return t - Math.floor(t);
  }
  function rgba(c, a) {
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  /* 墨在纸上变淡：不是线性下降，前面赖着不走，后面才加速消失 */
  function fade(age) {
    if (age <= 0.15) { return 1; }                     /* 洇开期：浓度不掉，只是变粗变毛 */
    var t = (age - 0.15) / 0.85;
    return 1 - Math.pow(t, 1.8);
  }

  /* ---------- 4. 画布尺寸 ---------- */
  function resize() {
    var w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) { return; }
    var dpr = Math.min(window.devicePixelRatio || 1, Q.dpr);
    W = w; H = h;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   /* 之后都按 CSS 像素画 */
    if (reduce) { staticSketch(); }
  }

  function updateBounds() {
    var r = box.getBoundingClientRect();
    bounds = { l: r.left, t: r.top, w: r.width, h: r.height };
  }

  /* ---------- 5. 音频：整段频谱只压成三个“手感标量” ---------- */
  var audio = {
    on: false, ctx: null, an: null, data: null, prev: null,
    el: null, url: null,
    energy: 0, flux: 0, centroid: 0.5, bassAvg: 0, lastPulse: 0,

    start: function (file) {
      var self = this;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { state('浏览器不支持'); return; }
        if (!this.ctx) {
          this.ctx = new AC();
          this.an = this.ctx.createAnalyser();
          this.an.fftSize = 512;
          this.an.smoothingTimeConstant = 0.75;
          this.data = new Uint8Array(this.an.frequencyBinCount);
          this.prev = new Uint8Array(this.an.frequencyBinCount);
        }
        if (this.ctx.state === 'suspended') { this.ctx.resume(); }
        if (!this.el) {
          /* 用 <audio> 元素播，才能随时停；频谱从它身上取 */
          this.el = new Audio();
          this.el.loop = true;
          this.ctx.createMediaElementSource(this.el).connect(this.an);
          this.an.connect(this.ctx.destination);
        }
        if (this.url) { URL.revokeObjectURL(this.url); }
        this.url = URL.createObjectURL(file);
        this.el.src = this.url;
        var p = this.el.play();
        if (p && p.catch) { p.catch(function () { state('点一下页面再播'); }); }
        this.on = true;
        state('播放中');
        if (stopBtn) { stopBtn.hidden = false; }
        loop();
      } catch (e) {
        this.on = false;
        state('音频不可用');   /* 静默降级：剩下的交给鼠标 */
      }
    },

    stop: function () {
      if (this.el) { this.el.pause(); }
      this.on = false;
      this.energy = 0; this.flux = 0; this.centroid = 0.5;
      state('已停止');
      if (stopBtn) { stopBtn.hidden = true; }
    },

    /* 每一帧算一次：总能量 / 谱通量 / 谱质心 */
    tick: function (now, dt) {
      if (!this.on || !this.an) {
        /* 没音频：手感缓慢回到默认值，一切由鼠标说了算 */
        this.energy *= 0.94; this.flux *= 0.94;
        this.centroid += (0.5 - this.centroid) * 0.08;
        return;
      }
      this.an.getByteFrequencyData(this.data);
      var n = this.data.length, i, v;
      var sum = 0, low = 0, num = 0, den = 0, flux = 0;
      for (i = 0; i < n; i++) {
        v = this.data[i] / 255;
        sum += v;
        if (i < n * 0.12) { low += v; }
        num += i * v; den += v;
        var d = v - this.prev[i] / 255;
        if (d > 0) { flux += d; }
      }
      this.prev.set(this.data);
      var e = Math.min(1, (sum / n) * 2.4);
      var f = Math.min(1, flux / (n * 0.30));
      var c = den > 0.001 ? Math.min(1, (num / den) / (n * 0.55)) : 0.5;
      this.energy += (e - this.energy) * 0.12;
      this.flux += (f - this.flux) * 0.15;
      this.centroid += (c - this.centroid) * 0.10;

      /* 低频突增 = 笔尖被按了一下：在最后一次鼠标位置自动顿笔（有输入才发生） */
      var lowAvg = low / (n * 0.12);
      var hit = lowAvg > 0.42 && lowAvg > this.bassAvg * 1.5;
      this.bassAvg += (lowAvg - this.bassAvg) * 0.1;
      if (hit && now - this.lastPulse > 900 && lastPt && now - lastPt.t < 2500) {
        this.lastPulse = now;
        addBlot(lastPt.x + (Math.random() - 0.5) * 18, lastPt.y + (Math.random() - 0.5) * 14);
        addLoop(lastPt.x, lastPt.y);
        loop();
      }
    }
  };

  function state(text) { if (stateEl) { stateEl.textContent = text; } }

  /* ---------- 6. 生成痕迹 ---------- */
  function newStroke(x, y) {
    var st = { pts: [{ x: x, y: y, p: 0.5 }], born: now(), life: 4500 + Math.random() * 4500, seed: Math.random() * 90, p: 0.5 };
    strokes.push(st);
    if (strokes.length > Q.maxStrokes) { strokes.shift(); }
    return st;
  }

  function addPoint(x, y) {
    var px = cur.pts[cur.pts.length - 1];
    var dx = x - px.x, dy = y - px.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    var p = 1 - Math.min(1, d / 26);            /* 笔压 = 速度的反比：慢 = 重 */
    cur.p += (p - cur.p) * 0.4;
    cur.pts.push({ x: x, y: y, p: p });

    /* 石墨屑：笔尖沿途掉下来的粉，速度越快掉得越多 */
    var k = Math.round(d / 7 + cur.p * 1.6);
    if (Q.maxDust > 0) {
      for (var i = 0; i < k && i < 3; i++) {
        spawnDust(x + (Math.random() - 0.5) * 7, y + (Math.random() - 0.5) * 7, p);
      }
    }
  }

  function spawnDust(x, y, p) {
    var spread = 0.5 + audio.centroid;                       /* 谱质心高 → 向外散 */
    var down = (1 - audio.centroid) * 0.9 + 0.15;            /* 谱质心低 → 向下沉积 */
    dust.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 16 * spread,
      vy: ((Math.random() - 0.35) * 14 * spread) + down * 10,
      r: 0.55 + Math.random() * 1.35 * (0.6 + p * 0.6),
      rot: Math.random() * 6.28,
      seed: Math.random() * 80,
      born: now(), life: 1800 + Math.random() * 1800,        /* 比线先消失 */
      warm: Math.random() < 0.1                              /* 少数几粒偏淡红 */
    });
    if (dust.length > Q.maxDust) { dust.shift(); }
  }

  function addBlot(x, y) {
    var n = 11, verts = [], i;
    for (i = 0; i < n; i++) { verts.push(0.72 + 0.56 * nz(i, Math.random() * 60)); }
    var sats = [], sn = 3 + Math.floor(Math.random() * 3);
    for (i = 0; i < sn; i++) {
      sats.push({ a: Math.random() * 6.28, d: 1.1 + Math.random() * 0.8, r: 0.5 + Math.random() * 1.1 });
    }
    blots.push({
      x: x, y: y, r: 3.2 + Math.random() * 3.0, verts: verts, sats: sats,
      seed: Math.random() * 80, born: now(), life: 3200 + Math.random() * 2000,
      stamp: Math.random() < 0.17                            /* 约 1/6 的机会带一点印章红 */
    });
    if (blots.length > Q.maxBlots) { blots.shift(); }
  }

  function addLoop(x, y) {
    var rx = 16 + Math.random() * 14;
    loops.push({
      x: x, y: y, rx: rx, ry: rx * (0.46 + Math.random() * 0.3),
      rot: Math.random() * 6.28, seed: Math.random() * 80,
      born: now(), life: 3800 + Math.random() * 1800
    });
    if (loops.length > Q.maxLoops) { loops.shift(); }
  }

  function now() { return performance.now(); }

  /* ---------- 7. 画 ---------- */
  /* 铅笔线：多股平行细线，每股都带抖动；起笔轻、中段重、收笔轻 */
  var BANDS = [[0, 0.2, 0.5], [0.16, 0.46, 0.92], [0.42, 0.8, 1], [0.76, 1, 0.58]];

  function drawStrokes(t) {
    var i, st;
    for (i = strokes.length - 1; i >= 0; i--) {
      st = strokes[i];
      var age = (t - st.born) / st.life;
      if (age >= 1) { strokes.splice(i, 1); continue; }
      if (st.pts.length < 2) { continue; }

      var f = fade(age);
      var spread = 1 + 0.55 * age;                     /* 墨渗进纸纤维：越到后面越粗 */
      var turb = 0.55 + audio.flux * 1.7;              /* 音频：湍流让抖动变大 */
      var col = mix(C.pencil, C.ink, 0.12 + audio.energy * 0.5 + st.p * 0.2);

      for (var s = 0; s < Q.strands; s++) {
        drawStrand(st, (s - (Q.strands - 1) / 2) * 1.15, f, spread, turb, col, s);
      }
      /* 音频开着、能量上来时：边缘多一层很淡的褪色蓝，像墨还没干 */
      if (audio.on && audio.energy > 0.18) {
        drawStrand(st, 1.3, f * 0.9, spread * 1.2, turb, C.blue, 99, 0.16 * audio.energy);
      }
      if (age > 0.7) { eraseMark(st, age); }            /* 后段：擦除痕横擦过去 */
    }
  }

  function drawStrand(st, off, f, spread, turb, col, s, alphaScale) {
    var pts = st.pts, n = pts.length;
    var aScale = alphaScale === undefined ? 1 : alphaScale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var b = 0; b < BANDS.length; b++) {
      var i0 = Math.floor(BANDS[b][0] * (n - 1));
      var i1 = Math.ceil(BANDS[b][1] * (n - 1));
      if (i1 - i0 < 1) { continue; }
      ctx.beginPath();
      for (var i = i0; i < i1; i++) {
        var p0 = pts[i], p1 = pts[i + 1];
        if (!p1) { break; }
        var dx = p1.x - p0.x, dy = p1.y - p0.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var nx = -dy / len * off, ny = dx / len * off;      /* 每股沿法线错开一点 */
        var j1 = (nz(i + s * 31, st.seed) - 0.5) * 2 * 1.3 * turb;
        var j2 = (nz(i + 1 + s * 31, st.seed + 5) - 0.5) * 2 * 1.3 * turb;
        if (i === i0) { ctx.moveTo(p0.x + nx + j1, p0.y + ny + j1); }
        ctx.lineTo(p1.x + nx + j2, p1.y + ny + j2);
      }
      var w = (0.7 + 0.9 * st.p) * BANDS[b][2] * spread;
      ctx.lineWidth = w;
      var grain = 0.82 + 0.30 * nz(b * 5 + s, st.seed + 3);
      ctx.strokeStyle = rgba(col, ALPHA.pencil * f * BANDS[b][2] * aScale * grain);
      ctx.stroke();
    }
  }

  /* 擦除痕：用纸色横擦几道，越擦越淡，不会把纸擦掉 */
  function eraseMark(st, age) {
    var pts = st.pts, n = pts.length;
    if (n < 4) { return; }
    var k = (age - 0.7) / 0.3;
    var times = Math.min(3, 1 + Math.floor(k * 2.4));
    ctx.lineCap = 'round';
    for (var j = 0; j < times; j++) {
      var i = Math.floor(nz(j * 7 + 3, st.seed) * (n - 3));
      var p = pts[i], q = pts[i + 2];
      var dx = q.x - p.x, dy = q.y - p.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var mx = (p.x + q.x) / 2 - dy / len * (nz(j, st.seed + 2) - 0.5) * 10;
      var my = (p.y + q.y) / 2 + dx / len * (nz(j, st.seed + 2) - 0.5) * 10;
      ctx.beginPath();
      ctx.moveTo(mx - dx * 0.55, my - dy * 0.55);
      ctx.lineTo(mx + dx * 0.55, my + dy * 0.55);
      ctx.lineWidth = 3 + k * 4.5;
      ctx.strokeStyle = rgba(C.paper, 0.55 * k);
      ctx.stroke();
    }
  }

  /* 石墨屑：不规则的小多边形，不是圆 */
  function drawDust(t, dt) {
    var sec = dt / 1000;
    for (var i = dust.length - 1; i >= 0; i--) {
      var d = dust[i];
      var age = (t - d.born) / d.life;
      if (age >= 1) { dust.splice(i, 1); continue; }
      d.x += d.vx * sec;
      d.y += d.vy * sec;
      d.vx *= 0.985; d.vy *= 0.985;
      var col = (d.warm && audio.on && audio.centroid > 0.55) ? C.red : C.pencil;
      ctx.beginPath();
      for (var v = 0; v < 4; v++) {
        var a = v / 4 * 6.2832 + d.rot;
        var r = d.r * (0.6 + 0.8 * nz(v, d.seed));
        var x = d.x + Math.cos(a) * r, y = d.y + Math.sin(a) * r;
        if (v === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
      }
      ctx.closePath();
      ctx.fillStyle = rgba(col, ALPHA.pencil * (1 - age) * 0.95);
      ctx.fill();
    }
  }

  /* 墨点：顿笔成团，之后向外洇开、慢慢变淡 */
  function drawBlots(t) {
    for (var i = blots.length - 1; i >= 0; i--) {
      var b = blots[i];
      var age = (t - b.born) / b.life;
      if (age >= 1) { blots.splice(i, 1); continue; }
      var g = easeOut(Math.min(1, age / 0.3));
      var r = b.r * (1 + 0.7 * g);
      var a = ALPHA.ink * (1 - Math.pow(age, 2.2));
      var n = b.verts.length;

      ctx.beginPath();
      for (var v = 0; v < n; v++) {
        var ang = v / n * 6.2832;
        var rr = r * b.verts[v];
        var x = b.x + Math.cos(ang) * rr, y = b.y + Math.sin(ang) * rr;
        if (v === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
      }
      ctx.closePath();
      ctx.fillStyle = rgba(C.ink, a * 0.5);
      ctx.fill();
      /* 再叠一层更小更浓的：笔尖顿住的地方总是最黑，边缘才洇开 */
      ctx.beginPath();
      for (var w2 = 0; w2 < n; w2++) {
        var ang2 = w2 / n * 6.2832;
        var rr2 = r * 0.56 * b.verts[w2];
        var x2 = b.x + Math.cos(ang2) * rr2, y2 = b.y + Math.sin(ang2) * rr2;
        if (w2 === 0) { ctx.moveTo(x2, y2); } else { ctx.lineTo(x2, y2); }
      }
      ctx.closePath();
      ctx.fillStyle = rgba(C.ink, a * 0.95);
      ctx.fill();
      if (audio.on && audio.energy > 0.18) {   /* 湿墨边缘：一层极淡的褪色蓝 */
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(C.blue, 0.18 * audio.energy * (1 - age));
        ctx.stroke();
      }
      for (var s = 0; s < b.sats.length; s++) {  /* 飞溅出去的小点 */
        var sa = b.sats[s];
        ctx.beginPath();
        ctx.arc(b.x + Math.cos(sa.a) * r * sa.d, b.y + Math.sin(sa.a) * r * sa.d, sa.r, 0, 6.2832);
        ctx.fillStyle = rgba(C.ink, a * 0.45);
        ctx.fill();
      }
      if (b.stamp) {                            /* 偶尔在中心留一点印章红 */
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 0.26, 0, 6.2832);
        ctx.fillStyle = rgba(C.stamp, a * 0.6);
        ctx.fill();
      }
    }
  }

  /* 圈注：随手一圈，先被“描”出来，描完就慢慢散掉（画两遍 = 手绘复笔） */
  function drawLoops(t) {
    for (var i = loops.length - 1; i >= 0; i--) {
      var o = loops[i];
      var age = (t - o.born) / o.life;
      if (age >= 1) { loops.splice(i, 1); continue; }
      var prog = Math.min(1, age / 0.22);            /* 描出进度 */
      var a = ALPHA.pencil * (1 - Math.pow(age, 1.6));
      var grow = 1 + 0.22 * age;
      ctx.lineCap = 'round';
      for (var pass = 0; pass < 2; pass++) {
        var seed = o.seed + pass * 9;
        var ox = pass ? 1.9 : 0, oy = pass ? 2.6 : 0;
        var steps = 34, span = 6.2832 * (1.02 + nz(1, o.seed) * 0.18) * prog;
        ctx.beginPath();
        for (var k = 0; k <= steps; k++) {
          var tt = k / steps;
          var ang = o.rot + span * tt - 0.18;
          var wob = 1 + (nz(k, seed) - 0.5) * 0.20;
          var lop = 1 + 0.10 * Math.sin(ang * 2 + seed);   /* 压扁一边：手画的圈不会正圆 */
          var x = o.x + ox + Math.cos(ang) * o.rx * wob * lop * grow;
          var y = o.y + oy + Math.sin(ang) * o.ry * wob * grow;
          if (k === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
        }
        ctx.lineWidth = pass ? 0.95 : 1.35;
        ctx.strokeStyle = rgba(C.pencil, a * (pass ? 0.42 : 1));
        ctx.stroke();
      }
    }
  }

  /* ---------- 8. 主循环 ---------- */
  function frame(t) {
    raf = null;
    var dt = Math.min(48, t - lastT || 16);
    lastT = t;

    /* 掉帧就降一档，保 60fps */
    emaDt = emaDt * 0.9 + dt * 0.1;
    if (emaDt > 22) {
      if (++slowFrames > 30) {
        slowFrames = 0;
        if (tier < 2) { tier++; Q = TIERS[tier]; trim(); resize(); }
      }
    } else { slowFrames = 0; }

    audio.tick(t, dt);

    ctx.clearRect(0, 0, W, H);
    drawBlots(t);
    drawLoops(t);
    drawStrokes(t);
    drawDust(t, dt);

    if (!visible || document.hidden) { return; }        /* 看不见就停 */
    if (!audio.on && !strokes.length && !dust.length && !blots.length && !loops.length) { return; } /* 没东西可画就待机 */
    raf = requestAnimationFrame(frame);
  }

  function loop() {
    if (raf || reduce) { return; }
    lastT = now();
    raf = requestAnimationFrame(frame);
  }

  function trim() {
    while (strokes.length > Q.maxStrokes) { strokes.shift(); }
    while (dust.length > Q.maxDust) { dust.shift(); }
    while (blots.length > Q.maxBlots) { blots.shift(); }
    while (loops.length > Q.maxLoops) { loops.shift(); }
  }

  /* ---------- 9. 输入：鼠标 / 触摸 / 笔，统一走 pointer 事件 ---------- */
  function onMove(e) {
    if (reduce || !bounds) { return; }
    var x = e.clientX - bounds.l, y = e.clientY - bounds.t;
    if (x < 0 || y < 0 || x > bounds.w || y > bounds.h) { endStroke(); return; }
    lastPt = { x: x, y: y, t: now() };
    if (!cur) { cur = newStroke(x, y); }
    else {
      var px = cur.pts[cur.pts.length - 1];
      var d = Math.sqrt((x - px.x) * (x - px.x) + (y - px.y) * (y - px.y));
      if (d > 48) { endStroke(); cur = newStroke(x, y); }   /* 跳跃太大就另起一笔 */
      else if (d > 2.6) { addPoint(x, y); }
    }
    if (cur && cur.pts.length > 90) { endStroke(); cur = newStroke(x, y); }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(endStroke, 220);                  /* 手停了就收笔 */
    loop();
  }

  function endStroke() { cur = null; }

  function onDown(e) {
    if (reduce || !bounds) { return; }
    /* 点在链接、按钮、表单上就不管：不干扰站内任何交互 */
    if (e.target && e.target.closest && e.target.closest('a,button,input,textarea,select,label')) { return; }
    var x = e.clientX - bounds.l, y = e.clientY - bounds.t;
    if (x < 0 || y < 0 || x > bounds.w || y > bounds.h) { return; }
    addBlot(x, y);
    addLoop(x, y);
    loop();
  }

  /* ---------- 10. 静止版：prefers-reduced-motion 时只画几笔装饰，不动 ---------- */
  function staticSketch() {
    if (!W || !H) { return; }
    strokes.length = 0; dust.length = 0; blots.length = 0; loops.length = 0;
    var t = now(), k, i, st;
    for (k = 0; k < 3; k++) {
      st = { pts: [], born: t - 1000, life: 8000, seed: 4 + k * 11, p: 0.55 };
      var y0 = H * (0.28 + k * 0.2), x0 = W * (0.1 + k * 0.05);
      for (i = 0; i <= 26; i++) {
        st.pts.push({ x: x0 + i * (W * 0.011), y: y0 + Math.sin(i * 0.32 + k) * 6, p: 0.55 });
      }
      strokes.push(st);
    }
    var verts = [];
    for (i = 0; i < 11; i++) { verts.push(0.72 + 0.56 * nz(i, 12)); }
    blots.push({ x: W * 0.66, y: H * 0.46, r: 4, verts: verts, sats: [], seed: 5, born: t - 1400, life: 9000, stamp: false });
    loops.push({ x: W * 0.66, y: H * 0.46, rx: 27, ry: 15, rot: -0.3, seed: 8, born: t - 3200, life: 9000 });
    ctx.clearRect(0, 0, W, H);
    drawBlots(t);
    drawLoops(t);
    drawStrokes(t);
  }

  /* ---------- 11. 启动 ---------- */
  function markBounds() {
    if (!bounds) { updateBounds(); }
    else { requestAnimationFrame(updateBounds); }
  }

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', endStroke, { passive: true });
  window.addEventListener('pointercancel', endStroke, { passive: true });
  window.addEventListener('scroll', function () { requestAnimationFrame(updateBounds); }, { passive: true });

  var rt = 0;
  function onResize() {
    clearTimeout(rt);
    rt = setTimeout(function () { resize(); updateBounds(); }, 120);
  }
  window.addEventListener('resize', onResize, { passive: true });
  if (window.ResizeObserver) { new ResizeObserver(onResize).observe(box); }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { loop(); }
  });

  /* 只在封面露出来的时候跑 */
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) { updateBounds(); loop(); }
    }, { threshold: 0 }).observe(box);
  }

  if (fileInput) {
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (f) { audio.start(f); }
    });
  }
  if (stopBtn) {
    stopBtn.addEventListener('click', function () { audio.stop(); });
  }

  resize();
  updateBounds();
  markBounds();
  if (reduce) { state('静止'); }

  /* 只暴露这一个名字，方便在控制台看看状态；不碰别的全局 */
  window.HJLDraft = {
    stats: function () {
      return { strokes: strokes.length, dust: dust.length, blots: blots.length, loops: loops.length, tier: tier, audio: audio.on };
    }
  };
})();
