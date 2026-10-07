const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

let currentPage = "home";
let currentFilter = "all";
let selectedDirection = "BUY";
let allTrades = [];

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

function showToast(message) {
  const toast = $("#toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function formatMoney(value) {
  const number = Number(value) || 0;

  return number.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(date) {
  if (!date) return "";

  const d = new Date(date.replace(" ", "T") + "Z");

  if (Number.isNaN(d.getTime())) {
    return date;
  }

  return d.toLocaleDateString("ru-RU");
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
   PAGE NAVIGATION
========================= */

function showPage(page) {
  currentPage = page;

  $$(".page").forEach((element) => {
    element.classList.remove("active");
  });

  const target = $(`#${page}`);

  if (target) {
    target.classList.add("active");
  }

  $$(".nav-button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  if (page === "home") {
    loadHome().catch((error) => {
      console.error("Home:", error);
    });
  }

  if (page === "journal") {
    loadJournal().catch((error) => {
      console.error("Journal:", error);
    });
  }

  if (page === "stats") {
    loadAnalytics().catch((error) => {
      console.error("Analytics:", error);
    });
  }
}

/* =========================
   BALANCE
========================= */

async function loadBalance() {
  const data = await api("/api/balance");

  const balance = $("#balance");

  if (balance) {
    balance.textContent = formatMoney(data.balance);
  }

  return data;
}

async function editBalance() {
  const current = $("#balance")?.textContent || "10000";

  const clean = current
    .replace(/\s/g, "")
    .replace(",", ".");

  const value = prompt(
    "Введите новый баланс:",
    clean
  );

  if (value === null) return;

  const balance = Number(
    String(value).replace(",", ".")
  );

  if (!Number.isFinite(balance)) {
    showToast("Некорректный баланс");
    return;
  }

  try {
    await api("/api/balance", {
      method: "POST",
      body: JSON.stringify({
        balance
      })
    });

    await loadBalance();

    showToast("Баланс обновлён");
  } catch (error) {
    console.error(error);
    showToast("Не удалось изменить баланс");
  }
}

/* =========================
   HOME
========================= */

async function loadHome() {
  try {
    const [balance, stats, trades] =
      await Promise.all([
        api("/api/balance"),
        api("/api/stats"),
        api("/api/trades")
      ]);

    const balanceElement = $("#balance");

    if (balanceElement) {
      balanceElement.textContent =
        formatMoney(balance.balance);
    }

    const total =
      Number(stats.total) || 0;

    const profit =
      Number(stats.profit) || 0;

    const winrate =
      Number(stats.winrate) || 0;

    const homeTotal = $("#homeTotal");
    const homeProfit = $("#homeProfit");
    const homeWinrate = $("#homeWinrate");

    if (homeTotal) {
      homeTotal.textContent = total;
    }

    if (homeProfit) {
      homeProfit.textContent =
        formatMoney(profit);
    }

    if (homeWinrate) {
      homeWinrate.textContent =
        `${winrate}%`;
    }

    renderHomeTrades(trades);

    return {
      balance,
      stats,
      trades
    };
  } catch (error) {
    console.error("loadHome:", error);

    /*
      Главное:
      ошибка загрузки данных больше НЕ блокирует
      запуск интерфейса.
    */

    showToast("Не удалось загрузить данные");

    return null;
  }
}

function renderHomeTrades(trades) {
  const container = $("#homeTradesList");

  if (!container) return;

  if (!Array.isArray(trades) || trades.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        Пока нет сделок
      </div>
    `;

    return;
  }

  container.innerHTML = trades
    .slice(0, 5)
    .map((trade) => {
      const result =
        Number(trade.result) || 0;

      const resultClass =
        result > 0
          ? "profit"
          : result < 0
            ? "loss"
            : "";

      return `
        <div class="trade-card">
          <div>
            <strong>
              ${escapeHtml(trade.pair || "Без пары")}
            </strong>

            <div class="trade-date">
              ${formatDate(trade.created_at)}
            </div>
          </div>

          <div class="${resultClass}">
            ${result > 0 ? "+" : ""}
            ${formatMoney(result)}
          </div>
        </div>
      `;
    })
    .join("");
}

/* =========================
   DIRECTION
========================= */

function setDirection(direction) {
  selectedDirection = direction;

  const hidden = $("#direction");

  if (hidden) {
    hidden.value = direction;
  }

  $$(".direction-button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.direction === direction
    );
  });
}

/* =========================
   ADD TRADE
========================= */

async function addTrade(event) {
  if (event) {
    event.preventDefault();
  }

  const pair =
    $("#pair")?.value.trim() || "";

  const entry =
    $("#entry")?.value || "";

  const stopLoss =
    $("#stop_loss")?.value || "";

  const takeProfit =
    $("#take_profit")?.value || "";

  const result =
    $("#result")?.value || "";

  const notes =
    $("#notes")?.value.trim() || "";

  if (!pair) {
    showToast("Укажите торговую пару");
    return;
  }

  try {
    await api("/api/trades", {
      method: "POST",
      body: JSON.stringify({
        pair,
        direction: selectedDirection,
        entry: Number(entry) || 0,
        stop_loss: Number(stopLoss) || 0,
        take_profit: Number(takeProfit) || 0,
        result: Number(result) || 0,
        notes
      })
   
