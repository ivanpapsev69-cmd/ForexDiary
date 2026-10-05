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

/* =========================
   ADD TRADE
========================= */

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

/* =========================
   DATE
========================= */

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

  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);

  if (!risk) return "—";

  return (reward / risk).toFixed(2);
}

/* =========================
   FLAGS
========================= */

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

/* =========================
   JOURNAL
========================= */

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

/* =========================
   TRADE CARD
========================= */

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

/* =========================
   DELETE
========================= */

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

/* =========================
   HOME
========================= */

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

/* =========================
   ANALYTICS HELPERS
========================= */

function aMoney(value) {
  const n = Number(value) || 0;

  if (n === 0) {
    return "$0.00";
  }

  return `${n > 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}

function aClass(value) {
  const n = Number(value) || 0;

  if (n > 0) return "profit";
  if (n < 0) return "loss";

  return "";
}

/* =========================
   STREAKS
========================= */

function streaks(trades) {
  let win = 0;
  let loss = 0;

  let maxWin = 0;
  let maxLoss = 0;

  trades.forEach(trade => {
    const result = Number(trade.result) || 0;

    if (result > 0) {
      win++;
      loss = 0;

      if (win > maxWin) {
        maxWin = win;
      }
    } else if (result < 0) {
      loss++;
      win = 0;

      if (loss > maxLoss) {
        maxLoss = loss;
      }
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

function renderEquity(trades) {
  const container =
    document.getElementById("equityChart");

  if (!container) return;

  if (!trades.length) {
    container.innerHTML =
      `<div class="empty">
        Добавь сделки — график появится здесь
      </div>`;

    return;
  }

  const sorted = [...trades].sort(
    (a, b) =>
      getTradeDate(a) - getTradeDate(b)
  );

  let equity = 0;

  const values = [
    0,
    ...sorted.map(trade => {
      equity += Number(trade.result) || 0;
      return equity;
    })
  ];

  const width = 900;
  const height = 300;
  const paddingX = 24;
  const paddingY = 28;

  const minValue =
    Math.min(...values);

  const maxValue =
    Math.max(...values);

  const range =
    maxValue - minValue || 1;

  const points =
    values.map((value, index) => {
      const x =
        paddingX +
        (index / Math.max(values.length - 1, 1)) *
        (width - paddingX * 2);

      const y =
        height -
        paddingY -
        ((value - minValue) / range) *
        (height - paddingY * 2);

      return {
        x,
        y,
        value
      };
    });

  const polyline =
    points
      .map(point =>
        `${point.x},${point.y}`
      )
      .join(" ");

  const areaPoints =
    [
      `${points[0].x},${height - paddingY}`,
      ...points.map(point =>
        `${point.x},${point.y}`
      ),
      `${points[points.length - 1].x},${height - paddingY}`
    ].join(" ");

  const last =
    points[points.length - 1];

  const first =
    points[0];

  container.innerHTML = `
    <div class="equity-svg">
      <svg
        viewBox="0 0 ${width} ${height}"
        preserveAspectRatio="none"
      >

        <polygon
          class="equity-area"
          points="${areaPoints}"
        />

        <polyline
          class="equity-line"
          points="${polyline}"
        />

        <circle
          class="equity-point"
          cx="${first.x}"
          cy="${first.y}"
          r="4"
        />

        <circle
          class="equity-point"
          cx="${last.x}"
          cy="${last.y}"
          r="5"
        />

      </svg>
    </div>

    <div class="equity-labels">
      <span>
        Старт: $0.00
      </span>

      <span class="${aClass(last.value)}">
        ${aMoney(last.value)}
      </span>
    </div>
  `;
}

/* =========================
   PAIR ANALYTICS
========================= */

function renderPairs(trades) {
  const container =
    document.getElementById("pairAnalytics");

  if (!container) return;

  if (!trades.length) {
    container.innerHTML =
      `<div class="empty">Пока нет данных</div>`;

    return;
  }

  const groups = {};

  trades.forEach(trade => {
    const pair =
      String(trade.pair || "UNKNOWN")
        .trim()
        .toUpperCase();

    if (!groups[pair]) {
      groups[pair] = {
        pair,
        trades: 0,
        wins: 0,
        result: 0
      };
    }

    const result =
      Number(trade.result) || 0;

    groups[pair].trades++;
    groups[pair].result += result;

    if (result > 0) {
      groups[pair].wins++;
    }
  });

  const rows =
    Object.values(groups)
      .sort((a, b) =>
        b.result - a.result
      );

  const maxAbs =
    Math.max(
      ...rows.map(row =>
        Math.abs(row.result)
      ),
      1
    );

  container.innerHTML =
    rows.map(row => {
      const winrate =
        row.trades
          ? Math.round(
              (row.wins / row.trades) * 100
            )
          : 0;

      const width =
        Math.max(
          5,
          (Math.abs(row.result) / maxAbs) * 100
        );

      const positive =
        row.result >= 0;

      return `
        <div class="pair-row">

          <div class="pair-row-top">

            <div class="pair-name">
              ${pairFlag(row.pair)}
              ${escapeHtml(row.pair)}
            </div>

            <div class="pair-info">
              ${row.trades} сделок · ${winrate}%
            </div>

            <div class="pair-result ${aClass(row.result)}">
              ${aMoney(row.result)}
            </div>

          </div>

          <div class="pair-bar">
            <div
              class="pair-bar-fill ${
                positive
                  ? "pair-positive"
                  : "pair-negative"
              }"
              style="width:${width}%"
            ></div>
          </div>

        </div>
      `;
    }).join("");
}

/* =========================
   DAILY ANALYTICS
========================= */

function renderDays(trades) {
  const container =
    document.getElementById("dailyAnalytics");

  if (!container) return;

  if (!trades.length) {
    container.innerHTML =
      `<div class="empty">Пока нет данных</div>`;

    return;
  }

  const groups = {};

  trades.forEach(trade => {
    const date =
      getTradeDate(trade);

    const key =
      date.toLocaleDateString("ru-RU");

    if (!groups[key]) {
      groups[key] = {
        date,
        result: 0,
        trades: 0
      };
    }

    groups[key].result +=
      Number(trade.result) || 0;

    groups[key].trades++;
  });

  const rows =
    Object.values(groups)
      .sort((a, b) =>
        b.date - a.date
      )
      .slice(0, 10);

  const maxAbs =
    Math.max(
      ...rows.map(row =>
        Math.abs(row.result)
      ),
      1
    );

  container.innerHTML =
    rows.map(row => {
      const width =
        Math.max(
          5,
          (Math.abs(row.result) / maxAbs) * 100
        );

      const positive =
        row.result >= 0;

      return `
        <div class="daily-row">

          <div class="daily-date">
            <b>
              ${row.date.toLocaleDateString(
                "ru-RU",
                {
                  day: "2-digit",
                  month: "2-digit"
                }
              )}
            </b>

            <span>
              ${row.trades} ${
                row.trades === 1
                  ? "сделка"
                  : "сделок"
              }
            </span>
          </div>

          <div class="daily-bar">
            <div
              class="daily-bar-fill ${
                positive
                  ? "pair-positive"
                  : "pair-negative"
              }"
              style="width:${width}%"
            ></div>
          </div>

          <div class="daily-result ${aClass(row.result)}">
            ${aMoney(row.result)}
          </div>

        </div>
      `;
    }).join("");
}

/* =========================
   FULL ANALYTICS
========================= */

async function loadAnalytics() {
  try {
    const trades =
      await api("/api/trades");

    const total =
      trades.length;

    const results =
      trades.map(trade =>
        Number(trade.result) || 0
      );

    const profit =
      results.reduce(
        (sum, value) =>
          sum + value,
        0
      );

    const wins =
      results.filter(
        value => value > 0
      );

    const losses =
      results.filter(
        value => value < 0
      );

    const winrate =
      total
        ? (wins.length / total) * 100
        : 0;

    const avgWin =
      wins.length
        ? wins.reduce(
            (sum, value) =>
              sum + value,
            0
          ) / wins.length
        : 0;

    const avgLoss =
      losses.length
        ? losses.reduce(
            (sum, value) =>
              sum + value,
            0
          ) / losses.length
        : 0;

    const grossProfit =
      wins.reduce(
        (sum, value) =>
          sum + value,
        0
      );

    const grossLoss =
      Math.abs(
        losses.reduce(
          (sum, value) =>
            sum + value,
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
      total
        ? profit / total
        : 0;

    const best =
      results.length
        ? Math.max(...results)
        : 0;

    const worst =
      results.length
        ? Math.min(...results)
        : 0;

    const chronological =
      [...trades].sort(
        (a, b) =>
          getTradeDate(a) -
          getTradeDate(b)
      );

    const series =
      streaks(chronological);

    const tradesEl =
      document.getElementById(
        "analyticsTrades"
      );

    const profitEl =
      document.getElementById(
        "aProfit"
      );

    const winrateEl =
      document.getElementById(
        "aWinrate"
      );

    const avgWinEl =
      document.getElementById(
        "aAvgWin"
      );

    const avgLossEl =
      document.getElementById(
        "aAvgLoss"
      );

    const pfEl =
      document.getElementById(
        "aProfitFactor"
      );

    const expectancyEl =
      document.getElementById(
        "aExpectancy"
      );

    const bestEl =
      document.getElementById(
        "aBest"
      );

    const worstEl =
      document.getElementById(
        "aWorst"
      );

    const winStreakEl =
      document.getElementById(
        "aWinStreak"
      );

    const lossStreakEl =
      document.getElementById(
        "aLossStreak"
      );

    if (tradesEl) {
      tradesEl.textContent =
        `${total} ${
          total === 1
            ? "сделка"
            : "сделок"
        }`;
    }

    if (profitEl) {
      profitEl.textContent =
        aMoney(profit);

      profitEl.className =
        aClass(profit);
    }

    if (winrateEl) {
      winrateEl.textContent =
        `${Math.round(winrate)}%`;
    }

    if (avgWinEl) {
      avgWinEl.textContent =
        aMoney(avgWin);
    }

    if (avgLossEl) {
      avgLossEl.textContent =
        aMoney(avgLoss);
    }

    if (pfEl) {
      pfEl.textContent =
        profitFactor === Infinity
          ? "∞"
          : profitFactor.toFixed(2);
    }

    if (expectancyEl) {
      expectancyEl.textContent =
        aMoney(expectancy);

      expectancyEl.className =
        aClass(expectancy);
    }

    if (bestEl) {
      bestEl.textContent =
        aMoney(best);
    }

    if (worstEl) {
      worstEl.textContent =
        aMoney(worst);
    }

    if (winStreakEl) {
      winStreakEl.textContent =
        series.maxWin;
    }

    if (lossStreakEl) {
      lossStreakEl.textContent =
        series.maxLoss;
    }

    renderEquity(trades);
    renderPairs(trades);
    renderDays(trades);

  } catch (e) {
    console.error(
      "Analytics error:",
      e
    );
  }
}

/* =========================
   OLD STATS COMPATIBILITY
========================= */

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

    if (total) {
      total.textContent =
        data.total;
    }

    if (profit) {
      profit.textContent =
        formatMoney(data.profit);

      profit.className =
        data.profit >= 0
          ? "profit"
          : "loss";
    }

    if (wins) {
      wins.textContent =
        data.wins;
    }

    if (losses) {
      losses.textContent =
        data.losses;
    }

    if (winrate) {
      winrate.textContent =
        `${data.winrate}%`;
    }

  } catch (e) {
    console.error(e);
  }
}

/* =========================
   SECURITY
========================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   START
========================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    document
      .querySelectorAll(".bottom-nav button")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            showPage(
              button.dataset.page
            );
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
      document.getElementById(
        "tradeForm"
      );

    if (form) {
      form.addEventListener(
        "submit",
        addTrade
      );
    }

    const balanceButton =
      document.getElementById(
        "editBalance"
      );

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
        document.querySelector(
          ".loading-screen"
        );

      if (loader) {
        loader.style.display =
          "none";
      }
    }, 700);
  }
);
