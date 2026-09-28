/* =========================================================
   撕票：封面底部的存根
   ---------------------------------------------------------
   · 桌面端：按住票面往下拖，拖过 46px 就算撕下来
   · 所有设备：点一下票面也能撕（触屏的纵向拖动留给页面滚动）
   · 撕下之后再点一下，存根贴回封面
   · 锯齿撕口用「固定种子」的随机数生成，每次打开形状都一样
   配合 tear-ticket.css 使用。
   ========================================================= */
(function () {
  "use strict";

  var root = document.querySelector("[data-tear]");
  if (!root) return;

  var sheet = document.querySelector(".cover-sheet");
  var stub = root.querySelector("[data-tear-stub]");
  if (!sheet || !stub) return;

  var hint = root.querySelector(".tear-stub-hint");

  var THRESHOLD = 46;  /* 拖过这么多像素算撕下 */
  var EDGE_N = 36;     /* 撕口锯齿分成多少段 */

  /* ---------- 撕口形状 ---------- */
  function buildEdge() {
    var rand = seeded(20260901);
    var pts = [];
    var i;

    for (i = 0; i <= EDGE_N; i++) {
      /* 撕口分三层叠加，才像手撕的：
         一层 1.2-3.6px 的细碎毛边 +
         每 5 段一道中等裂口 +
         每 11 段一道更深的裂口 */
      var y = 1.2 + rand() * 2.4;
      if (i % 5 === 2) y += 2.5 + rand() * 3.5;
      if (i % 11 === 6) y += 3 + rand() * 3;
      if (y > 11) y = 11;
      pts.push(xAt(i) + "% " + y.toFixed(2) + "px");
    }

    /* 上缘锯齿、其余三边直角。
       票面的撕口和封面的撕痕共用同一条曲线：
       票面带着它落下去，封面用它把自己的底边啃掉一块，两边才对得上。 */
    var poly = "polygon(" + pts.join(", ") + ", 100% 100%, 0% 100%)";
    root.style.setProperty("--tear-edge", poly);
    root.style.setProperty("--tear-scar", poly);
  }

  function xAt(i) {
    return ((i / EDGE_N) * 100).toFixed(2);
  }

  /* 固定种子伪随机数：撕口形状稳定，不会每次刷新都变样 */
  function seeded(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ---------- 状态 ---------- */
  var torn = false;
  var dragging = false;
  var suppressClick = false;
  var startX = 0;
  var startY = 0;
  var dy = 0;
  var dx = 0;

  function paint() {
    /* 拖得越远，票面越往前倾，像被手带着翻下来 */
    var lean = Math.min(dy / THRESHOLD, 1.4);
    stub.style.transform =
      "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) " +
      "rotate(" + (dx * 0.12).toFixed(2) + "deg) " +
      "rotateX(" + (-lean * 14).toFixed(1) + "deg)";
  }

  function reset() {
    stub.style.transform = "";
  }

  function tearOff() {
    torn = true;
    root.classList.add("is-torn");
    sheet.classList.add("tear-open");
    stub.setAttribute("aria-pressed", "true");
    if (hint) hint.textContent = "点我贴回";

    /* 落地距离 = 票面自身高度 + 一点间隙。
       封面收拢了多少，票面就得往下落多少，才会正好停在封面下方，
       而不是留在原地被封面压住。 */
    var fall = stub.offsetHeight + 12;
    stub.style.transform = "translate(18px, " + fall + "px) rotate(3.2deg)";
  }

  function stickBack() {
    torn = false;
    root.classList.remove("is-torn");
    sheet.classList.remove("tear-open");
    stub.setAttribute("aria-pressed", "false");
    if (hint) hint.textContent = "按住往下撕";
    reset();
  }

  /* ---------- 拖动撕票 ---------- */
  function onDown(ev) {
    if (torn) return;
    if (ev.pointerType === "mouse" && ev.button !== 0) return;

    dragging = true;
    suppressClick = false;
    startX = ev.clientX;
    startY = ev.clientY;
    dy = 0;
    dx = 0;
    root.classList.add("is-dragging");

    /* 鼠标才捕获指针：触屏上要让浏览器还能判滚动 */
    if (ev.pointerType === "mouse" && stub.setPointerCapture) {
      stub.setPointerCapture(ev.pointerId);
    }
  }

  function onMove(ev) {
    if (!dragging) return;
    dy = Math.max(0, ev.clientY - startY);  /* 只允许往下撕 */
    dx = (ev.clientX - startX) * 0.25;     /* 横向只带一点点偏移 */
    paint();
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    root.classList.remove("is-dragging");

    /* 拖过了就别再当成一次点击，否则撕下后会被立刻贴回去 */
    if (dy > 4) suppressClick = true;

    if (dy >= THRESHOLD) tearOff();
    else reset();
  }

  /* 触屏上一划就被判成滚动，浏览器会发 pointercancel，这里跟着收尾 */
  function onCancel() {
    if (!dragging) return;
    dragging = false;
    root.classList.remove("is-dragging");
    reset();
  }

  stub.addEventListener("pointerdown", onDown);
  stub.addEventListener("pointermove", onMove);
  stub.addEventListener("pointerup", onUp);
  stub.addEventListener("pointercancel", onCancel);

  /* 点击 = 撕下 / 贴回，键盘用户按回车也走这里 */
  stub.addEventListener("click", function () {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (torn) stickBack();
    else tearOff();
  });

  buildEdge();
})();
