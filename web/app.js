/* =========================
   FOREX DIARY — STABLE APP
   ========================= */

const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

/* =========================
   HELPERS
   ========================= */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

let currentPage = "home";
let currentFilter = "all";
let selectedDirection = "BUY";
let allTrades = [];

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

function money(value) {
  const number = Number(value) || 0;

  return (
    number < 0 ? "-$" : "$"
  ) +
    Math.abs(number).toFixed(2);
}

function moneyClass(value) {
  return Number(value) >= 0 ? "green" : "red";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function showToast(message) {
  let toast = $("#toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

/* =========================
   NAVIGATION
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
    loadHome();
  }

  if (page === "journal") {
    loadJournal();
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

    const balance = Number(data.balance) || 0;

    const element = $("#balance");

    if (element) {
      element.textContent = money(balance);
    }

    return balance;
  } catch (error) {
    console.error("Balance error:", error);
    return 0;
  }
}

async function editBalance() {
  const current = await loadBalance();

  const value = prompt(
    "Введите новый баланс:",
    Number(current).toFixed(2)
  );

  if (value === null) return;

  const balance = Number(value);

  if (!Number.isFinite(balance)) {
    showToast("Введите корректную сумму");
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
    await loadHome();

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
  await loadBalance();

  try {
    const stats = await api("/api/stats");

    const total = Number(stats.totalTrades) || 0;
    const profit = Number(stats.totalProfit) || 0;
    const winrate = Number(stats.winrate) || 0;

    if ($("#homeTotal")) {
      $("#homeTotal").textContent = total;
    }

    if ($("#homeProfit")) {
      $("#homeProfit").textContent = money(profit);
      $("#homeProfit").className =
        `stat-value ${moneyClass(profit)}`;
    }

    if ($("#homeWinrate")) {
      $("#homeWinrate").textContent =
        `${winrate.toFixed(1)}%`;
    }
  } catch (error) {
    console.error("Home stats:", error);
  }

  try {
    const data = await api("/api/trades");

    allTrades = Array.isArray(data)
      ? data
      : data.trades || [];

    renderHomeTrades(
      allTrades.slice(0, 5)
    );
  } catch (error) {
    console.error("Home trades:", error);
  }
}

function renderHomeTrades(trades) {
  const container = $("#homeTradesList");

  if (!container) return;

  if (!trades.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📒</div>
        <div class="empty-title">
          Сделок пока нет
        </div>
        <div class="empty-text">
          Добавьте первую сделку
        </div>
      </div>
    `;

    return;
  }

  container.innerHTML = trades
    .map(renderTradeCard)
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
    button.classList.remove("active");

    if (button.dataset.direction === direction) {
      button.classList.add("active");

      button.classList.remove("buy", "sell");
      button.classList.add(
        direction.toLowerCase()
      );
    }
  });
}

/* =========================
   ADD TRADE
   ========================= */

async function addTrade(event) {
  event.preventDefault();

  const pair = $("#pair")?.value.trim();
  const entry = Number($("#entry")?.value);
  const stopLoss = Number($("#stop_loss")?.value);
  const takeProfit = Number($("#take_profit")?.value);
  const result = Number($("#result")?.value);
  const notes = $("#notes")?.value.trim();

  if (!pair) {
    showToast("Введите валютную пару");
    return;
  }

  if (!Number.isFinite(result)) {
    showToast("Введите результат сделки");
    return;
  }

  const trade = {
    pair,
    direction: selectedDirection,
    entry: Number.isFinite(entry) ? entry : null,
    stop_loss: Number.isFinite(stopLoss)
      ? stopLoss
      : null,
    take_profit: Number.isFinite(takeProfit)
      ? takeProfit
      : null,
    result,
    notes,
    date: new Date().toISOString()
  };

  try {
    await api("/api/trades", {
      method: "POST",
      body: JSON.stringify(trade)
    });

    const form = $("#tradeForm");

    if (form) {
      form.reset();
    }

    setDirection("BUY");

    showToast("Сделка добавлена");

    await loadHome();

    showPage("journal");
  } catch (error) {
    console.error("Add trade:", error);
    showToast("Не удалось добавить сделку");
  }
}

/* =========================
   TRADE CARD
   ========================= */

function renderTradeCard(trade) {
  const result = Number(trade.result) || 0;

  const direction =
    String(trade.direction || "BUY")
      .toUpperCase();

  const directionClass =
    direction === "SELL" ? "sell" : "buy";

  return `
    <div class="trade-card">

      <div class="trade-top">

        <div class="trade-pair">
          <span>
            ${escapeHtml(trade.pair || "—")}
          </span>

          <span class="trade-direction ${directionClass}">
            ${direction}
          </span>
        </div>

        <div class="trade-result ${result >= 0 ? "profit" : "loss"}">
          ${money(result)}
        </div>

      </div>

      <div class="trade-middle">

        <div class="trade-info">
          <span class="trade-info-label">
            Entry
          </span>
          <span class="trade-info-value">
            ${trade.entry ?? "—"}
          </span>
        </div>

        <div class="trade-info">
          <span class="trade-info-label">
            SL
          </span>
          <span class="trade-info-value">
            ${trade.stop_loss ?? "—"}
          </span>
        </div>

        <div class="trade-info">
          <span class="trade-info-label">
            TP
          </span>
          <span class="trade-info-value">
            ${trade.take_profit ?? "—"}
          </span>
        </div>

      </div>

      ${
        trade.notes
          ? `
            <div
              style="
                margin-top:12px;
                color:var(--muted);
                font-size:12px;
                line-height:1.45;
              "
            >
              ${escapeHtml(trade.notes)}
            </div>
          `
          : ""
      }

      <div class="trade-bottom">

        <span class="trade-date">
          ${formatDate(
            trade.date ||
            trade.created_at
          )}
        </span>

        <button
          class="delete-trade"
          data-delete="${trade.id}"
        >
          Удалить
        </button>

      </div>

    </div>
  `;
}

/* =========================
   JOURNAL
   ========================= */

async function loadJournal() {
  try {
    const data = await api("/api/trades");

    allTrades = Array.isArray(data)
      ? data
      : data.trades || [];

    renderJournal();
  } catch (error) {
    console.error("Journal:", error);

    const container = $("#trades");

    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          Не удалось загрузить сделки
        </div>
      `;
    }
  }
}

function renderJournal() {
  const container = $("#trades");

  if (!container) return;

  let trades = [...allTrades];

  if (currentFilter === "profit") {
    trades = trades.filter(
      (trade) =>
        Number(trade.result) > 0
    );
  }

  if (currentFilter === "loss") {
    trades = trades.filter(
      (trade) =>
        Number(trade.result) < 0
    );
  }

  if (currentFilter === "today") {
    const today = new Date()
      .toISOString()
      .slice(0, 10);

    trades = trades.filter((trade) => {
      const date = new Date(
        trade.date ||
        trade.created_at
      );

      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === today
      );
    });
  }

  if (!trades.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-title">
          Сделок нет
        </div>
        <div class="empty-text">
          В выбранном фильтре ничего не найдено
        </div>
      </div>
    `;

    updateJournalSummary([]);
    return;
  }

  container.innerHTML = trades
    .map(renderTradeCard)
    .join("");

  updateJournalSummary(trades);
}

function updateJournalSummary(trades) {
  const total = trades.length;

  const profit = trades.reduce(
    (sum, trade) =>
      sum + (Number(trade.result) || 0),
    0
  );

  const wins = trades.filter(
    (trade) =>
      Number(trade.result) > 0
  ).length;

  const winrate =
    total > 0
      ? (wins / total) * 100
      : 0;

  if ($("#journalTotal")) {
    $("#journalTotal").textContent = total;
  }

  if ($("#journalProfit")) {
    $("#journalProfit").textContent =
      money(profit);

    $("#journalProfit").className =
      `stat-value ${moneyClass(profit)}`;
  }

  if ($("#journalWinrate")) {
    $("#journalWinrate").textContent =
      `${winrate.toFixed(1)}%`;
  }
}

/* =========================
   DELETE
   ========================= */

async function deleteTrade(id) {
  if (!id) return;

  const confirmed = confirm(
    "Удалить эту сделку?"
  );

  if (!confirmed) return;

  try {
    await api(`/api/trades/${id}`, {
      method: "DELETE"
    });

    showToast("Сделка удалена");

    await loadJournal();
    await loadHome();
  } catch (error) {
    console.error("Delete:", error);
    showToast("Не удалось удалить сделку");
  }
}

/* =========================
   ANALYTICS
   ========================= */

async function loadAnalytics() {
  let trades = [];

  try {
    const data = await api("/api/trades");

    trades = Array.isArray(data)
      ? data
      : data.trades || [];
  } catch (error) {
    console.error(error);
    return;
  }

  calculateAnalytics(trades);
}

function calculateAnalytics(trades) {
  const results = trades.map(
    (trade) =>
      Number(trade.result) || 0
  );

  const totalTrades = results.length;

  const totalProfit = results.reduce(
    (sum, value) => sum + value,
    0
  );

  const wins = results.filter(
    (value) => value > 0
  );

  const losses = results.filter(
    (value) => value < 0
  );

  const winrate =
    totalTrades > 0
      ? (wins.length / totalTrades) * 100
      : 0;

  const avgWin =
    wins.length
      ? wins.reduce(
          (sum, value) => sum + value,
          0
        ) / wins.length
      : 0;

  const avgLoss =
    losses.length
      ? Math.abs(
          losses.reduce(
            (sum, value) => sum + value,
            0
          ) / losses.length
        )
      : 0;

  const grossProfit = wins.reduce(
    (sum, value) => sum + value,
    0
  );

  const grossLoss = Math.abs(
    losses.reduce(
      (sum, value) => sum + value,
      0
    )
  );

  const profitFactor =
    grossLoss > 0
      ? grossProfit / grossLoss
      : grossProfit > 0
        ? Infinity
        : 0;

  const expectancy =
    totalTrades > 0
      ? totalProfit / totalTrades
      : 0;

  setText(
    "#analyticsTrades",
    totalTrades
  );

  setText(
    "#aProfit",
    money(totalProfit)
  );

  setText(
    "#aWinrate",
    `${winrate.toFixed(1)}%`
  );

  setText(
    "#aAvgWin",
    money(avgWin)
  );

  setText(
    "#aAvgLoss",
    money(avgLoss)
  );

  setText(
    "#aProfitFactor",
    Number.isFinite(profitFactor)
      ? profitFactor.toFixed(2)
      : "∞"
  );

  setText(
    "#aExpectancy",
    money(expectancy)
  );

  const best =
    results.length
      ? Math.max(...results)
      : 0;

  const worst =
    results.length
      ? Math.min(...results)
      : 0;

  setText("#aBest", money(best));
  setText("#aWorst", money(worst));

  const streaks =
    calculateStreaks(results);

  setText(
    "#aWinStreak",
    streaks.maxWin
  );

  setText(
    "#aLossStreak",
    streaks.maxLoss
  );

  renderEquityCurve(results);
  renderPairAnalytics(trades);
  renderDailyAnalytics(trades);
}

function setText(selector, value) {
  const element = $(selector);

  if (element) {
    element.textContent = value;
  }
}

/* =========================
   STREAKS
   ========================= */

function calculateStreaks(results) {
  let win = 0;
  let loss = 0;

  let maxWin = 0;
  let maxLoss = 0;

  results.forEach((result) => {
    if (result > 0) {
      win++;
      loss = 0;

      maxWin = Math.max(
        maxWin,
        win
      );
    } else if (result < 0) {
      loss++;
      win = 0;

      maxLoss = Math.max(
        maxLoss,
        loss
      );
    } else {
      win = 0;
      loss = 0;
    }
  });

  return {
    maxWin,
    maxLoss
  };
}

/* =========================
   EQUITY CURVE
   ========================= */

function renderEquityCurve(results) {
  const canvas = $("#equityChart");

  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  const width =
    canvas.clientWidth || 500;

  const height =
    canvas.clientHeight || 220;

  const dpr =
    window.devicePixelRatio || 1;

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  if (!results.length) {
    ctx.fillStyle = "#8b94a3";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";

    ctx.fillText(
      "Пока недостаточно данных",
      width / 2,
      height / 2
    );

    return;
  }

  let equity = 0;

  const points = [
    0
  ];

  results.forEach((value) => {
    equity += value;
    points.push(equity);
  });

  const min =
    Math.min(...points);

  const max =
    Math.max(...points);

  const range =
    max - min || 1;

  const padding = 18;

  ctx.strokeStyle =
    "#252b35";

  ctx.lineWidth = 1;

  for (let i = 1; i <= 3; i++) {
    const y =
      padding +
      ((height - padding * 2) *
        i) /
        4;

    ctx.beginPath();
    ctx.moveTo(
      padding,
      y
    );

    ctx.lineTo(
      width - padding,
      y
    );

    ctx.stroke();
  }

  ctx.beginPath();

  points.forEach(
    (value, index) => {
      const x =
        padding +
        ((width -
          padding * 2) *
          index) /
          Math.max(
            points.length - 1,
            1
          );

      const y =
        height -
        padding -
        ((value - min) /
          range) *
          (height -
            padding * 2);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
  );

  ctx.strokeStyle =
    "#5b8cff";

  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.stroke();
}

/* =========================
   PAIR ANALYTICS
   ========================= */

function renderPairAnalytics(trades) {
  const container =
    $("#pairAnalytics");

  if (!container) return;

  const pairs = {};

  trades.forEach((trade) => {
    const pair =
      trade.pair || "Unknown";

    if (!pairs[pair]) {
      pairs[pair] = {
        trades: 0,
        profit: 0
      };
    }

    pairs[pair].trades++;

    pairs[pair].profit +=
      Number(trade.result) || 0;
  });

  const entries =
    Object.entries(pairs);

  if (!entries.length) {
    container.innerHTML =
      `<div class="empty-state">
        Нет данных
      </div>`;

    return;
  }

  container.innerHTML = `
    <div class="analytics-table">
      <table class="analytics-table">

        <thead>
          <tr>
            <th>Пара</th>
            <th>Сделки</th>
            <th>Результат</th>
          </tr>
        </thead>

        <tbody>
          ${entries
            .sort(
              (a, b) =>
                b[1].profit -
                a[1].profit
            )
            .map(
              ([pair, data]) => `
                <tr>
                  <td>
                    ${escapeHtml(pair)}
                  </td>
                  <td>
                    ${data.trades}
                  </td>
                  <td
                    class="${
                      data.profit >= 0
                        ? "green"
                        : "red"
                    }"
                  >
                    ${money(data.profit)}
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>

      </table>
    </div>
  `;
}

/* =========================
   DAILY ANALYTICS
   ========================= */

function renderDailyAnalytics(trades) {
  const container =
    $("#dailyAnalytics");

  if (!container) return;

  const days = {};

  trades.forEach((trade) => {
    const date = new Date(
      trade.date ||
      trade.created_at
    );

    if (Number.isNaN(date.getTime())) {
      return;
    }

    const key =
      date.toISOString()
        .slice(0, 10);

    if (!days[key]) {
      days[key] = 0;
    }

    days[key] +=
      Number(trade.result) || 0;
  });

  const entries =
    Object.entries(days)
      .sort((a, b) =>
        a[0].localeCompare(b[0])
      )
      .slice(-14);

  if (!entries.length) {
    container.innerHTML =
      `<div class="empty-state">
        Нет данных
      </div>`;

    return;
  }

  container.innerHTML = `
    <div class="analytics-table">
      <table class="analytics-table">

        <thead>
          <tr>
            <th>Дата</th>
            <th>Результат</th>
          </tr>
        </thead>

        <tbody>
          ${entries
            .map(
              ([date, result]) => `
                <tr>
                  <td>${date}</td>
                  <td
                    class="${
                      result >= 0
                        ? "green"
                        : "red"
                    }"
                  >
                    ${money(result)}
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>

      </table>
    </div>
  `;
}

/* =========================
   EVENTS
   ========================= */

function initEvents() {
  /* Navigation */

  $$(".nav-button").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          showPage(
            button.dataset.page
          );
        }
      );
    }
  );

  /* Add trade form */

  const form = $("#tradeForm");

  if (form) {
    form.addEventListener(
      "submit",
      addTrade
    );
  }

  /* Direction */

  $$(".direction-button").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          setDirection(
            button.dataset.direction
          );
        }
      );
    }
  );

  /* Filters */

  $$(".filter-button").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          currentFilter =
            button.dataset.filter ||
            "all";

          $$(".filter-button")
            .forEach((item) => {
              item.classList.toggle(
                "active",
                item === button
              );
            });

          renderJournal();
        }
      );
    }
  );

  /* Edit balance */

  const edit =
    $("#editBalance");

  if (edit) {
    edit.addEventListener(
      "click",
      editBalance
    );
  }

  /* New trade */

  const newTrade =
    $("#newTrade");

  if (newTrade) {
    newTrade.addEventListener(
      "click",
      () => showPage("add")
    );
  }

  /* Back from add */

  const back =
    $("#backFromAdd");

  if (back) {
    back.addEventListener(
      "click",
      () => showPage("home")
    );
  }

  /* Journal link */

  const journalLink =
    $("#openJournal");

  if (journalLink) {
    journalLink.addEventListener(
      "click",
      () => showPage("journal")
    );
  }

  /* Delete buttons */

  document.addEventListener(
    "click",
    (event) => {
      const button =
        event.target.closest(
          "[data-delete]"
        );

      if (!button) return;

      deleteTrade(
        button.dataset.delete
      );
    }
  );

  /* Resize chart */

  window.addEventListener(
    "resize",
    () => {
      if (currentPage === "stats") {
        loadAnalytics();
      }
    }
  );
}

/* =========================
   INIT
   ========================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    initEvents();

    setDirection("BUY");

    await loadHome();

    showPage("home");

    const loader =
      $("#loader");

    if (loader) {
      loader.classList.add(
        "hidden"
      );
    }
  }
);
