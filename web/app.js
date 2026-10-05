let profitChart = null;
let resultChart = null;

/* =========================
   TELEGRAM
========================= */

const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

function getHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };

  const userId =
    tg?.initDataUnsafe?.user?.id;

  if (userId) {
    headers["x-telegram-user-id"] =
      String(userId);
  }

  return headers;
}

/* =========================
   FORMAT
========================= */

function formatMoney(value) {
  const number = Number(value) || 0;

  return (
    "$" +
    number.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  );
}

/* =========================
   PAGE NAVIGATION
========================= */

function showPage(page) {

  document
    .querySelectorAll(".page")
    .forEach(el => {
      el.classList.remove("active");
    });

  const target =
    document.getElementById(page);

  if (target) {
    target.classList.add("active");
  }

  document
    .querySelectorAll(".bottom-nav button")
    .forEach(button => {
      button.classList.remove("active");
    });

  const activeButton =
    document.querySelector(
      `.bottom-nav button[data-page="${page}"]`
    );

  if (activeButton) {
    activeButton.classList.add("active");
  }

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
    loadCharts();
  }
}

/* =========================
   BALANCE
========================= */

async function loadBalance() {

  try {

    const response =
      await fetch("/api/balance", {
        headers: getHeaders()
      });

    const data =
      await response.json();

    const balance =
      document.getElementById("balance");

    if (balance) {
      balance.textContent =
        formatMoney(data.balance);
    }

  } catch (error) {

    console.error(
      "Ошибка загрузки баланса:",
      error
    );
  }
}

/* =========================
   MANUAL BALANCE CHANGE
========================= */

async function changeBalance() {

  const currentElement =
    document.getElementById("balance");

  const currentText =
    currentElement?.textContent
      ?.replace(/[$,]/g, "") || "10000";

  const current =
    Number(currentText) || 10000;

  const value =
    prompt(
      "Введите новый баланс:",
      current
    );

  if (value === null) {
    return;
  }

  const newBalance =
    Number(value);

  if (!Number.isFinite(newBalance)) {
    alert("Введите корректную сумму.");
    return;
  }

  try {

    const response =
      await fetch("/api/balance", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          balance: newBalance
        })
      });

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Ошибка"
      );
    }

    await loadBalance();

  } catch (error) {

    console.error(error);

    alert(
      "Не удалось изменить баланс."
    );
  }
}

/* =========================
   ADD TRADE
========================= */

async function addTrade() {

  const pair =
    document.getElementById("pair")?.value
      ?.trim();

  const direction =
    document.getElementById("direction")?.value
      ?.trim();

  const entry =
    Number(
      document.getElementById("entry")?.value
    ) || 0;

  const stopLoss =
    Number(
      document.getElementById("stop_loss")?.value
    ) || 0;

  const takeProfit =
    Number(
      document.getElementById("take_profit")?.value
    ) || 0;

  const result =
    Number(
      document.getElementById("result")?.value
    ) || 0;

  const notes =
    document.getElementById("notes")?.value
      ?.trim() || "";

  if (!pair) {
    alert("Укажи валютную пару.");
    return;
  }

  try {

    const response =
      await fetch("/api/trades", {
        method: "POST",
        headers: getHeaders(),

        body: JSON.stringify({
          pair,
          direction,
          entry,
          stop_loss: stopLoss,
          take_profit: takeProfit,
          result,
          notes
        })
      });

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Ошибка сохранения"
      );
    }

    /* Очищаем форму */

    const fields = [
      "pair",
      "entry",
      "stop_loss",
      "take_profit",
      "result",
      "notes"
    ];

    fields.forEach(id => {
      const element =
        document.getElementById(id);

      if (element) {
        element.value = "";
      }
    });

    /* Обновляем баланс сразу */

    await loadBalance();

    /* Обновляем журнал */

    await loadTrades();

    /* Обновляем статистику */

    await loadStats();
    await loadHomeStats();
    await loadHomeTrades();

    /* Обновляем графики */

    if (
      typeof loadCharts === "function"
    ) {
      await loadCharts();
    }

    alert(
      "Сделка сохранена!\n\n" +
      "Результат: " +
      (result >= 0 ? "+" : "") +
      formatMoney(result) +
      "\n" +
      "Новый баланс: " +
      formatMoney(data.balance)
    );

    showPage("journal");

  } catch (error) {

    console.error(
      "Ошибка добавления сделки:",
      error
    );

    alert(
      "Не удалось сохранить сделку."
    );
  }
}

/* =========================
   LOAD TRADES
========================= */

async function loadTrades() {

  try {

    const response =
      await fetch("/api/trades", {
        headers: getHeaders()
      });

    const trades =
      await response.json();

    const container =
      document.getElementById("trades");

    if (!container) {
      return;
    }

    container.innerHTML = "";

    if (!trades.length) {

      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <div>Пока нет сделок</div>
          <small>Добавь первую сделку</small>
        </div>
      `;

      return;
    }

    trades.forEach(trade => {

      const result =
        Number(trade.result) || 0;

      const resultClass =
        result > 0
          ? "profit"
          : result < 0
            ? "loss"
            : "neutral";

      const resultSign =
        result > 0 ? "+" : "";

      const direction =
        trade.direction || "";

      const date =
        trade.created_at
          ? new Date(
              trade.created_at.replace(
                " ",
                "T"
              ) + "Z"
            ).toLocaleString(
              "ru-RU",
              {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
              }
            )
          : "";

      const card =
        document.createElement("div");

      card.className =
        "trade-card";

      card.innerHTML = `
        <div class="trade-main">

          <div class="trade-pair">
            ${trade.pair || "—"}
          </div>

          <div class="trade-direction">
            ${direction || "—"}
          </div>

          <div class="trade-date">
            ${date}
          </div>

        </div>

        <div class="trade-result ${resultClass}">
          ${resultSign}${formatMoney(result)}
        </div>

        <button
          class="trade-delete"
          onclick="deleteTrade(${trade.id})"
        >
          ✕
        </button>
      `;

      container.appendChild(card);
    });

  } catch (error) {

    console.error(
      "Ошибка загрузки сделок:",
      error
    );
  }
}

/* =========================
   DELETE TRADE
========================= */

async function deleteTrade(id) {

  const confirmDelete =
    confirm(
      "Удалить эту сделку?\n\n" +
      "Её результат будет вычтен из баланса."
    );

  if (!confirmDelete) {
    return;
  }

  try {

    const response =
      await fetch(
        `/api/trades/${id}`,
        {
          method: "DELETE",
          headers: getHeaders()
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Ошибка удаления"
      );
    }

    await loadBalance();
    await loadTrades();
    await loadStats();
    await loadHomeStats();
    await loadHomeTrades();

    if (
      typeof loadCharts === "function"
    ) {
      await loadCharts();
    }

  } catch (error) {

    console.error(error);

    alert(
      "Не удалось удалить сделку."
    );
  }
}

/* =========================
   STATISTICS
========================= */

async function loadStats() {

  try {

    const response =
      await fetch("/api/stats", {
        headers: getHeaders()
      });

    const data =
      await response.json();

    setText(
      "total",
      data.total
    );

    setText(
      "profit",
      formatMoney(data.profit)
    );

    setText(
      "wins",
      data.wins
    );

    setText(
      "losses",
      data.losses
    );

    setText(
      "winrate",
      data.winrate + "%"
    );

  } catch (error) {

    console.error(
      "Ошибка статистики:",
      error
    );
  }
}

/* =========================
   HOME STATISTICS
========================= */

async function loadHomeStats() {

  try {

    const response =
      await fetch("/api/stats", {
        headers: getHeaders()
      });

    const data =
      await response.json();

    setText(
      "homeProfit",
      formatMoney(data.profit)
    );

    setText(
      "homeWinrate",
      data.winrate + "%"
    );

    setText(
      "homeTrades",
      data.total
    );

  } catch (error) {

    console.error(
      "Ошибка статистики главной:",
      error
    );
  }
}

/* =========================
   HOME TRADES
========================= */

async function loadHomeTrades() {

  try {

    const response =
      await fetch("/api/trades", {
        headers: getHeaders()
      });

    const trades =
      await response.json();

    const container =
      document.getElementById(
        "homeTradesList"
      );

    if (!container) {
      return;
    }

    container.innerHTML = "";

    const latest =
      trades.slice(0, 3);

    if (!latest.length) {

      container.innerHTML = `
        <div class="empty-state">
          Сделок пока нет
        </div>
      `;

      return;
    }

    latest.forEach(trade => {

      const result =
        Number(trade.result) || 0;

      const resultClass =
        result > 0
          ? "profit"
          : result < 0
            ? "loss"
            : "neutral";

      const sign =
        result > 0 ? "+" : "";

      const item =
        document.createElement("div");

      item.className =
        "home-trade";

      item.innerHTML = `
        <div>
          <strong>
            ${trade.pair || "—"}
          </strong>

          <small>
            ${trade.direction || ""}
          </small>
        </div>

        <span class="${resultClass}">
          ${sign}${formatMoney(result)}
        </span>
      `;

      container.appendChild(item);
    });

  } catch (error) {

    console.error(
      "Ошибка последних сделок:",
      error
    );
  }
}

/* =========================
   CHART.JS
========================= */

async function loadChartLibrary() {

  if (
    typeof Chart !== "undefined"
  ) {
    return;
  }

  return new Promise(
    (resolve, reject) => {

      const script =
        document.createElement("script");

      script.src =
        "https://cdn.jsdelivr.net/npm/chart.js";

      script.onload = resolve;
      script.onerror = reject;

      document.head.appendChild(
        script
      );
    }
  );
}

/* =========================
   CHART CONTAINERS
========================= */

function createChartArea() {

  const statsPage =
    document.getElementById("stats");

  if (!statsPage) {
    return;
  }

  if (
    !document.getElementById(
      "profitChart"
    )
  ) {

    const card =
      document.createElement("div");

    card.className =
      "chart-card";

    card.innerHTML = `
      <div class="chart-title">
        Прибыль по сделкам
      </div>

      <div class="chart-subtitle">
        Накопленный результат
      </div>

      <div class="chart-wrapper">
        <canvas id="profitChart"></canvas>
      </div>
    `;

    statsPage.appendChild(card);
  }

  if (
    !document.getElementById(
      "resultChart"
    )
  ) {

    const card =
      document.createElement("div");

    card.className =
      "chart-card";

    card.innerHTML = `
      <div class="chart-title">
        Результаты сделок
      </div>

      <div class="chart-subtitle">
        Прибыльные и убыточные
      </div>

      <div class="chart-wrapper chart-small">
        <canvas id="resultChart"></canvas>
      </div>
    `;

    statsPage.appendChild(card);
  }
}

/* =========================
   LOAD CHARTS
========================= */

async function loadCharts() {

  try {

    await loadChartLibrary();

    createChartArea();

    const response =
      await fetch("/api/trades", {
        headers: getHeaders()
      });

    const trades =
      await response.json();

    const ordered =
      [...trades].reverse();

    let accumulated = 0;

    const labels = [];
    const values = [];

    ordered.forEach(
      (trade, index) => {

        accumulated +=
          Number(trade.result) || 0;

        labels.push(
          `Сделка ${index + 1}`
        );

        values.push(
          accumulated
        );
      }
    );

    const wins =
      trades.filter(
        trade =>
          Number(trade.result) > 0
      ).length;

    const losses =
      trades.filter(
        trade =>
          Number(trade.result) < 0
      ).length;

    const breakeven =
      trades.filter(
        trade =>
          Number(trade.result) === 0
      ).length;

    /* Удаляем старый график */

    if (profitChart) {
      profitChart.destroy();
    }

    if (resultChart) {
      resultChart.destroy();
    }

    const profitCanvas =
      document.getElementById(
        "profitChart"
      );

    const resultCanvas =
      document.getElementById(
        "resultChart"
      );

    if (
      profitCanvas &&
      ordered.length
    ) {

      profitChart =
        new Chart(
          profitCanvas,
          {
            type: "line",

            data: {
              labels,

              datasets: [
                {
                  label:
                    "Накопленная прибыль",

                  data: values,

                  borderColor:
                    "#22d993",

                  backgroundColor:
                    "rgba(34,217,147,0.12)",

                  borderWidth: 3,

                  fill: true,

                  tension: 0.35,

                  pointRadius: 3,

                  pointBackgroundColor:
                    "#22d993"
                }
              ]
            },

            options: {
              responsive: true,

              maintainAspectRatio:
                false,

              plugins: {
                legend: {
                  display: false
                }
              },

              scales: {

                x: {
                  ticks: {
                    color:
                      "#8995aa"
                  },

                  grid: {
                    color:
                      "rgba(255,255,255,0.05)"
                  }
                },

                y: {
                  ticks: {
                    color:
                      "#8995aa",

                    callback:
                      value =>
                        "$" + value
                  },

                  grid: {
                    color:
                      "rgba(255,255,255,0.05)"
                  }
                }
              }
            }
          }
        );
    }

    if (resultCanvas) {

      resultChart =
        new Chart(
          resultCanvas,
          {
            type: "doughnut",

            data: {
              labels: [
                "Прибыльные",
                "Убыточные",
                "В ноль"
              ],

              datasets: [
                {
                  data: [
                    wins,
                    losses,
                    breakeven
                  ],

                  backgroundColor: [
                    "#22d993",
                    "#ff5573",
                    "#66738a"
                  ],

                  borderWidth: 0
                }
              ]
            },

            options: {
              responsive: true,

              maintainAspectRatio:
                false,

              cutout: "68%",

              plugins: {
                legend: {
                  labels: {
                    color:
                      "#dfe7f5"
                  }
                }
              }
            }
          }
        );
    }

  } catch (error) {

    console.error(
      "Ошибка графиков:",
      error
    );
  }
}

/* =========================
   HELPER
========================= */

function setText(id, value) {

  const element =
    document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

/* =========================
   START
========================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    await loadBalance();
    await loadHomeStats();
    await loadHomeTrades();

    showPage("home");
  }
);
