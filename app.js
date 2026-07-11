(function () {
  "use strict";

  // ---- Theme toggle ----
  var THEME_KEY = "reloc-theme-v2";
  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");

  function applyTheme(t) {
    if (t === "light" || t === "dark") {
      root.setAttribute("data-theme", t);
    } else {
      root.removeAttribute("data-theme");
    }
    if (toggle) {
      var isDark = t === "dark" ||
        (!t && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      toggle.querySelector(".lbl").textContent = isDark ? "\u0421\u0432\u0435\u0442\u043b\u0430\u044f" : "\u0422\u0451\u043c\u043d\u0430\u044f";
      toggle.querySelector(".ic").textContent = isDark ? "\u2600" : "\u263E";
    }
  }

  var savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
  applyTheme(savedTheme);

  if (toggle) {
    toggle.addEventListener("click", function () {
      var current = root.getAttribute("data-theme");
      var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      var effective = current || (prefersDark ? "dark" : "light");
      var next = effective === "dark" ? "light" : "dark";
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      applyTheme(next);
    });
  }

  // ---- Checkboxes: state + progress ----
  var CHECK_KEY = "reloc-checks-v2";
  var boxes = [];
  var list = document.querySelectorAll("ul.checks input[type=checkbox]");
  for (var i = 0; i < list.length; i++) { boxes.push(list[i]); }

  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(CHECK_KEY) || "{}"); } catch (e) { saved = {}; }

  boxes.forEach(function (b, i) {
    b.dataset.id = "c" + i;
    if (saved["c" + i]) b.checked = true;
    b.addEventListener("change", function () { persist(); updateProgress(); });
  });

  function persist() {
    var out = {};
    boxes.forEach(function (b) { if (b.checked) out[b.dataset.id] = 1; });
    try { localStorage.setItem(CHECK_KEY, JSON.stringify(out)); } catch (e) {}
  }

  function updateProgress() {
    var done = 0;
    for (var i = 0; i < boxes.length; i++) { if (boxes[i].checked) done++; }
    var total = boxes.length;
    var pgDone = document.getElementById("pg-done");
    var pgTotal = document.getElementById("pg-total");
    var pgBar = document.getElementById("pg-bar");
    if (pgDone) pgDone.textContent = done;
    if (pgTotal) pgTotal.textContent = total;
    if (pgBar) pgBar.style.width = (total ? (done / total * 100) : 0) + "%";
  }

  var resetBtn = document.getElementById("reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (!confirm("\u0421\u043d\u044f\u0442\u044c \u0432\u0441\u0435 \u0433\u0430\u043b\u043e\u0447\u043a\u0438?")) return;
      boxes.forEach(function (b) { b.checked = false; });
      try { localStorage.removeItem(CHECK_KEY); } catch (e) {}
      updateProgress();
    });
  }

  updateProgress();

  // ---- Countdown ----
  function countdown() {
    var target = new Date(2026, 7, 10, 0, 0, 0);
    var now = new Date();
    var diff = Math.ceil((target - now) / 86400000);
    var el = document.getElementById("cd-num");
    if (!el) return;
    el.textContent = diff > 0 ? String(diff) : (diff === 0 ? "0" : "\u2014");
  }
  countdown();

  // ---- USD/RUB rate ----
  var USD_RATE = 76.40;
  var rateEl = document.getElementById("usd-rate");
  var rateDateEl = document.getElementById("rate-date");

  function fmtRate(r) {
    return r.toFixed(2).replace(".", ",") + " \u20bd";
  }

  function convertPrices(rate) {
    var spans = document.querySelectorAll(".price-rub");
    for (var i = 0; i < spans.length; i++) {
      var el = spans[i];
      var lo = parseFloat(el.dataset.usd);
      var hi = parseFloat(el.dataset.usdMax);
      if (isNaN(lo) || isNaN(hi)) continue;
      var rubLo = Math.round(lo * rate);
      var rubHi = Math.round(hi * rate);
      var sLo = rubLo >= 1000 ? Math.round(rubLo / 1000) + "k" : String(rubLo);
      var sHi = rubHi >= 1000 ? Math.round(rubHi / 1000) + "k" : String(rubHi);
      var rs = rate.toFixed(1).replace(".", ",");
      el.textContent = "\u00b7 " + sLo + "\u2013" + sHi + " \u20bd (\u043a\u0443\u0440\u0441 " + rs + " \u20bd/$)";
    }
  }

  function fetchRate() {
    var cached = null;
    try { cached = localStorage.getItem("reloc-usd-rate-v2"); } catch (e) {}
    if (cached) {
      try {
        var p = JSON.parse(cached);
        if (p && p.rate && p.ts && (Date.now() - p.ts < 3600000)) {
          USD_RATE = p.rate;
          if (rateEl) rateEl.textContent = fmtRate(USD_RATE);
          convertPrices(USD_RATE);
          return;
        }
      } catch (e) {}
    }

    var xhr = new XMLHttpRequest();
    xhr.open("GET", "https://open.er-api.com/v6/latest/USD");
    xhr.timeout = 10000;
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data && data.rates && data.rates.RUB) {
            USD_RATE = data.rates.RUB;
            if (rateEl) rateEl.textContent = fmtRate(USD_RATE);
            if (rateDateEl) rateDateEl.textContent = "\u043a\u0443\u0440\u0441 open.er-api.com \u00b7 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435 \u0440\u0430\u0437 \u0432 \u0447\u0430\u0441";
            try { localStorage.setItem("reloc-usd-rate-v2", JSON.stringify({ rate: USD_RATE, ts: Date.now() })); } catch (e) {}
            convertPrices(USD_RATE);
            return;
          }
        } catch (e) {}
      }
      useFallback();
    };
    xhr.onerror = useFallback;
    xhr.ontimeout = useFallback;
    xhr.send();
  }

  function useFallback() {
    USD_RATE = 76.40;
    if (rateEl) rateEl.textContent = fmtRate(USD_RATE);
    if (rateDateEl) rateDateEl.textContent = "\u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e";
    convertPrices(USD_RATE);
  }

  fetchRate();

  // ---- Tabs ----
  var tabContainer = document.getElementById("country-tabs");
  if (tabContainer) {
    var btns = tabContainer.querySelectorAll(".tab-btn");
    var panels = tabContainer.querySelectorAll(".tab-panel");

    for (var t = 0; t < btns.length; t++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var tab = btn.dataset.tab;
          for (var j = 0; j < btns.length; j++) {
            btns[j].classList.remove("active");
            btns[j].setAttribute("aria-selected", "false");
          }
          for (var k = 0; k < panels.length; k++) {
            panels[k].classList.remove("active");
          }
          btn.classList.add("active");
          btn.setAttribute("aria-selected", "true");
          var panel = document.getElementById("tab-" + tab);
          if (panel) panel.classList.add("active");
        });
      })(btns[t]);
    }
  }

  // ---- Service worker ----
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").then(function () {
        var badge = document.getElementById("sw-badge");
        if (badge) badge.hidden = false;
      }).catch(function () {});
    });
  }
})();
