(function () {
  "use strict";

  // ---- Constants ----
  var COUNTRY_KEY = "reloc-country";
  var CHECK_KEY = "reloc-checks-v3";
  var DEPARTURE_KEY = "reloc-departure-date";
  var THEME_KEY = "reloc-theme-v3";
  var PHASE_KEY = "reloc-collapsed-v3";
  var MONTHS_RU = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];

  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");

  // ---- Theme toggle ----
  function applyTheme(t) {
    if (t === "light" || t === "dark") {
      root.setAttribute("data-theme", t);
    } else {
      root.removeAttribute("data-theme");
    }
    if (toggle) {
      var isDark = t === "dark" ||
        (!t && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      toggle.querySelector(".lbl").textContent = isDark ? "Светлая" : "Тёмная";
      toggle.querySelector(".ic").textContent = isDark ? "☀" : "☾";
    }
  }

  var savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
  applyTheme(savedTheme || "light");

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

  // ---- Departure date ----
  function getDepartureDate() {
    var saved = null;
    try { saved = localStorage.getItem(DEPARTURE_KEY); } catch (e) {}
    if (saved) {
      var d = new Date(saved + "T00:00:00");
      if (!isNaN(d.getTime())) return d;
    }
    // Default: Aug 10, 2026
    return new Date(2026, 7, 10, 0, 0, 0);
  }

  function formatDate(d) {
    return d.getDate() + " " + MONTHS_RU[d.getMonth()] + " " + d.getFullYear();
  }

  function countdown() {
    var target = getDepartureDate();
    var now = new Date();
    var diff = Math.ceil((target - now) / 86400000);
    var el = document.getElementById("cd-num");
    if (el) el.textContent = diff > 0 ? String(diff) : (diff === 0 ? "0" : "—");

    var departureDisplay = document.getElementById("departure-display");
    var departureDays = document.getElementById("departure-days");
    if (departureDisplay) departureDisplay.textContent = formatDate(target);
    if (departureDays) {
      if (diff > 0) departureDays.textContent = "через " + diff + " дн.";
      else if (diff === 0) departureDays.textContent = "сегодня!";
      else departureDays.textContent = "вылет состоялся";
    }
  }

  function syncDateInput() {
    var d = getDepartureDate();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    var departureInput = document.getElementById("departure-date");
    if (departureInput) departureInput.value = y + "-" + m + "-" + day;
  }

  var departureInput = document.getElementById("departure-date");
  if (departureInput) {
    departureInput.addEventListener("change", function () {
      if (departureInput.value) {
        try { localStorage.setItem(DEPARTURE_KEY, departureInput.value); } catch (e) {}
        countdown();
        // Re-render timeline with new dates if a country is selected
        var country = getSelectedCountry();
        if (country) renderTimeline(country);
      }
    });
  }

  countdown();
  syncDateInput();

  // ---- USD/RUB rate ----
  var USD_RATE = 76.40;
  var rateEl = document.getElementById("usd-rate");
  var rateDateEl = document.getElementById("rate-date");

  function fmtRate(r) {
    return r.toFixed(2).replace(".", ",") + " ₽";
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
          updateBudgetDisplay();
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
            if (rateDateEl) rateDateEl.textContent = "курс open.er-api.com · обновление раз в час";
            try { localStorage.setItem("reloc-usd-rate-v2", JSON.stringify({ rate: USD_RATE, ts: Date.now() })); } catch (e) {}
            updateBudgetDisplay();
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
    if (rateDateEl) rateDateEl.textContent = "по умолчанию";
    updateBudgetDisplay();
  }

  function updateBudgetDisplay() {
    var country = getSelectedCountry();
    if (!country || !COUNTRIES[country]) return;
    var c = COUNTRIES[country];
    var budgetEl = document.getElementById("budget-display");
    var budgetRub = document.getElementById("budget-rub");
    if (budgetEl) budgetEl.textContent = "~$" + c.priceLo + "–" + c.priceHi + " / мес";
    if (budgetRub) {
      var rubLo = Math.round(c.priceLo * USD_RATE);
      var rubHi = Math.round(c.priceHi * USD_RATE);
      var sLo = rubLo >= 1000 ? Math.round(rubLo / 1000) + "k" : String(rubLo);
      var sHi = rubHi >= 1000 ? Math.round(rubHi / 1000) + "k" : String(rubHi);
      budgetRub.textContent = "≈" + sLo + "–" + sHi + " ₽ (курс " + USD_RATE.toFixed(1).replace(".", ",") + " ₽/$)";
    }
  }

  fetchRate();

  // ---- Country selection ----
  function getSelectedCountry() {
    try { return localStorage.getItem(COUNTRY_KEY); } catch (e) { return null; }
  }

  function setSelectedCountry(key) {
    try { localStorage.setItem(COUNTRY_KEY, key); } catch (e) {}
  }

  function clearSelectedCountry() {
    try { localStorage.removeItem(COUNTRY_KEY); } catch (e) {}
  }

  var selectSection = document.getElementById("country-select-section");
  var roadmapSection = document.getElementById("roadmap-section");
  var deepSection = document.getElementById("deep-section");
  var budgetDisplay = document.getElementById("budget-display");
  var budgetRub = document.getElementById("budget-rub");
  var countryDisplay = document.getElementById("country-display");
  var countryVisa = document.getElementById("country-visa");
  var criticalText = document.getElementById("critical-text");
  var countryCard = document.getElementById("country-card");
  var changeCountryBtn = document.getElementById("change-country-btn");

  // Build country selection grid
  function buildCountryGrid() {
    var grid = document.getElementById("country-select-grid");
    if (!grid) return;
    grid.innerHTML = "";

    var keys = Object.keys(COUNTRIES);
    for (var i = 0; i < keys.length; i++) {
      (function (key) {
        var c = COUNTRIES[key];
        var card = document.createElement("button");
        card.type = "button";
        card.className = "country-select-card " + (c.priceClass || "");
        card.dataset.country = key;

        var flagHtml = "";
        if (c.flagCustom === "ab") {
          flagHtml = '<span class="ab-flag"></span>';
        } else if (c.flagUrl) {
          flagHtml = '<img src="' + c.flagUrl + '" alt="" class="flag-img" width="28" height="20">';
        }

        card.innerHTML =
          '<div class="csc-flag">' + flagHtml + '</div>' +
          '<div class="csc-name">' + c.name + '</div>' +
          '<div class="csc-city">' + c.city + '</div>' +
          '<div class="csc-price">' + c.price + '</div>' +
          '<div class="csc-visa">' + c.visa + '</div>';

        card.addEventListener("click", function () {
          selectCountry(key);
        });

        grid.appendChild(card);
      })(keys[i]);
    }
  }

  function selectCountry(key) {
    if (!COUNTRIES[key]) return;
    setSelectedCountry(key);
    showRoadmap(key);
  }

  function showRoadmap(key) {
    var c = COUNTRIES[key];
    if (!c) return;

    // Hide select, show roadmap
    selectSection.style.display = "none";
    roadmapSection.style.display = "";
    deepSection.style.display = "";

    // Update header stats
    if (countryDisplay) countryDisplay.textContent = c.name;
    if (countryVisa) countryVisa.textContent = c.visa + " · " + c.timezone;
    if (criticalText) {
      criticalText.innerHTML = "<b>" + c.critical + "</b>";
    }
    updateBudgetDisplay();

    // Render country card
    renderCountryCard(key);

    // Render timeline
    renderTimeline(key);

    // Render deep block
    renderDeepBlock(key);
  }

  function showCountrySelect() {
    selectSection.style.display = "";
    roadmapSection.style.display = "none";
    deepSection.style.display = "none";
    // Reset stats
    if (countryDisplay) countryDisplay.textContent = "Выбери страну";
    if (countryVisa) countryVisa.textContent = "";
    if (budgetDisplay) budgetDisplay.textContent = "—";
    if (budgetRub) budgetRub.textContent = "";
    if (criticalText) {
      criticalText.innerHTML = "<b>Самый узкий узел — не виза, а деньги.</b> Платёжный контур (наличные&nbsp;USD + USDT + карта иностранного банка) надо начать собирать <b>в&nbsp;первые дни</b> — он готовится дольше всего.";
    }
    // Reset progress
    var pgDone = document.getElementById("pg-done");
    var pgTotal = document.getElementById("pg-total");
    var pgBar = document.getElementById("pg-bar");
    if (pgDone) pgDone.textContent = "0";
    if (pgTotal) pgTotal.textContent = "0";
    if (pgBar) pgBar.style.width = "0%";
    // Clear timeline
    var timeline = document.getElementById("timeline");
    if (timeline) timeline.innerHTML = "";
    // Clear country card
    if (countryCard) countryCard.innerHTML = "";
  }

  if (changeCountryBtn) {
    changeCountryBtn.addEventListener("click", function () {
      clearSelectedCountry();
      showCountrySelect();
    });
  }

  // ---- Timeline rendering ----
  function getWeekDates(weekNum) {
    var dep = getDepartureDate();
    // Week 0 starts 28 days before departure
    var weekStart = new Date(dep);
    weekStart.setDate(weekStart.getDate() - 28 + weekNum * 7);
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Special cases
    if (weekNum === "arrive") {
      return "На месте · первая неделя";
    }
    if (weekNum === 3) {
      // Last week before departure
      var finalStart = new Date(dep);
      finalStart.setDate(finalStart.getDate() - 7);
      return formatDateShort(finalStart) + "–" + formatDateShort(dep) + " · Неделя " + weekNum;
    }

    return formatDateShort(weekStart) + "–" + formatDateShort(weekEnd) + " · Неделя " + weekNum;
  }

  function formatDateShort(d) {
    return d.getDate() + " " + MONTHS_RU[d.getMonth()];
  }

  function renderCountryCard(countryKey) {
    var c = COUNTRIES[countryKey];
    if (!c || !countryCard) return;

    var specsHtml = "";
    if (c.specs && c.specs.length) {
      specsHtml = '<dl class="specs">';
      for (var i = 0; i < c.specs.length; i++) {
        var s = c.specs[i];
        specsHtml += '<div><dt>' + s.dt + '</dt><dd>' + s.dd + '</dd></div>';
      }
      specsHtml += '</dl>';
    }

    var flagHtml = "";
    if (c.flagCustom === "ab") {
      flagHtml = '<span class="ab-flag"></span>';
    } else if (c.flagUrl) {
      flagHtml = '<img src="' + c.flagUrl + '" alt="" class="flag-img" width="28" height="20">';
    }

    countryCard.innerHTML =
      '<div class="cc-top">' +
      '<span class="cc-flag">' + flagHtml + '</span>' +
      '<span class="cc-name">' + c.country + '</span>' +
      (c.city ? '<span class="cc-city">' + c.city + '</span>' : '') +
      (c.price ? '<span class="cc-price">' + c.price + '</span>' : '') +
      '</div>' +
      specsHtml;
  }

  function renderTimeline(countryKey) {
    var c = COUNTRIES[countryKey];
    if (!c) return;

    var timeline = document.getElementById("timeline");
    if (!timeline) return;
    timeline.innerHTML = "";

    var weekKeys = ["0", "1", "2", "3", "arrive"];

    for (var w = 0; w < weekKeys.length; w++) {
      var wk = weekKeys[w];
      var week = c.weeks[wk];
      if (!week) continue;

      var phase = document.createElement("div");
      phase.className = "phase";
      if (wk === "arrive") phase.className += " arrive";

      var dateLabel = getWeekDates(wk);
      // For week 3 (finał), override title format
      if (wk === 3) {
        var dep = getDepartureDate();
        var finStart = new Date(dep);
        finStart.setDate(finStart.getDate() - 7);
        dateLabel = formatDateShort(finStart) + "–" + formatDateShort(dep) + " · Неделя 3";
      }

      var cardHtml =
        '<div class="card">' +
        '<div class="phase-head">' +
        '<span class="phase-date">' + dateLabel + '</span>' +
        '<span class="phase-title">' + week.title + '</span>' +
        '</div>' +
        '<ul class="checks">';

      for (var t = 0; t < week.tasks.length; t++) {
        var task = week.tasks[t];
        var tagHtml = "";
        if (task.tag === "crit" && task.tagText) {
          tagHtml = '<span class="tag crit">' + task.tagText + '</span>';
        } else if (task.tag === "both" && task.tagText) {
          tagHtml = '<span class="tag both">' + task.tagText + '</span>';
        }

        var smallHtml = task.small ? "<small>" + task.small + "</small>" : "";

        cardHtml +=
          '<li><label class="chk"><input type="checkbox">' +
          '<span class="box"></span>' +
          '<span class="chk-txt">' + tagHtml + task.text + smallHtml + '</span>' +
          '</label></li>';
      }

      cardHtml += '</ul></div>';
      phase.innerHTML = cardHtml;
      timeline.appendChild(phase);
    }

    // Re-bind checkboxes
    bindCheckboxes();
    updateProgress();
    updatePhaseDone();
    collapsePhases();
  }

  // ---- Deep block rendering ----
  function renderDeepBlock(countryKey) {
    var c = COUNTRIES[countryKey];
    if (!c || !c.deep) return;

    var body = document.getElementById("deep-body");
    if (!body) return;
    body.innerHTML = "";

    var deep = c.deep;

    // Tiles
    var tilesHtml = '<div class="deep-tiles">';
    for (var i = 0; i < deep.tiles.length; i++) {
      var tile = deep.tiles[i];
      tilesHtml += '<div class="tile"><div class="k">' + tile.k + '</div><div class="v">' + tile.v + '</div><div class="d">' + tile.d + '</div></div>';
    }
    tilesHtml += '</div>';

    // Grid. Налоги РФ одинаковы для всех стран — блок общий, живёт в RF_TAXES
    // (countries.js) и подставляется последним пунктом, чтобы не дублировать
    // длинный текст в каждой стране и править закон в одном месте.
    var grid = typeof RF_TAXES !== "undefined" ? deep.grid.concat([RF_TAXES]) : deep.grid;
    var gridHtml = '<div class="deep-grid">';
    for (var j = 0; j < grid.length; j++) {
      var g = grid[j];
      gridHtml += '<div class="info"><div class="ik">' + g.ik + '</div><div class="iv">' + g.iv + '</div></div>';
    }
    gridHtml += '</div>';

    // Risk
    var riskHtml = '<div class="deep-risk"><span class="rk">Риск · РФ</span><span class="rv">' + deep.risk + '</span></div>';

    // Source
    var srcHtml = '<div class="deep-src">' + deep.src + '</div>';

    // Weather (optional)
    var weatherHtml = "";
    if (c.weather && c.weather.seasons && c.weather.seasons.length) {
      var w = c.weather;
      weatherHtml = '<div class="deep-sub-h">☀ Погода и сезоны</div>';
      if (w.climate) weatherHtml += '<div class="wx-climate">' + w.climate + '</div>';
      weatherHtml += '<div class="wx-grid">';
      for (var s = 0; s < w.seasons.length; s++) {
        var se = w.seasons[s];
        weatherHtml +=
          '<div class="wx-card">' +
          '<div class="wx-head"><span class="wx-s">' + se.s + '</span><span class="wx-m">' + se.m + '</span></div>' +
          '<div class="wx-temp"><b>' + se.hi + '°</b><span>ночью ' + se.lo + '°</span></div>' +
          '<div class="wx-d">' + se.d + '</div>' +
          '</div>';
      }
      weatherHtml += '</div>';
      // .wx-haz — flex-контейнер, поэтому текст оборачиваем в свой span:
      // иначе <b> внутри hazards становится отдельным flex-элементом и уезжает в свою колонку.
      if (w.hazards) weatherHtml += '<div class="wx-haz"><span class="wx-haz-k">Катаклизмы</span><span class="wx-haz-v">' + w.hazards + '</span></div>';
      if (w.src) weatherHtml += '<div class="deep-src">' + w.src + '</div>';
    }

    // Culture (optional)
    var cultureHtml = "";
    if (c.culture && (c.culture.ok || c.culture.avoid)) {
      var cu = c.culture;
      cultureHtml = '<div class="deep-sub-h">👥 Менталитет и обычаи</div><div class="cult-grid">';
      if (cu.ok && cu.ok.length) {
        cultureHtml += '<div class="cult-col ok"><div class="cult-h">Принято</div><ul>';
        for (var o = 0; o < cu.ok.length; o++) cultureHtml += '<li>' + cu.ok[o] + '</li>';
        cultureHtml += '</ul></div>';
      }
      if (cu.avoid && cu.avoid.length) {
        cultureHtml += '<div class="cult-col no"><div class="cult-h">Избегать</div><ul>';
        for (var n = 0; n < cu.avoid.length; n++) cultureHtml += '<li>' + cu.avoid[n] + '</li>';
        cultureHtml += '</ul></div>';
      }
      cultureHtml += '</div>';
      if (cu.src) cultureHtml += '<div class="deep-src">' + cu.src + '</div>';
    }

    // Asylum / deportation (optional)
    var asylumHtml = "";
    if (c.asylum) {
      var a = c.asylum;
      var riskClass = a.risk === "high" ? "risk-high" : a.risk === "medium" ? "risk-medium" : "risk-low";
      var riskLabel = a.risk === "high" ? "ВЫСОКИЙ" : a.risk === "medium" ? "СРЕДНИЙ" : "НИЗКИЙ";
      asylumHtml =
        '<div class="deep-sub-h">🛡 ' + a.title + '</div>' +
        '<div class="asylum-block ' + riskClass + '">' +
        '<div class="asylum-verdict"><span class="asylum-badge ' + riskClass + '">' + riskLabel + ' РИСК</span> ' + a.verdict + '</div>' +
        '<div class="asylum-grid">' +
        '<div class="asylum-row"><span class="asylum-k">Договор</span><span class="asylum-v">' + a.treaty + '</span></div>' +
        '<div class="asylum-row"><span class="asylum-k">Защита</span><span class="asylum-v">' + a.protection + '</span></div>' +
        '<div class="asylum-row"><span class="asylum-k">Прецедент</span><span class="asylum-v">' + a.precedent + '</span></div>' +
        '</div></div>';
    }

    // Въезд с «токсичной биографией» (optional). Переиспользует стили asylum-блока:
    // структура та же (вердикт с бейджем + строки «ключ → значение»), плодить CSS незачем.
    var borderHtml = "";
    if (c.border) {
      var br = c.border;
      var bClass = br.risk === "high" ? "risk-high" : br.risk === "medium" ? "risk-medium" : "risk-low";
      var bLabel = br.risk === "high" ? "ПРОВЕРИТЬ" : br.risk === "medium" ? "ЕСТЬ НЮАНСЫ" : "ЧИСТО";
      borderHtml =
        '<div class="deep-sub-h">🛂 ' + br.title + '</div>' +
        '<div class="asylum-block ' + bClass + '">' +
        '<div class="asylum-verdict"><span class="asylum-badge ' + bClass + '">' + bLabel + '</span> ' + br.verdict + '</div>' +
        '<div class="asylum-grid">' +
        '<div class="asylum-row"><span class="asylum-k">Крым</span><span class="asylum-v">' + br.crimea + '</span></div>' +
        '<div class="asylum-row"><span class="asylum-k">ДНР / ЛНР</span><span class="asylum-v">' + br.ldnr + '</span></div>' +
        '<div class="asylum-row"><span class="asylum-k">Абхазия / Ю. Осетия</span><span class="asylum-v">' + br.abkhazia + '</span></div>' +
        '<div class="asylum-row"><span class="asylum-k">Украина</span><span class="asylum-v">' + br.ukraine + '</span></div>' +
        '</div>' +
        '<div class="deep-src">Решает <b>место выдачи загранпаспорта</b>, а не место рождения. Источники: решение Совета ЕС (дек. 2022) · закон Грузии «Об оккупированных территориях» · визовые гайды 2026</div>' +
        '</div>';
    }

    body.innerHTML = tilesHtml + gridHtml + riskHtml + srcHtml + weatherHtml + cultureHtml + asylumHtml + borderHtml;
  }

  // ---- Checkboxes ----
  var allBoxes = [];

  function bindCheckboxes() {
    allBoxes = [];
    var list = document.querySelectorAll("#timeline ul.checks input[type=checkbox]");
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(CHECK_KEY) || "{}"); } catch (e) { saved = {}; }

    for (var i = 0; i < list.length; i++) {
      allBoxes.push(list[i]);
      list[i].dataset.id = "c" + i;
      if (saved["c" + i]) list[i].checked = true;
      list[i].addEventListener("change", function () { persist(); updateProgress(); updatePhaseDone(); });
    }
  }

  function persist() {
    var out = {};
    allBoxes.forEach(function (b) { if (b.checked) out[b.dataset.id] = 1; });
    try { localStorage.setItem(CHECK_KEY, JSON.stringify(out)); } catch (e) {}
  }

  function updateProgress() {
    var done = 0, total = 0;
    for (var i = 0; i < allBoxes.length; i++) {
      total++;
      if (allBoxes[i].checked) done++;
    }
    var pgDone = document.getElementById("pg-done");
    var pgTotal = document.getElementById("pg-total");
    var pgBar = document.getElementById("pg-bar");
    if (pgDone) pgDone.textContent = done;
    if (pgTotal) pgTotal.textContent = total;
    if (pgBar) pgBar.style.width = (total ? (done / total * 100) : 0) + "%";
  }

  function updatePhaseDone() {
    var phases = document.querySelectorAll(".timeline .phase");
    phases.forEach(function (phase) {
      var inputs = phase.querySelectorAll("ul.checks input[type=checkbox]");
      if (inputs.length === 0) return;
      var allChecked = true;
      for (var i = 0; i < inputs.length; i++) {
        if (!inputs[i].checked) { allChecked = false; break; }
      }
      phase.classList.toggle("done", allChecked);
    });
  }

  // ---- Collapsible phases ----
  function collapsePhases() {
    var phases = document.querySelectorAll(".timeline .phase");
    var collapsed = {};
    var hasSaved = false;
    try {
      var raw = localStorage.getItem(PHASE_KEY);
      if (raw) { collapsed = JSON.parse(raw); hasSaved = true; }
    } catch (e) { collapsed = {}; }

    phases.forEach(function (phase, i) {
      var head = phase.querySelector(".phase-head");
      if (!head) return;
      var shouldCollapse = hasSaved ? !!collapsed["p" + i] : i > 0;
      if (shouldCollapse) phase.classList.add("collapsed");
      head.addEventListener("click", function () {
        phase.classList.toggle("collapsed");
        collapsed["p" + i] = phase.classList.contains("collapsed") ? 1 : 0;
        try { localStorage.setItem(PHASE_KEY, JSON.stringify(collapsed)); } catch (e) {}
      });
    });
  }

  // ---- Reset ----
  var resetBtn = document.getElementById("reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (!confirm("Снять все галочки?")) return;
      allBoxes.forEach(function (b) { b.checked = false; });
      try { localStorage.removeItem(CHECK_KEY); } catch (e) {}
      updateProgress();
      updatePhaseDone();
    });
  }

  // ---- Init ----
  buildCountryGrid();

  var selected = getSelectedCountry();
  if (selected && COUNTRIES[selected]) {
    showRoadmap(selected);
  } else {
    showCountrySelect();
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
