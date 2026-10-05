const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

/* =========================
   TELEGRAM / API
========================= */

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "x-telegram-user-id":
      tg?.initDataUnsafe?.user?.id || "demo"
  };
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

/* =========================
   HELPERS
========================= */

function formatMoney(value) {
  const n = Number(value) || 0;
  return `${n >= 0 ? "+" : ""}$${Math.abs(n).toFixed(2)}`;
}

function aMoney(value) {
  const n = Number(value) || 0;

  if (n === 0) return "$0.00";

  return `${n > 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}

function aClass(value) {
  const n = Number(value) || 0;

  if (n > 0) return "profit";
  if (n < 0) return "loss";

  return "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   PAGES
========================= */

function showPage(page) {
  document.querySelectorAll(".page").forEach(el => {
    el.classList.remove("active");
  });

  const target = document.getElementById(page);

  if (target) {
    target.classList.add("active");
  }

  document.querySelectorAll(".bottom-nav button").forEach(btn => {
    btn.classList.toggle(
      "active",
      btn.dataset.page === page
    );
  });

  if (page === "home") {
    loadBalance();
    loadHomeStats();
    loadHomeTrades();
  }

  if (page === "journal") {
    loadTrades();
  }

  if (page === "stats") {
    loadAnalytics();
  }
}

/* =========================
   BALANCE
========================= */

async function loadBalance() {
  try {
    const data = await api("/api/balance");

    const balance = Number(data.balance || 0);

    const el = document.getElementById("balance");

    if (el) {
      el.textContent = `$${balance.toFixed(2)}`;
    }
  } catch (e) {
    console.error("Balance error:", e);
  }
}

async function editBalance() {
  const current =
    Number(
      document
        .getElementById("balance")
        ?.textContent
        ?.replace("$", "")
    ) || 0;

  const value = prompt(
    "Введите новый баланс:",
    current
  );

  if (value === null) return;

  const balance = Number(value);

  if (!Number.isFinite(balance)) {
    alert("Введите корректное число");
    return;
  }

  try {
    await api("/api/balance", {
      method: "POST",
      body: JSON.stringify({ balance })
    });

    await loadBalance();
  } catch (e) {
    console.error(e);
    alert("Ошибка изменения баланса");
  }
}

/* =========================
   BUY / SELL
========================= */

function setDirection(direction) {
  const select =
    document.getElementById("direction");

  if (select) {
    select.value = direction;
  }

  document
    .querySelectorAll(".direction-option")
    .forEach(option => {
      option.classList.toggle(
        "active",
        option.dataset.direction === direction
      );
    });

  const radios =
    document.querySelectorAll(
      'input[name="trade-direction"]'
    );

  radios.forEach(radio => {
    radio.checked =
      radio.value === direction;
  });
}

function initDirectionSelector() {
  const select =
    document.getElementById("direction");

  const radios =
    document.querySelectorAll(
      'input[name="trade-direction"]'
    );

  const options =
    document.querySelectorAll(
      ".direction-option"
    );

  radios.forEach(radio => {
    radio.addEventListener(
      "change",
      () => {
        if (radio.checked) {
          setDirection(radio.value);
        }
      }
    );
  });

  options.forEach(option => {
    option.addEventListener(
      "click",
      () => {
        setDirection(
          option.dataset.direction
        );
      }
    );
  });

  if (select?.value) {
    setDirection(select.value);
  } else {
    setDirection("BUY");
  }
}

/* =========================
   ADD TRADE
========================= */

async function addTrade(event) {
  event.preventDefault();

  const pair =
    document.getElementById("pair")?.value.trim() || "";

  const direction =
    document.getElementById("direction")?.value || "BUY";

  const entry =
    Number(
      document.getElementById("entry")?.value
    ) || 0;

  const stop_loss =
    Number(
      document.getElementById("stop_loss")?.value
    ) || 0;

  const take_profit =
    Number(
      document.getElementById("take_profit")?.value
    ) || 0;

  const result =
    Number(
      document.getElementById("result")?.value
    ) || 0;

  const notes =
    document.getElementById("notes")?.value.trim() || "";

  if (!pair) {
    alert("Укажите валютную пару");
    return;
  }

  try {
    await api("/api/trades", {
      method: "POST",
      body: JSON.stringify({
        pair,
        direction,
        entry,
        stop_loss,
        take_profit,
        result,
        notes
      })
    });

    event.target.reset();

    setDirection("BUY");

    await loadBalance();

    alert("Сделка добавлена");

    showPage("journal");

  } catch (e) {
    console.error("Add trade error:", e);
    alert("Не удалось добавить сделку");
  }
}

/* =========================
   DATE
========================= */

function getTradeDate(trade) {
  if (!trade?.created_at) {
    return new Date();
  }

  const raw =
    String(trade.created_at)
      .replace(" ", "T");

  const date =
    new Date(
      raw.endsWith("Z")
        ? raw
        : `${raw}Z`
    );

  return Number.isNaN(date.getTime())
    ? new Date()
    : date;
}

function formatTradeDate(trade) {
  const date = getTradeDate(trade);

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isToday(trade) {
  const d = getTradeDate(trade);
  const now = new Date();

  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

/* =========================
   R:R
========================= */

function calculateRR(trade) {
  const entry = Number(trade.entry);
  const sl = Number(trade.stop_loss);
  const tp = Number(trade.take_profit);

  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(sl) ||
    !Number.isFinite(tp)
  ) {
    return "—";
  }

  const risk =
    Math.abs(entry - sl);

  const reward =
    Math.abs(tp - entry);

  if (!risk) return "—";

  return (
    reward / risk
  ).toFixed(2);
}

/* =========================
   FLAGS
========================= */

function pairFlag(pair) {
  const p =
    String(pair || "")
      .toUpperCase();

  if (p.includes("EUR")) return "🇪🇺";
  if (p.includes("USD")) return "🇺🇸";
  if (p.includes("GBP")) return "🇬🇧";
  if (p.includes("JPY")) return "🇯🇵";
  if (p.includes("AUD")) return "🇦🇺";
  if (p.includes("CAD")) return "🇨🇦";
  if (p.includes("CHF")) return "🇨🇭";
  if (p.includes("NZD")) return "🇳🇿";
  if (p.includes("XAU")) return "🥇";
  if (p.includes("XAG")) return "🥈";

  return "💱";
}

/* =========================
   JOURNAL FILTER
========================= */

let journalTrades = [];
let currentFilter = "all";

function setJournalFilter(filter) {
  currentFilter = filter;

  document
    .querySelectorAll(".filters button")
    .forEach(btn => {
      btn.classList.toggle(
        "active",
        btn.dataset.filter === filter
      );
    });

  renderJournal();
}

function getFilteredTrades() {
  return journalTrades.filter(trade => {
    const result =
      Number(trade.result) || 0;

    if (currentFilter === "profit") {
      return result > 0;
    }

    if (currentFilter === "loss") {
      return result < 0;
    }

    if (currentFilter === "today") {
      return isToday(trade);
    }

    return true;
  });
}

/* =========================
   JOURNAL
========================= */

async function loadTrades() {
  try {
    journalTrades =
      await api("/api/trades");

    updateJournalSummary();
    renderJournal();

  } catch (e) {
    console.error(
      "Journal error:",
      e
    );

    const list =
      document.getElementById("trades");

    if (list) {
      list.innerHTML =
        `<div class="empty">
          Не удалось загрузить сделки
        </div>`;
    }
  }
}

function updateJournalSummary() {
  const total =
    journalTrades.length;

  const profit =
    journalTrades.reduce(
      (sum, trade) =>
        sum + (Number(trade.result) || 0),
      0
    );

  const wins =
    journalTrades.filter(
      trade =>
        Number(tr
