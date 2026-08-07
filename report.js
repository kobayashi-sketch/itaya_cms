(function () {
  const STATE_API_URL = "./state.php";
  const TABLECHECK_API_URL = "./tablecheck-sync.php";
  const VENUE_TIME_ZONE = "Asia/Tokyo";

  const periodDefs = [
    { key: "morning", label: "8:00〜12:00", range: "8:00〜12:00", min: 0, max: 12 * 60 },
    { key: "afternoon", label: "12:00〜17:00", range: "12:00〜17:00", min: 12 * 60, max: 17 * 60 },
    { key: "evening", label: "17:00〜21:00", range: "17:00〜21:00", min: 17 * 60, max: 24 * 60 }
  ];

  function createEl(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function dateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: VENUE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  }

  function currentDateString() {
    const parts = dateParts();
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function normalizeDateString(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return "";
    return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  }

  function minutesFromTime(time) {
    const [hours, minutes] = String(time || "00:00").split(":").map(Number);
    return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  }

  function cleanText(value, maxLength = 240) {
    return String(value || "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .trim()
      .slice(0, maxLength);
  }

  function reportDateLabel(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day) - (9 * 60 * 60 * 1000));
    const parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: VENUE_TIME_ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${values.year}年${values.month}月${values.day}日（${values.weekday}）`;
  }

  function periodForEvent(event) {
    const minutes = minutesFromTime(event.time);
    return periodDefs.find((period) => minutes >= period.min && minutes < period.max) || periodDefs[2];
  }

  function formatVenue(venue) {
    return cleanText(venue, 160).split(",").map((item) => item.trim()).filter(Boolean).join("、");
  }

  function formatNote(event) {
    const notes = [];
    if (event.status) notes.push(event.status);
    if (Array.isArray(event.flags) && event.flags.length) notes.push(event.flags.join("、"));
    return notes.join(" / ");
  }

  function normalizeEvents(events, source) {
    if (!Array.isArray(events)) return [];
    return events.map((event) => ({
      id: cleanText(event.id || "", 100),
      source,
      date: normalizeDateString(event.date) || currentDateString(),
      time: cleanText(event.time, 5),
      venue: cleanText(event.venue, 160),
      name: cleanText(event.name, 260),
      type: cleanText(event.type || "", 40),
      pax: cleanText(event.pax || event.people || "", 20),
      status: cleanText(event.status || "", 80),
      flags: Array.isArray(event.flags) ? event.flags.map((flag) => cleanText(flag, 80)).filter(Boolean) : [],
      visibleOnSignage: event.visibleOnSignage === true
    })).filter((event) => event.date && event.time && event.venue && event.name);
  }

  async function loadEvents(source) {
    const url = source === "auto" ? TABLECHECK_API_URL : STATE_API_URL;
    const response = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`データを取得できませんでした: ${response.status}`);
    const parsed = await response.json();
    return normalizeEvents(parsed.events || [], source);
  }

  function filteredEvents(events, date) {
    return events
      .filter((event) => event.date === date)
      .sort((a, b) => {
        const timeDiff = minutesFromTime(a.time) - minutesFromTime(b.time);
        if (timeDiff !== 0) return timeDiff;
        return a.venue.localeCompare(b.venue, "ja");
      });
  }

  function createCell(text, className = "") {
    const td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  function renderPeriodTable(period, events) {
    const section = createEl("section", "report-period");
    const totalPax = events.reduce((sum, event) => sum + (Number(event.pax) || 0), 0);
    section.appendChild(createEl("h2", "", `${period.range}　${totalPax ? `${totalPax}名` : ""}`));
    const table = createEl("table", "report-table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["会場名", "記", "看板名", "種別", "人数", "時間", "備考・支払方法"].forEach((label) => {
      headRow.appendChild(createEl("th", "", label));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const rows = events.length ? events : [{ empty: true }];
    rows.forEach((event) => {
      const row = document.createElement("tr");
      if (event.empty) {
        row.appendChild(createCell("", "venue-cell"));
        row.appendChild(createCell("", "mark-cell"));
        row.appendChild(createCell("", "name-cell"));
        row.appendChild(createCell("", "type-cell"));
        row.appendChild(createCell("", "pax-cell"));
        row.appendChild(createCell("", "time-cell"));
        row.appendChild(createCell("", "note-cell"));
      } else {
        row.appendChild(createCell(formatVenue(event.venue), "venue-cell"));
        row.appendChild(createCell("", "mark-cell"));
        row.appendChild(createCell(event.name, "name-cell"));
        row.appendChild(createCell(event.type, "type-cell"));
        row.appendChild(createCell(event.pax, "pax-cell"));
        row.appendChild(createCell(event.time, "time-cell"));
        row.appendChild(createCell(formatNote(event), "note-cell"));
      }
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  }

  function renderReport(events, date, source) {
    const sheet = document.getElementById("reportSheet");
    const targetEvents = filteredEvents(events, date);
    const sourceLabel = source === "auto" ? "会場（自動）" : "会場";
    const grouped = Object.fromEntries(periodDefs.map((period) => [period.key, []]));
    targetEvents.forEach((event) => grouped[periodForEvent(event).key].push(event));

    const header = createEl("header", "report-sheet-header");
    header.appendChild(createEl("div", "report-title-spacer", ""));
    header.appendChild(createEl("h1", "", "宴会ご予約一覧表"));
    header.appendChild(createEl("div", "report-date-title", reportDateLabel(date)));
    const meta = createEl("div", "report-meta");
    meta.appendChild(createEl("span", "", sourceLabel));
    meta.appendChild(createEl("span", "", `${targetEvents.length}件`));

    const grid = createEl("div", "report-grid");
    periodDefs.forEach((period) => {
      grid.appendChild(renderPeriodTable(period, grouped[period.key]));
    });

    sheet.replaceChildren(header, meta, grid);
  }

  async function refreshReport() {
    const source = document.getElementById("reportSource").value;
    const date = normalizeDateString(document.getElementById("reportDate").value) || currentDateString();
    const status = document.getElementById("reportStatus");
    status.textContent = "読み込み中...";
    try {
      const events = await loadEvents(source);
      renderReport(events, date, source);
      status.textContent = "";
    } catch (error) {
      status.textContent = error.message || "帳票を作成できませんでした。";
    }
  }

  function setup() {
    const dateInput = document.getElementById("reportDate");
    dateInput.value = new URLSearchParams(window.location.search).get("date") || currentDateString();
    document.getElementById("reportSource").value = new URLSearchParams(window.location.search).get("source") || "manual";
    document.getElementById("reportReload").addEventListener("click", refreshReport);
    document.getElementById("reportPrint").addEventListener("click", () => window.print());
    document.getElementById("reportSource").addEventListener("change", refreshReport);
    dateInput.addEventListener("change", refreshReport);
    refreshReport();
  }

  setup();
})();
