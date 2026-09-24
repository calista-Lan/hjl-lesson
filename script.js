/* 互动设计：书签绳进度 / 翻页揭示 / 索引书签高亮 / 纸片微倾 / 打字机
   / 铅笔圈注 / 速写本拖动 / 藏书章盖印 / 借书卡留言 */
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("js");

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. 书签绳：随阅读进度向右抽出的一根红线 ---------- */
  var rail = document.querySelector(".bookmark-rail");
  function onScroll() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - doc.clientHeight;
    var p = max > 0 ? (doc.scrollTop || document.body.scrollTop) / max : 0;
    if (rail) rail.style.width = (p * 100).toFixed(2) + "%";
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- 2. 翻页揭示：进入视口的书页从右侧翻入，铅笔圈注同时被描出来 ---------- */
  var revealEls = document.querySelectorAll(".section > .container");
  Array.prototype.forEach.call(revealEls, function (el) { el.classList.add("reveal"); });
  function revealDone(el) {
    // 揭示结束后移除 reveal，让元素恢复自身更跟手的过渡（纸片微倾等）
    el.classList.remove("reveal");
  }
  function drawLoops(el) {
    // 圈注：给 SVG 描边加 .drawn，stroke-dashoffset 从 1 走到 0，像被铅笔画出来
    Array.prototype.forEach.call(el.querySelectorAll(".pencil-loop"), function (s) {
      s.classList.add("drawn");
    });
  }
  /* 显示一张书页：加 .in 触发翻页过渡，同时把圈注描出来 */
  function show(el) {
    el.classList.add("in");
    drawLoops(el);
    setTimeout(function () { revealDone(el); }, 900);
  }
  /* 把当前视口里的书页显示出来（自己用 getBoundingClientRect 算，不依赖观察器） */
  function revealInView() {
    Array.prototype.forEach.call(revealEls, function (el) {
      if (el.classList.contains("in")) return;
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92 && r.bottom > 0) show(el);
    });
  }
  /* 兜底：把还没显示的书页一次性全显示出来 */
  function revealAll() {
    Array.prototype.forEach.call(revealEls, function (el) { show(el); });
  }

  if (reduce) {
    revealAll();
  } else {
    var ioFired = false;
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        ioFired = true;
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            show(e.target);
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
      Array.prototype.forEach.call(revealEls, function (el) { io.observe(el); });
    }
    // 兜底 1：滚动时自己算一遍，观察器不可靠也照样能显示
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () { revealInView(); ticking = false; });
    }, { passive: true });
    // 兜底 2：进场 2.6 秒后，先把视口里的显示出来；若观察器一次都没回过话、
    // 且一张书页都没显示，说明它没工作，就全部显示（正常浏览器不会走到这一步）
    setTimeout(function () {
      revealInView();
      if (!ioFired && !document.querySelectorAll(".section > .container.in").length) revealAll();
    }, 2600);
    revealInView();
  }
  // 打印时全部显示（不然打印出来是白纸）
  if (window.matchMedia) {
    var mq = window.matchMedia("print");
    var onPrint = function () { if (mq.matches) revealAll(); };
    if (mq.addEventListener) mq.addEventListener("change", onPrint);
    else if (mq.addListener) mq.addListener(onPrint);
  }

  /* ---------- 3. 索引书签：当前栏目那枚标签抽出来 ---------- */
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll(".site-header nav a")
  );
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute("href")); })
    .filter(Boolean);
  function setActive(id) {
    navLinks.forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("href") === "#" + id);
    });
  }
  /* 用滚动位置判断当前栏目（比观察器可靠，任何环境都能算） */
  function spy() {
    if (!sections.length) return;
    var line = window.innerHeight * 0.35;
    var current = sections[0];
    sections.forEach(function (s) {
      if (s.getBoundingClientRect().top <= line) current = s;
    });
    setActive(current.id);
  }
  window.addEventListener("scroll", spy, { passive: true });
  window.addEventListener("resize", spy);
  spy();
  // 点一下立刻点亮，不等滚动（原生锚点负责跳转）
  navLinks.forEach(function (a) {
    a.addEventListener("click", function () {
      setActive(a.getAttribute("href").slice(1));
    });
  });

  /* ---------- 3b. 翻页：按栏目顺序给每张书页加一行「上一页 / 下一页」 ---------- */
  if (navLinks.length) {
    navLinks.forEach(function (a, i) {
      var sec = document.querySelector(a.getAttribute("href"));
      if (!sec) return;
      var box = sec.querySelector(".container");
      if (!box) return;
      var nav = document.createElement("nav");
      nav.className = "folio-nav";
      nav.setAttribute("aria-label", "翻页");
      var prev = navLinks[i - 1];
      var next = navLinks[i + 1];
      if (prev) {
        var pl = document.createElement("a");
        pl.className = "folio-prev";
        pl.href = prev.getAttribute("href");
        pl.textContent = "← " + prev.textContent.trim();
        nav.appendChild(pl);
      } else {
        var ph = document.createElement("span");
        ph.textContent = "封面之后";
        nav.appendChild(ph);
      }
      if (next) {
        var nl = document.createElement("a");
        nl.className = "folio-next";
        nl.href = next.getAttribute("href");
        nl.textContent = next.textContent.trim() + " →";
        nav.appendChild(nl);
      } else {
        var nh = document.createElement("span");
        nh.textContent = "全书终";
        nav.appendChild(nh);
      }
      box.appendChild(nav);
    });
  }

  /* ---------- 4. 纸片微倾：鼠标在纸面上时，纸片跟着轻轻歪一点（不超过 1 度） ---------- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-tilt]"), function (el) {
    var base = parseFloat(el.getAttribute("data-tilt")) || 0;
    el.addEventListener("pointermove", function (ev) {
      if (reduce) return;
      var r = el.getBoundingClientRect();
      var x = (ev.clientX - r.left) / r.width - 0.5;
      var y = (ev.clientY - r.top) / r.height - 0.5;
      el.style.transform =
        "rotate(" + (base + x * 0.8).toFixed(2) + "deg) translate(" +
        (x * 4).toFixed(1) + "px," + (y * 2.5).toFixed(1) + "px)";
    });
    el.addEventListener("pointerleave", function () { el.style.transform = ""; });
  });

  /* ---------- 5. 打字机：封面的拼音逐字打出 ---------- */
  var tw = document.querySelector("[data-typewriter]");
  if (tw) {
    var full = tw.textContent.trim();
    if (!reduce && full) {
      // 先把完整文本交给屏幕阅读器，避免读到半截的拼音
      tw.setAttribute("aria-label", full);
      tw.textContent = "";
      tw.classList.add("typing");
      var i = 0;
      var timer = setInterval(function () {
        tw.textContent = full.slice(0, ++i);
        if (i >= full.length) {
          clearInterval(timer);
          setTimeout(function () { tw.classList.remove("typing"); }, 1400);
        }
      }, 90);
    }
  }

  /* ---------- 6. 速写本：按住拖动横向翻看，也能用左右方向键 ---------- */
  var sb = document.querySelector("[data-sketchbook]");
  if (sb) {
    var dragging = false;
    var startX = 0;
    var startLeft = 0;
    var movedX = 0;                    // 这次按住一共横向挪了多远
    sb.addEventListener("pointerdown", function (ev) {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      dragging = true;
      movedX = 0;
      startX = ev.clientX;
      startLeft = sb.scrollLeft;
      sb.classList.add("dragging");
    });
    window.addEventListener("pointermove", function (ev) {
      if (!dragging) return;
      var dx = ev.clientX - startX;
      if (Math.abs(dx) > movedX) movedX = Math.abs(dx);
      sb.scrollLeft = startLeft - dx;
    });
    /* 拖完速写本松手时浏览器还会补一次 click，
       挪动超过 8px 就当是翻页，把这次点击吃掉 —— 不然翻便利贴会误跳到摄影站 */
    sb.addEventListener("click", function (ev) {
      if (movedX > 8) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    }, true);
    window.addEventListener("pointerup", function () {
      dragging = false;
      sb.classList.remove("dragging");
    });
    window.addEventListener("pointercancel", function () {
      dragging = false;
      sb.classList.remove("dragging");
    });
    // 键盘：方向键每次翻一张便利贴
    sb.addEventListener("keydown", function (ev) {
      var step = 214;
      if (ev.key === "ArrowRight") {
        sb.scrollBy({ left: step, behavior: reduce ? "auto" : "smooth" });
        ev.preventDefault();
      } else if (ev.key === "ArrowLeft") {
        sb.scrollBy({ left: -step, behavior: reduce ? "auto" : "smooth" });
        ev.preventDefault();
      }
    });
  }

  /* ---------- 7. 藏书章：点一下重新盖一次 ---------- */
  var stamp = document.querySelector(".stamp");
  if (stamp) {
    stamp.addEventListener("click", function () {
      stamp.classList.remove("stamping");
      void stamp.offsetWidth; // 强制重排，让动画能连续触发
      stamp.classList.add("stamping");
    });
  }

  /* ---------- 8. 回到封面 ---------- */
  var toCover = document.querySelector(".to-cover");
  if (toCover) {
    window.addEventListener("scroll", function () {
      if (window.scrollY > window.innerHeight * 0.8) toCover.classList.add("show");
      else toCover.classList.remove("show");
    }, { passive: true });
    toCover.addEventListener("click", function () {
      var target = document.querySelector("#about");
      if (target) target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    });
  }

  /* ---------- 9. 留言板 = 借书卡：登记 / 本地保存 / 清空 / 空状态 ---------- */
  var mbForm = document.querySelector(".mb-form");
  if (mbForm) {
    var mbText = mbForm.querySelector("#mb-message");
    var mbContact = mbForm.querySelector("#mb-contact");
    var mbCount = mbForm.querySelector("[data-count]");
    var mbError = mbForm.querySelector(".mb-error");
    var mbNote = document.querySelector(".mb-note");
    var mbToast = document.querySelector(".mb-toast");
    var ledger = document.querySelector("[data-ledger]");
    var ledgerEmpty = document.querySelector("[data-ledger-empty]");
    var mbReset = document.querySelector(".mb-reset");
    var STORE_KEY = "hjl-message-board-v1";
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

    /* 借书卡：只登记真实来访者写的，不放任何示例数据 */
    function render(freshText) {
      if (!ledger) return;
      ledger.textContent = "";
      var rows = [];
      mine.forEach(function (m) {
        rows.push({ text: m.text, date: m.time || "—", kind: "mine" });
      });
      rows.forEach(function (r) {
        var li = document.createElement("li");
        li.className = "ledger-row";
        li.setAttribute("data-kind", r.kind);
        var d = document.createElement("span");
        d.className = "ledger-date";
        d.textContent = r.date;
        var t = document.createElement("span");
        t.className = "ledger-text";
        t.textContent = r.text;                 // 用 textContent 渲染，防 XSS
        li.appendChild(d);
        li.appendChild(t);
        ledger.appendChild(li);
      });
      if (ledgerEmpty) ledgerEmpty.hidden = rows.length > 0;
      // 刚贴的那一行做一次落下动画
      if (freshText) {
        var first = ledger.querySelector(".ledger-row");
        if (first) first.classList.add("fresh");
      }
    }

    function countChars() {
      if (!mbCount) return;
      var n = mbText.value.length;
      mbCount.textContent = String(n);
      // 快写满 200 字时把计数器变成砖红，给个提醒
      mbCount.classList.toggle("near", n > 170);
    }

    render();
    countChars();

    mbText.addEventListener("input", function () {
      countChars();
      if (mbText.value.trim()) {
        mbText.classList.remove("invalid");
        mbError.hidden = true;
      }
    });

    mbForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var text = mbText.value.trim();
      if (!text) {
        mbError.hidden = false;
        mbText.classList.add("invalid");
        if (mbNote) {
          mbNote.classList.remove("shake");
          void mbNote.offsetWidth;
          mbNote.classList.add("shake");
        }
        mbText.focus();
        toast("留言还是空的哦～");
        setTimeout(function () { mbText.classList.remove("invalid"); }, 600);
        return;
      }
      mine.unshift({ text: text, contact: mbContact.value.trim(), time: stamp() });
      save(mine);
      render(true);
      mbForm.reset();
      countChars();
      mbError.hidden = true;
      toast("已登记到借书卡上，谢谢你");
    });

    /* 清空：清掉本机登记的全部留言 */
    if (mbReset) {
      mbReset.addEventListener("click", function () {
        mine = [];
        save(mine);
        render();
        toast("借书卡已清空");
      });
    }

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
