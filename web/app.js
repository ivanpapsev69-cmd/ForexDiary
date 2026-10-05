const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "x-telegram-user-id":
      tg?.initDataUnsafe?.user?.id || "demo"
  };
}

function formatMoney(value) {
  const n = Number(value) || 0;
  return `${n >= 0 ? "+" : ""}$${Math.abs(n).toFixed(2)}`;
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

/* PAGES */

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
    loadStats();
  }
}

/* BALANCE */

async function loadBalance() {
  try {
    const data = await api("/api/balance");

    const el = document.getElementById("balance");

    if (el) {
      el.textContent =
        `$${Number(data.balance || 0).toFixed(2)}`;
    }
  } catch (e) {
    console.error(e);
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
    alert("Ошибка изменения баланса");
  }
}

/* ADD TRADE */

async function addTrade(event) {
  event.preventDefault();

  const pair =
    document.getElementById("pair")?.value || "";

  const direction =
    document.getElementById("direction")?.value || "";

  const entry =
    Number(document.getElementById("entry")?.value) || 0;

  const stop_loss =
    Number(document.getElementById("stop_loss")?.value) || 0;

  const take_profit =
    Number(document.getElementById("take_profit")?.value) || 0;

  const result =
    Number(document.getElementById("result")?.value) || 0;

  const notes =
    document.getElementById("notes")?.value || "";

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

    alert("Сделка добавлена");

    showPage("journal");
  } catch (e) {
    console.error(e);
    alert("Не удалось добавить сделку");
  }
}

/* DATE */

function getTradeDate(trade) {
  if (!trade.created_at) {
    return new Date();
  }

  return new Date(
    trade.created_at.replace(" ", "T") + "Z"
  );
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

/* R:R */

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

  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);

  if (!risk) return "—";

  return (reward / risk).toFixed(2);
}

/* FLAGS */

function pairFlag(pair) {
  const p = String(pair || "").toUpperCase();

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

/* JOURNAL FILTER */

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
    const result = Number(trade.result) || 0;

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

/* JOURNAL */

async function loadTrades() {
  try {
    journalTrades = await api("/api/trades");

    updateJournalSummary();
    renderJournal();
  } catch (e) {
    console.error(e);

    const list = document.getElementById("trades");

    if (list) {
      list.innerHTML =
        `<div class="empty">Не удалось загрузить сделки</div>`;
    }
  }
}

function updateJournalSummary() {
  const total = journalTrades.length;

  const profit = journalTrades.reduce(
    (sum, trade) =>
      sum + (Number(trade.result) || 0),
    0
  );

  const wins = journalTrades.filter(
    trade => Number(trade.result) > 0
  ).length;

  const totalEl =
    document.getElementById("journalTotal");

  const profitEl =
    document.getElementById("journalProfit");

  const winrateEl =
    document.getElementById("journalWinrate");

  if (totalEl) {
    totalEl.textContent = total;
  }

  if (profitEl) {
    profitEl.textContent = formatMoney(profit);
    profitEl.className =
      `summary-value ${
        profit >= 0 ? "profit" : "loss"
      }`;
  }

  if (winrateEl) {
    winrateEl.textContent =
      total
        ? `${Math.round((wins / total) * 100)}%`
        : "0%";
  }
}

function renderJournal() {
  const list =
    document.getElementById("trades");

  if (!list) return;

  const trades = getFilteredTrades();

  if (!trades.length) {
    list.innerHTML =
      `<div class="empty">Сделок пока нет</div>`;
    return;
  }

  list.innerHTML = trades
    .map(renderTradeCard)
    .join("");
}

/* TRADE CARD */

function renderTradeCard(trade) {
  const result = Number(trade.result) || 0;

  const type =
    result > 0
      ? "trade-profit"
      : result < 0
        ? "trade-loss"
        : "";

  const resultClass =
    result > 0
      ? "profit"
      : result < 0
        ? "loss"
        : "";

  const direction =
    String(trade.direction || "").toUpperCase();

  const directionClass =
    direction === "BUY"
      ? "buy"
      : "sell";

  return `
    <div class="trade ${type}">

      <div class="trade-header">

        <div>
          <span class="trade-pair">
            ${pairFlag(trade.pair)}
            ${escapeHtml(trade.pair || "—")}
          </span>

          <span class="trade-direction ${directionClass}">
            ${escapeHtml(direction || "—")}
          </span>
        </div>

        <div class="trade-result ${resultClass}">
          ${formatMoney(result)}
        </div>

      </div>

      <div class="trade-date">
        ${formatTradeDate(trade)}
      </div>

      <div class="trade-details">

        <div class="trade-detail">
          <span>ENTRY</span>
          <b>${trade.entry || "—"}</b>
        </div>

        <div class="trade-detail">
          <span>SL</span>
          <b>${trade.stop_loss || "—"}</b>
        </div>

        <div class="trade-detail">
          <span>TP</span>
          <b>${trade.take_profit || "—"}</b>
        </div>

        <div class="trade-detail">
          <span>R:R</span>
          <b>${calculateRR(trade)}</b>
        </div>

      </div>

      ${
        trade.notes
          ? `
            <div class="trade-notes">
              ${escapeHtml(trade.notes)}
            </div>
          `
          : ""
      }

      <button
        class="delete-trade"
        onclick="deleteTrade(${trade.id})"
      >
        Удалить сделку
      </button>

    </div>
  `;
}

/* DELETE */

async function deleteTrade(id) {
  if (!confirm("Удалить эту сделку?")) {
    return;
  }

  try {
    await api(`/api/trades/${id}`, {
      method: "DELETE"
    });

    await loadTrades();
    await loadBalance();
  } catch (e) {
    alert("Не удалось удалить сделку");
  }
}

/* HOME */

async function loadHomeStats() {
  try {
    const data = await api("/api/stats");

    const total =
      document.getElementById("homeTotal");

    const profit =
      document.getElementById("homeProfit");

    const winrate =
      document.getElementById("homeWinrate");

    if (total) {
      total.textContent = data.total;
    }

    if (profit) {
      profit.textContent =
        formatMoney(data.profit);

      profit.className =
        data.profit >= 0
          ? "card-value profit"
          : "card-value loss";
    }

    if (winrate) {
      winrate.textContent =
        `${data.winrate}%`;
    }
  } catch (e) {
    console.error(e);
  }
}

async function loadHomeTrades() {
  try {
    const trades =
      await api("/api/trades");

    const list =
      document.getElementById("homeTradesList");

    if (!list) return;

    const latest =
      trades.slice(0, 3);

    if (!latest.length) {
      list.innerHTML =
        `<div class="empty">Сделок пока нет</div>`;
      return;
    }

    list.innerHTML =
      latest
        .map(renderTradeCard)
        .join("");

  } catch (e) {
    console.error(e);
  }
}

/* STATS */

async function loadStats() {
  try {
    const data =
      await api("/api/stats");

    const total =
      document.getElementById("total");

    const profit =
      document.getElementById("profit");

    const wins =
      document.getElementById("wins");

    const losses =
      document.getElementById("losses");

    const winrate =
      document.getElementById("winrate");

    if (total) total.textContent = data.total;

    if (profit) {
      profit.textContent =
        formatMoney(data.profit);

      profit.className =
        data.profit >= 0
          ? "profit"
          : "loss";
    }

    if (wins) wins.textContent = data.wins;
    if (losses) losses.textContent = data.losses;

    if (winrate) {
      winrate.textContent =
        `${data.winrate}%`;
    }

  } catch (e) {
    console.error(e);
  }
}

/* SECURITY */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* START */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    document
      .querySelectorAll(".bottom-nav button")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            showPage(button.dataset.page);
          }
        );
      });

    document
      .querySelectorAll(".filters button")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            setJournalFilter(
              button.dataset.filter
            );
          }
        );
      });

    const form =
      document.getElementById("tradeForm");

    if (form) {
      form.addEventListener(
        "submit",
        addTrade
      );
    }

    const balanceButton =
      document.getElementById("editBalance");

    if (balanceButton) {
      balanceButton.addEventListener(
        "click",
        editBalance
      );
    }

    loadBalance();
    loadHomeStats();
    loadHomeTrades();

    setTimeout(() => {
      const loader =
        document.querySelector(".loading-screen");

      if (loader) {
        loader.style.display = "none";
      }
    }, 700);
  }
);
