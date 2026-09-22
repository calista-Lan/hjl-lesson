/* 互动设计：进度条 / 滚动揭示 / 导航高亮 / 封面 3D 倾斜 / 卡片 3D+光斑 / 回到封面 */
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("js");

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 1. 顶部滚动进度条 */
  var bar = document.querySelector(".scroll-progress");
  function onScroll() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - doc.clientHeight;
    var p = max > 0 ? (doc.scrollTop || document.body.scrollTop) / max : 0;
    if (bar) bar.style.width = (p * 100).toFixed(2) + "%";
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* 2. 滚动揭示动画（封面在首屏，不参与揭示，保留自身 0.25s 倾斜过渡） */
  var revealEls = document.querySelectorAll(
    ".section, .work-card, .glass-panel, .profile-details > div, .experience-item, .research-item, .teaching-group, .publication-group"
  );
  revealEls.forEach(function (el) { el.classList.add("reveal"); });
  function revealDone(el) {
    // 揭示结束后移除 reveal，让元素恢复自身更跟手的过渡（倾斜/光斑）
    el.classList.remove("reveal");
  }
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          setTimeout(function () { revealDone(e.target); }, 800);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); revealDone(el); });
  }

  /* 3. 导航当前栏目高亮（scrollspy） */
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll(".site-header nav a")
  );
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute("href")); })
    .filter(Boolean);
  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          var id = e.target.id;
          navLinks.forEach(function (a) {
            a.classList.toggle("active", a.getAttribute("href") === "#" + id);
          });
        }
      });
    }, { threshold: 0.5 });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* 4. 封面随鼠标 3D 倾斜 */
  var cover = document.querySelector(".book-cover");
  var frame = document.querySelector(".cover-frame");
  if (cover && frame && !reduce) {
    cover.addEventListener("pointermove", function (ev) {
      var r = cover.getBoundingClientRect();
      var x = (ev.clientX - r.left) / r.width - 0.5;
      var y = (ev.clientY - r.top) / r.height - 0.5;
      frame.style.transform =
        "rotateY(" + (x * 8).toFixed(2) + "deg) rotateX(" + (-y * 8).toFixed(2) + "deg)";
    });
    cover.addEventListener("pointerleave", function () {
      frame.style.transform = "";
    });
  }

  /* 5. 作品卡：3D 倾斜 + 跟随光斑 */
  if (!reduce) {
    document.querySelectorAll(".work-card").forEach(function (card) {
      card.addEventListener("pointermove", function (ev) {
        var r = card.getBoundingClientRect();
        var px = (ev.clientX - r.left) / r.width;
        var py = (ev.clientY - r.top) / r.height;
        card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
        card.style.transform =
          "translateY(-6px) rotateY(" + ((px - 0.5) * 8).toFixed(2) +
          "deg) rotateX(" + ((0.5 - py) * 8).toFixed(2) + "deg)";
      });
      card.addEventListener("pointerleave", function () {
        card.style.transform = "";
      });
    });
  }

  /* 6. 回到封面悬浮按钮 */
  var toCover = document.querySelector(".to-cover");
  if (toCover) {
    window.addEventListener("scroll", function () {
      if (window.scrollY > window.innerHeight * 0.8) toCover.classList.add("show");
      else toCover.classList.remove("show");
    }, { passive: true });
    toCover.addEventListener("click", function (e) {
      e.preventDefault();
      var target = document.querySelector("#about");
      if (target) target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    });
  }

  /* 7. 联系我面板：轻微 3D 倾斜 */
  var contactPanel = document.querySelector(".mb-contact");
  if (contactPanel && !reduce) {
    contactPanel.addEventListener("pointermove", function (ev) {
      var r = contactPanel.getBoundingClientRect();
      var px = (ev.clientX - r.left) / r.width;
      var py = (ev.clientY - r.top) / r.height;
      contactPanel.style.transform =
        "rotateY(" + ((px - 0.5) * 7).toFixed(2) + "deg) rotateX(" +
        ((0.5 - py) * 7).toFixed(2) + "deg)";
    });
    contactPanel.addEventListener("pointerleave", function () {
      contactPanel.style.transform = "";
    });
  }

  /* 8. 留言板：提交 / 本地保存 / 弹幕呈现 / 表情 / 字数 / 提示条 */
  var mbForm = document.querySelector(".mb-form");
  if (mbForm) {
    var mbText = mbForm.querySelector("#mb-message");
    var mbContact = mbForm.querySelector("#mb-contact");
    var mbCount = mbForm.querySelector("[data-count]");
    var mbError = mbForm.querySelector(".mb-error");
    var mbToast = document.querySelector(".mb-toast");
    var mbDanmaku = document.querySelector(".mb-danmaku");
    var mbStream = document.querySelector("[data-msg-stream]");
    var mbReset = document.querySelector(".mb-reset");
    var STORE_KEY = "hjl-message-board-v1";
    /* 预置示例留言（只取文字，不显示留言人） */
    var SAMPLE_TEXT = [
      "主页的配色好舒服，封面那段手写题词特别喜欢 ✨",
      "路过看看～作品卡片的悬停效果挺有意思的 🌿",
      "结构清楚，继续把内页内容补完整，加油。"
    ];
    var toastTimer;

    function load() {
      try {
        var raw = window.localStorage.getItem(STORE_KEY);
        var arr = raw ? JSON.parse(raw) : [];
        return Object.prototype.toString.call(arr) === "[object Array]" ? arr : [];
      } catch (err) {
        /* 隐私模式 / 沙盒里读不到，退回内存态，功能照常 */
        return [];
      }
    }
    function save(arr) {
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify(arr)); } catch (err) {}
    }
    function toast(msg) {
      if (!mbToast) return;
      mbToast.textContent = msg;
      mbToast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { mbToast.classList.remove("show"); }, 2200);
    }
    function stamp() {
      function p(n) { return (n < 10 ? "0" : "") + n; }
      var d = new Date();
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
        " " + p(d.getHours()) + ":" + p(d.getMinutes());
    }

    var mine = load();
    /* 弹幕内容池：示例 + 我贴的（都只显示文字，不显示留言人） */
    var pool = SAMPLE_TEXT.concat(mine.map(function (m) { return m.text; }));
    var poolIndex = 0;
    var lane = 0;
    var spawnTimer = null;
    var danmakuPaused = false;

    /* 给屏幕阅读器 / 减弱动效用的纯文本流（同样不显示留言人） */
    function fillStream() {
      if (!mbStream) return;
      mbStream.textContent = "";
      pool.forEach(function (txt) {
        var li = document.createElement("li");
        li.textContent = txt;
        mbStream.appendChild(li);
      });
    }

    /* 生成一条弹幕：随机一条轨道，飞完即移除 */
    function spawnBullet(text, isMe) {
      if (!mbDanmaku || reduce) return;
      var b = document.createElement("span");
      b.className = "mb-bullet" + (isMe ? " me" : "");
      b.textContent = text;
      var rows = 5;
      var h = mbDanmaku.clientHeight || 248;
      var laneH = h / rows;
      var top = Math.round((lane % rows) * laneH + (laneH - 36) / 2);
      if (top < 4) top = 4;
      b.style.top = top + "px";
      lane++;
      mbDanmaku.appendChild(b);
      var W = mbDanmaku.clientWidth;
      var B = b.offsetWidth || 120;
      b.style.setProperty("--dist", "-" + (W + B + 12) + "px");
      var dur = Math.max(9, Math.min(16, 8 + text.length / 6));
      b.style.setProperty("--dur", dur.toFixed(1) + "s");
      b.addEventListener("animationend", function () {
        if (b.parentNode) b.parentNode.removeChild(b);
      });
    }

    function tick() {
      if (danmakuPaused || !mbDanmaku || pool.length === 0) return;
      spawnBullet(pool[poolIndex % pool.length], false);
      poolIndex++;
    }

    function startDanmaku() {
      fillStream();
      if (reduce || !mbDanmaku) return;
      /* 先错开撒几条，开场不空荡 */
      for (var i = 0; i < 3 && pool.length; i++) {
        (function (k) {
          setTimeout(function () { spawnBullet(pool[k % pool.length], false); }, k * 1400);
        })(i);
      }
      spawnTimer = setInterval(tick, 1800);
    }

    if (mbDanmaku) {
      mbDanmaku.addEventListener("pointerenter", function () { danmakuPaused = true; });
      mbDanmaku.addEventListener("pointerleave", function () { danmakuPaused = false; });
    }

    if (mbReset) {
      mbReset.addEventListener("click", function () {
        mine = [];
        save(mine);
        pool = SAMPLE_TEXT.slice();
        poolIndex = 0;
        lane = 0;
        fillStream();
        if (mbDanmaku) mbDanmaku.textContent = "";
        if (spawnTimer) { clearInterval(spawnTimer); spawnTimer = null; }
        startDanmaku();
        toast("已清空我贴的留言");
      });
    }

    startDanmaku();

    /* ---- 表单：表情、字数、校验、提交 ---- */
    function countChars() {
      if (mbCount) mbCount.textContent = String(mbText.value.length);
    }
    mbText.addEventListener("input", function () {
      countChars();
      if (mbText.value.trim()) {
        mbText.classList.remove("invalid");
        mbError.hidden = true;
      }
    });
    Array.prototype.forEach.call(mbForm.querySelectorAll(".mb-emoji button"), function (b) {
      b.addEventListener("click", function () {
        mbText.value += b.getAttribute("data-emoji");
        mbText.focus();
        countChars();
      });
    });

    mbForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var text = mbText.value.trim();
      if (!text) {
        mbError.hidden = false;
        mbText.classList.add("invalid");
        mbText.focus();
        toast("留言还是空的哦～");
        setTimeout(function () { mbText.classList.remove("invalid"); }, 500);
        return;
      }
      var fresh = { id: "m" + Date.now(), name: "匿名同学", text: text, time: stamp() };
      mine.unshift(fresh);
      save(mine);
      /* 内容池刷新：新留言之后会循环飞过，自己这条先高亮闪一下 */
      pool = SAMPLE_TEXT.concat(mine.map(function (m) { return m.text; }));
      fillStream();
      spawnBullet(text, true);
      mbForm.reset();
      countChars();
      mbError.hidden = true;
      toast("留言已飞过，谢谢你 ✦");
    });

    /* Ctrl / Cmd + Enter 快捷提交 */
    mbText.addEventListener("keydown", function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
        ev.preventDefault();
        if (mbForm.requestSubmit) mbForm.requestSubmit();
        else mbForm.dispatchEvent(new Event("submit", { cancelable: true }));
      }
    });
  }
})();
