"use strict";

/* =========================================
   FOREX DIARY — APP.JS
========================================= */

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
let balanceValue = 100;

/* =========================================
   API
========================================= */

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "x-telegram-user-id": String(
      tg?.initDataUnsafe?.user?.id || "demo"
    )
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
    throw new Error(`Ошибка сервера: ${response.status}`);
  }

  return response.json();
}

/* =========================================
   HELPERS
========================================= */

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function formatMoney(value) {
  return (Number(value) || 0).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(
    String(value).replace(" ", "T") + "Z"
  );

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function signedMoney(value) {
  const n = Number(value) || 0;
  return `${n > 0 ? "+" : ""}$${formatMoney(n)}`;
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function getTradeResult(trade) {
  return Number(trade.result) || 0;
}

/* =========================================
   NAVIGATION
========================================= */

function showPage(page) {
  const target = $(`#${page}`);
  if (!target) return;

  currentPage = page;

  $$(".page").forEach((element) => {
    element.classList.toggle("active", element.id === page);
  });

  $$(".nav-button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  if (page === "home") {
    loadHome();
  } else if (page === "journal") {
    loadJournal();
  } else if (page === "stats") {
    loadAnalytics();
  } else if (page === "profile") {
    loadBalance().catch(console.error);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =========================================
   BALANCE
========================================= */

async function loadBalance() {
  const data = await api("/api/balance");

  balanceValue = Number(data.balance) || 0;

  setText("#balance", formatMoney(balanceValue));

  return balanceValue;
}

async function editBalance() {
  const input = prompt(
    "Введи новый баланс:",
    String(balanceValue)
  );

  if (input === null) return;

  const value = Number(String(input).replace(",", "."));

  if (!Number.isFinite(value) || value < 0) {
    showToast("Введи корректный баланс");
    return;
  }

  try {
    await api("/api/balance", {
      method: "POST",
      body: JSON.stringify({ balance: value })
    });

    balanceValue = value;

    setText("#balance", formatMoney(balanceValue));

    showToast("Баланс сохранён");

    if (currentPage === "stats") {
      await loadAnalytics();
    }
  } catch (error) {
    console.error("Изменение баланса:", error);
    showToast("Не удалось сохранить баланс");
  }
}

/* =========================================
   HOME
========================================= */

async function loadHome() {
  try {
    const [balance, stats, trades] = await Promise.all([
      api("/api/balance"),
      api("/api/stats"),
      api("/api/trades")
    ]);

    balanceValue = Number(balance.balance) || 0;
    allTrades = Array.isArray(trades) ? trades : [];

    setText("#balance", formatMoney(balanceValue));
    setText("#homeTotal", Number(stats.total) || 0);
    setText("#homeProfit", formatMoney(stats.profit));
    setText("#homeWinrate", `${Number(stats.winrate) || 0}%`);

    renderHomeTrades(allTrades);
  } catch (error) {
    console.error("Загрузка главной:", error);
    showToast("Не удалось загрузить данные");
  }
}

function renderHomeTrades(trades) {
  const container = $("#homeTradesList");
  if (!container) return;

  if (!trades.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div style="font-size:32px">📒</div>
        <strong>Сделок пока нет</strong>
        <span>Добавь первую сделку</span>
      </div>
    `;
    return;
  }

  container.innerHTML = trades.slice(0, 5).map((trade) => {
    const result = getTradeResult(trade);
    const resultClass = result > 0 ? "profit" : result < 0 ? "loss" : "";

    return `
      <div class="trade-card">
        <div>
          <strong>${escapeHtml(trade.pair || "Инструмент")}</strong>
          <p>${escapeHtml(trade.direction || "")} · ${formatDate(trade.created_at)}</p>
        </div>
        <strong class="${resultClass}">${signedMoney(result)}</strong>
      </div>
    `;
  }).join("");
}

/* =========================================
   BUY / SELL
========================================= */

function setDirection(direction) {
  selectedDirection = direction;

  const hidden = $("#direction");
  if (hidden) hidden.value = direction;

  $$(".direction-button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.direction === direction
    );
  });
}

/* =========================================
   ADD TRADE
========================================= */

async function addTrade(event) {
  event?.preventDefault();

  const pair = $("#pair")?.value.trim() || "";
  const entry = $("#entry")?.value || "";
  const stopLoss = $("#stop_loss")?.value || "";
  const takeProfit = $("#take_profit")?.value || "";
  const resultText = $("#result")?.value ?? "";
  const notes = $("#notes")?.value.trim() || "";

  if (!pair) {
    showToast("Выбери торговый инструмент");
    return;
  }

  if (resultText.trim() === "") {
    showToast("Укажи финансовый результат");
    return;
  }

  const result = Number(String(resultText).replace(",", "."));

  if (!Number.isFinite(result)) {
    showToast("Проверь финансовый результат");
    return;
  }

  const submitButton = $('#tradeForm button[type="submit"]');

  try {
    if (submitButton) submitButton.disabled = true;

    await api("/api/trades", {
      method: "POST",
      body: JSON.stringify({
        pair,
        direction: selectedDirection,
        entry: Number(entry) || 0,
        stop_loss: Number(stopLoss) || 0,
        take_profit: Number(takeProfit) || 0,
        result,
        notes
      })
    });

    $("#tradeForm")?.reset();
    setDirection("BUY");

    showToast("Сделка сохранена");

    await loadHome();
    showPage("journal");
  } catch (error) {
    console.error("Сохранение сделки:", error);
    showToast("Не удалось сохранить сделку");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

/* =========================================
   JOURNAL
========================================= */

async function loadJournal() {
  const container = $("#trades");
  if (container) {
    container.innerHTML = '<div class="empty-state">Загружаю сделки...</div>';
  }

  try {
    const [trades, stats] = await Promise.all([
      api("/api/trades"),
      api("/api/stats")
    ]);

    allTrades = Array.isArray(trades) ? trades : [];

    setText("#journalTotal", Number(stats.total) || 0);
    setText("#journalProfit", formatMoney(stats.profit));
    setText("#journalWinrate", `${Number(stats.winrate) || 0}%`);

    renderJournal();
  } catch (error) {
    console.error("Журнал:", error);

    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <strong>Не удалось загрузить сделки</strong>
          <span>Проверь соединение и попробуй ещё раз</span>
        </div>
      `;
    }
  }
}

function renderJournal() {
  const container = $("#trades");
  if (!container) return;

  const today = new Date().toLocaleDateString("ru-RU");

  const filtered = allTrades.filter((trade) => {
    const result = getTradeResult(trade);

    if (currentFilter === "profit" && result <= 0) return false;
    if (currentFilter === "loss" && result >= 0) return false;

    if (currentFilter === "today") {
      const tradeDate = new Date(
        String(trade.created_at || "").replace(" ", "T") + "Z"
      );

      if (
        Number.isNaN(tradeDate.getTime()) ||
        tradeDate.toLocaleDateString("ru-RU") !== today
      ) {
        return false;
      }
    }

    return true;
  });

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div style="font-size:32px">📭</div>
        <strong>Сделок нет</strong>
        <span>В выбранном фильтре ничего нет</span>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((trade) => {
    const result = getTradeResult(trade);
    const resultClass = result > 0 ? "profit" : result < 0 ? "loss" : "";

    return `
      <article class="trade-card">
        <h3>${escapeHtml(trade.pair || "Инструмент")}</h3>
        <p>
          Направление: ${escapeHtml(trade.direction || "—")}
        </p>
        <p>Вход: ${escapeHtml(trade.entry ?? 0)}</p>
        <p>Stop Loss: ${escapeHtml(trade.stop_loss ?? 0)}</p>
        <p>Take Profit: ${escapeHtml(trade.take_profit ?? 0)}</p>
        <p>Дата: ${formatDate(trade.created_at)}</p>
        ${trade.notes ? `<p>Комментарий: ${escapeHtml(trade.notes)}</p>` : ""}
        <p class="${resultClass}">
          <strong>Результат: ${signedMoney(result)}</strong>
        </p>
        <button
          class="secondary-button delete-trade"
          type="button"
          data-id="${Number(trade.id)}"
        >Удалить сделку</button>
      </article>
    `;
  }).join("");
}

async function deleteTrade(id) {
  if (!confirm("Удалить эту сделку? Её результат будет вычтен из баланса.")) {
    return;
  }

  try {
    await api(`/api/trades/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });

    showToast("Сделка удалена");

    await Promise.all([loadJournal(), loadHome()]);

    if (currentPage === "stats") {
      await loadAnalytics();
    }
  } catch (error) {
    console.error("Удаление сделки:", error);
    showToast("Не удалось удалить сделку");
  }
}

/* =========================================
   ANALYTICS
========================================= */

async function loadAnalytics() {
  try {
    const [trades, stats, balance] = await Promise.all([
      api("/api/trades"),
      api("/api/stats"),
      api("/api/balance")
    ]);

    allTrades = Array.isArray(trades) ? trades : [];
    balanceValue = Number(balance.balance) || 0;

    const results = allTrades.map(getTradeResult);
    const wins = results.filter((n) => n > 0);
    const losses = results.filter((n) => n < 0);

    const sumWins = wins.reduce((sum, n) => sum + n, 0);
    const sumLosses = Math.abs(losses.reduce((sum, n) => sum + n, 0));
    const totalProfit = results.reduce((sum, n) => sum + n, 0);

    const averageWin = wins.length ? sumWins / wins.length : 0;
    const averageLoss = losses.length ? sumLosses / losses.length : 0;
    const profitFactor = sumLosses > 0 ? sumWins / sumLosses : (sumWins > 0 ? Infinity : 0);
    const expectancy = results.length ? totalProfit / results.length : 0;

    setText("#analyticsTrades", Number(stats.total) || 0);
    setText("#aProfit", formatMoney(totalProfit));
    setText("#aWinrate", `${Number(stats.winrate) || 0}%`);
    setText("#aAvgWin", `$${formatMoney(averageWin)}`);
    setText("#aAvgLoss", `$${formatMoney(averageLoss)}`);
    setText("#aProfitFactor", Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : "∞");
    setText("#aExpectancy", `$${formatMoney(expectancy)}`);
    setText("#aBest", `$${formatMoney(results.length ? Math.max(...results) : 0)}`);
    setText("#aWorst", `$${formatMoney(results.length ? Math.min(...results) : 0)}`);

    const streaks = calculateStreaks(results);
    setText("#aWinStreak", streaks.wins);
    setText("#aLossStreak", streaks.losses);

    renderEquityChart(allTrades, balanceValue);
    renderPairAnalytics(allTrades);
    renderDailyAnalytics(allTrades);
  } catch (error) {
    console.error("Статистика:", error);
    showToast("Не удалось загрузить статистику");
  }
}

function calculateStreaks(results) {
  let currentWins = 0;
  let currentLosses = 0;
  let bestWins = 0;
  let bestLosses = 0;

  results.slice().reverse().forEach((result) => {
    if (result > 0) {
      currentWins += 1;
      currentLosses = 0;
    } else if (result < 0) {
      currentLosses += 1;
      currentWins = 0;
    } else {
      currentWins = 0;
      currentLosses = 0;
    }

    bestWins = Math.max(bestWins, currentWins);
    bestLosses = Math.max(bestLosses, currentLosses);
  });

  return {
    wins: bestWins,
    losses: bestLosses
  };
}

function renderPairAnalytics(trades) {
  const container = $("#pairAnalytics");
  if (!container) return;

  const totals = {};

  trades.forEach((trade) => {
    const pair = trade.pair || "Без названия";
    totals[pair] = (totals[pair] || 0) + getTradeResult(trade);
  });

  const entries = Object.entries(totals);

  if (!entries.length) {
    container.innerHTML = '<div class="empty-state">Пока нет данных</div>';
    return;
  }

  container.innerHTML = entries
    .sort((a, b) => b[1] - a[1])
    .map(([pair, result]) => `
      <div class="trade-card">
        <strong>${escapeHtml(pair)}</strong>
        <p class="${result > 0 ? "profit" : result < 0 ? "loss" : ""}">
          ${signedMoney(result)}
        </p>
      </div>
    `).join("");
}

function renderDailyAnalytics(trades) {
  const container = $("#dailyAnalytics");
  if (!container) return;

  const totals = {};

  trades.forEach((trade) => {
    const date = trade.created_at
      ? String(trade.created_at).slice(0, 10)
      : "Без даты";

    totals[date] = (totals[date] || 0) + getTradeResult(trade);
  });

  const entries = Object.entries(totals).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  if (!entries.length) {
    container.innerHTML = '<div class="empty-state">Пока нет данных</div>';
    return;
  }

  container.innerHTML = entries.map(([date, result]) => `
    <div class="trade-card">
      <strong>${escapeHtml(date)}</strong>
      <p class="${result > 0 ? "profit" : result < 0 ? "loss" : ""}">
        ${signedMoney(result)}
      </p>
    </div>
  `).join("");
}

function renderEquityChart(trades, startingBalance) {
  const canvas = $("#equityChart");
  if (!canvas) return;

  const width = Math.max(canvas.clientWidth || 300, 280);
  const height = 190;
  const ratio = window.devicePixelRatio || 1;

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);

  const sorted = trades.slice().reverse();
  let running = Number(startingBalance) || 0;

  const points = [running];

  sorted.forEach((trade) => {
    running += getTradeResult(trade);
    points.push(running);
  });

  if (points.length === 1) {
    ctx.fillStyle = "#929daf";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Добавь сделки, чтобы увидеть график", width / 2, height / 2);
    return;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const pad = 16;
  const plotWidth = width - pad * 2;
  const plotHeight = height - pad * 2;

  ctx.strokeStyle = "#263244";
  ctx.lineWidth = 1;

  for (let i = 0; i < 4; i++) {
    const y = pad + (plotHeight / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  ctx.beginPath();

  points.forEach((value, index) => {
    const x = pad + (index / (points.length - 1)) * plotWidth;
    const y = pad + plotHeight - ((value - min) / range) * plotHeight;

    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.strokeStyle = points[points.length - 1] >= points[0] ? "#35d48a" : "#ff6474";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.stroke();
}

/* =========================================
   EVENT HANDLERS
========================================= */

function bindEvents() {
  $$(".nav-button, [data-page]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const page = button.dataset.page;
      if (page) showPage(page);
    });
  });

  $("#newTrade")?.addEventListener("click", () => showPage("add"));
  $("#openJournal")?.addEventListener("click", () => showPage("journal"));

  $("#editBalance")?.addEventListener("click", editBalance);
  $("#profileEditBalance")?.addEventListener("click", editBalance);

  $("#tradeForm")?.addEventListener("submit", addTrade);

  $$(".direction-button").forEach((button) => {
    button.addEventListener("click", () => {
      setDirection(button.dataset.direction);
    });
  });

  $$(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter || "all";

      $$(".filter-button").forEach((item) => {
        item.classList.toggle("active", item === button);
      });

      renderJournal();
    });
  });

  $("#trades")?.addEventListener("click", (event) => {
    const button = event.target.closest(".delete-trade");
    if (button) deleteTrade(button.dataset.id);
  });

  window.addEventListener("resize", () => {
    if (currentPage === "stats") {
      renderEquityChart(allTrades, balanceValue);
    }
  });
}

/* =========================================
   START APP
========================================= */

async function startApp() {
  bindEvents();
  setDirection("BUY");

  try {
    await loadHome();
  } catch (error) {
    console.error("Старт приложения:", error);
  } finally {
    // Скрываем заставку даже при ошибке API.
    const loader = $("#loader");

    if (loader) {
      loader.style.display = "none";
    }

    document.body.classList.add("app-ready");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp, { once: true });
} else {
  startApp();
}
