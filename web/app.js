let profitChart = null;
let resultChart = null;

let allJournalTrades = [];
let activeTradeFilter = "all";


/* =========================
   TELEGRAM
========================= */

const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}


/* =========================
   HEADERS
========================= */

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
   FORMAT MONEY
========================= */

function formatMoney(value) {

  const number =
    Number(value) || 0;

  return "$" +
    number.toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    );
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
   PAGE NAVIGATION
========================= */

function showPage(page) {

  document
    .querySelectorAll(".page")
    .forEach(
      element =>
        element.classList.remove("active")
    );


  const target =
    document.getElementById(page);

  if (target) {
    target.classList.add("active");
  }


  document
    .querySelectorAll(".bottom-nav button")
    .forEach(
      button =>
        button.classList.remove("active")
    );


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
      await fetch(
        "/api/balance",
        {
          headers: getHeaders()
        }
      );

    const data =
      await response.json();

    setText(
      "balance",
      formatMoney(data.balance)
    );

  } catch (error) {

    console.error(
      "Ошибка баланса:",
      error
    );

  }
}


/* =========================
   CHANGE BALANCE
========================= */

async function changeBalance() {

  const element =
    document.getElementById("balance");

  const current =
    Number(
      element?.textContent
        ?.replace(/[$,]/g, "")
    ) || 10000;


  const value =
    prompt(
      "Введите новый баланс:",
      current
    );


  if (value === null) {
    return;
  }


  const balance =
    Number(value);


  if (!Number.isFinite(balance)) {

    alert(
      "Введите корректную сумму."
    );

    return;
  }


  try {

    const response =
      await fetch(
        "/api/balance",
        {
          method: "POST",
          headers: getHeaders(),

          body: JSON.stringify({
            balance
          })
        }
      );


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
    document
      .getElementById("pair")
      ?.value
      ?.trim();


  const direction =
    document
      .getElementById("direction")
      ?.value;


  const entry =
    Number(
      document
        .getElementById("entry")
        ?.value
    ) || 0;


  const stopLoss =
    Number(
      document
        .getElementById("stop_loss")
        ?.value
    ) || 0;


  const takeProfit =
    Number(
      document
        .getElementById("take_profit")
        ?.value
    ) || 0;


  const result =
    Number(
      document
        .getElementById("result")
        ?.value
    ) || 0;


  const notes =
    document
      .getElementById("notes")
      ?.value
      ?.trim() || "";


  if (!pair) {

    alert(
      "Укажи валютную пару."
    );

    return;
  }


  try {

    const response =
      await fetch(
        "/api/trades",
        {
          method: "POST",

          headers:
            getHeaders(),

          body:
            JSON.stringify({
              pair,
              direction,
              entry,
              stop_loss: stopLoss,
              take_profit: takeProfit,
              result,
              notes
            })
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Ошибка сохранения"
      );

    }


    [
      "pair",
      "entry",
      "stop_loss",
      "take_profit",
      "result",
      "notes"
    ].forEach(id => {

      const element =
        document.getElementById(id);

      if (element) {
        element.value = "";
      }

    });


    await loadBalance();
    await loadTrades();
    await loadStats();
    await loadHomeStats();
    await loadHomeTrades();


    if (
      typeof loadCharts ===
      "function"
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
      "Ошибка сделки:",
      error
    );

    alert(
      "Не удалось сохранить сделку."
    );

  }
}


/* =========================
   JOURNAL DATE
========================= */

function getTradeDate(trade) {

  if (!trade.created_at) {
    return null;
  }

  return new Date(
    trade.created_at
      .replace(" ", "T") +
    "Z"
  );
}


/* =========================
   FLAGS
========================= */

function getTradeFlags(pair) {

  const map = {

    EUR: "🇪🇺",
    USD: "🇺🇸",
    GBP: "🇬🇧",
    JPY: "🇯🇵",
    AUD: "🇦🇺",
    CAD: "🇨🇦",
    CHF: "🇨🇭",
    NZD: "🇳🇿",

    XAU: "🪙",
    XAG: "🥈"

  };


  const parts =
    String(pair || "")
      .toUpperCase()
      .replace(
        /[^A-Z]/g,
        " "
      )
      .trim()
      .split(/\s+/);


  return parts
    .slice(0, 2)
    .map(
      value =>
        map[value] || "•"
    )
    .join(" ");
}


/* =========================
   R:R
========================= */

function getRR(trade) {

  const entry =
    Number(trade.entry);

  const sl =
    Number(trade.stop_loss);

  const tp =
    Number(trade.take_profit);


  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(sl) ||
    !Number.isFinite(tp)
  ) {
    return null;
  }


  const risk =
    Math.abs(entry - sl);

  const reward =
    Math.abs(tp - entry);


  if (risk <= 0) {
    return null;
  }


  return reward / risk;
}


/* =========================
   FILTER
========================= */

function getFilteredTrades() {

  return allJournalTrades.filter(
    trade => {

      const result =
        Number(trade.result) || 0;


      if (
        activeTradeFilter ===
        "profit"
      ) {
        return result > 0;
      }


      if (
        activeTradeFilter ===
        "loss"
      ) {
        return result < 0;
      }


      if (
        activeTradeFilter ===
        "today"
      ) {

        const date =
          getTradeDate(trade);

        return (
          date &&
          date.toDateString() ===
          new Date().toDateString()
        );

      }


      return true;

    }
  );
}


/* =========================
   FILTER BUTTON
========================= */

function filterTrades(
  filter,
  button
) {

  activeTradeFilter =
    filter;


  document
    .querySelectorAll(
      ".journal-filter"
    )
    .forEach(
      element =>
        element.classList.remove(
          "active"
        )
    );


  if (button) {
    button.classList.add(
      "active"
    );
  }


  renderTrades(
    getFilteredTrades()
  );
}


/* =========================
   JOURNAL SUMMARY
========================= */

function updateJournalSummary() {

  const total =
    allJournalTrades.length;


  const profit =
    allJournalTrades.reduce(
      (sum, trade) =>
        sum +
        (Number(trade.result) || 0),
      0
    );


  const wins =
    allJournalTrades.filter(
      trade =>
        Number(trade.result) > 0
    ).length;


  const losses =
    allJournalTrades.filter(
      trade =>
        Number(trade.result) < 0
    ).length;


  const today =
    allJournalTrades.filter(
      trade => {

        const date =
          getTradeDate(trade);

        return (
          date &&
          date.toDateString() ===
          new Date().toDateString()
        );

      }
    ).length;


  setText(
    "filterAll",
    total
  );

  setText(
    "filterProfit",
    wins
  );

  setText(
    "filterLoss",
    losses
  );

  setText(
    "filterToday",
    today
  );


  setText(
    "journalProfit",
    (profit >= 0 ? "+" : "") +
    formatMoney(profit)
  );


  setText(
    "journalTotal",
    total
  );


  setText(
    "journalWins",
    wins
  );


  setText(
    "journalLosses",
    losses
  );


  const winrate =
    total
      ? Math.round(
          wins / total * 100
        )
      : 0;


  const lossrate =
    total
      ? Math.round(
          losses / total * 100
        )
      : 0;


  setText(
    "journalWinrate",
    winrate + "%"
  );


  setText(
    "journalLossrate",
    lossrate + "%"
  );


  const profitElement =
    document.getElementById(
      "journalProfit"
    );


  if (profitElement) {

    profitElement.classList.toggle(
      "positive",
      profit > 0
    );

    profitElement.classList.toggle(
      "negative",
      profit < 0
    );

    profitElement.classList.toggle(
      "neutral",
      profit === 0
    );

  }
}


/* =========================
   LOAD JOURNAL
========================= */

async function loadTrades() {

  try {

    const response =
      await fetch(
        "/api/trades",
        {
          headers: getHeaders()
        }
      );


    allJournalTrades =
      await response.json();


    updateJournalSummary();


    renderTrades(
      getFilteredTrades()
    );


  } catch (error) {

    console.error(
      "Ошибка журнала:",
      error
    );

  }
}


/* =========================
   RENDER JOURNAL
========================= */

function renderTrades(
  trades
) {

  const container =
    document.getElementById(
      "trades"
    );


  if (!container) {
    return;
  }


  container.innerHTML = "";


  if (!trades.length) {

    container.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">
          📊
        </div>

        <div>
          Сделок нет
        </div>

        <small>
          Измени фильтр или добавь новую сделку
        </small>

      </div>

    `;

    return;
  }


  trades.forEach(
    trade => {

      const result =
        Number(trade.result) || 0;


      const resultClass =
        result > 0
          ? "profit"
          : result < 0
            ? "loss"
            : "neutral";


      const sign =
        result > 0
          ? "+"
          : "";


      const direction =
        String(
          trade.direction || ""
        ).toUpperCase();


      const date =
        getTradeDate(trade);


      const dateText =
        date
          ? date.toLocaleDateString(
              "ru-RU",
              {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
              }
            )
          : "";


      const timeText =
        date
          ? date.toLocaleTimeString(
              "ru-RU",
              {
                hour: "2-digit",
                minute: "2-digit"
              }
            )
          : "";


      const rr =
        getRR(trade);


      const rrText =
        rr
          ? "1:" +
            rr.toFixed(1)
          : "—";


      const card =
        document.createElement(
          "div"
        );


      card.className =
        "journal-trade " +
        resultClass;


      card.innerHTML = `

        <div class="journal-trade-top">

          <div class="journal-trade-left">

            <span
              class="direction-badge ${
                direction === "BUY"
                  ? "buy"
                  : "sell"
              }"
            >
              ${direction || "—"}
            </span>


            <div>

              <div class="journal-pair">
                ${trade.pair || "—"}
              </div>

              <div class="journal-flags">
                ${getTradeFlags(
                  trade.pair
                )}
              </div>

            </div>

          </div>


          <div class="journal-result-wrap">

            <strong class="journal-result">

              ${sign}${formatMoney(
                result
              )}

            </strong>

            <span class="journal-percent">
              Результат
            </span>

          </div>


          <div class="journal-date">

            <b>
              ${dateText}
            </b>

            <span>
              ${timeText}
            </span>

          </div>


          <button
            class="journal-more"
            type="button"
          >
            ⋮
          </button>

        </div>


        <div class="journal-levels">

          <div>

            <span>
              Entry
            </span>

            <b>
              ${trade.entry || "—"}
            </b>

          </div>


          <div>

            <span>
              SL
            </span>

            <b>
              ${trade.stop_loss || "—"}
            </b>

          </div>


          <div>

            <span>
              TP
            </span>

            <b class="tp-value">
              ${trade.take_profit || "—"}
            </b>

          </div>


          <div class="rr-badge">

            <span>
              R:R
            </span>

            <b>
              ${rrText}
            </b>

          </div>

        </div>


        <div class="journal-bottom">

          <div class="journal-note">

            <span class="note-icon">
              ▤
            </span>

            <span>
              ${
                trade.notes ||
                "Без заметки"
              }
            </span>

          </div>


          <button
            class="journal-delete"
            onclick="deleteTrade(${trade.id})"
          >
            ✕
          </button>

        </div>

      `;


      container.appendChild(
        card
      );

    }
  );
}


/* =========================
   DELETE TRADE
========================= */

async function deleteTrade(id) {

  const confirmed =
    confirm(
      "Удалить эту сделку?\n\n" +
      "Её результат будет вычтен из баланса."
    );


  if (!confirmed) {
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
        data.error ||
        "Ошибка удаления"
      );

    }


    await loadBalance();
    await loadTrades();
    await loadStats();
    await loadHomeStats();
    await loadHomeTrades();


    if (
      typeof loadCharts ===
      "function"
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
   STATS
========================= */

async function loadStats() {

  try {

    const response =
      await fetch(
        "/api/stats",
        {
          headers: getHeaders()
        }
      );


    const data =
      await response.json();


    setText(
      "total",
      data.total
    );

    setText(
      "profit",
      (data.profit >= 0 ? "+" : "") +
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
   HOME STATS
========================= */

async function loadHomeStats() {

  try {

    const response =
      await fetch(
        "/api/stats",
        {
          headers: getHeaders()
        }
      );


    const data =
      await response.json();


    setText(
      "homeProfit",
      (data.profit >= 0 ? "+" : "") +
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


    setText(
      "homeWins",
      data.wins
    );


    const profit =
      document.getElementById(
        "homeProfit"
      );


    if (profit) {

      profit.classList.toggle(
        "positive",
        data.profit > 0
      );

      profit.classList.toggle(
        "negative",
        data.profit < 0
      );

    }


  } catch (error) {

    console.error(
      "Ошибка главной:",
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
      await fetch(
        "/api/trades",
        {
          headers: getHeaders()
        }
      );


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
        <div class="empty">
          Пока нет сделок
        </div>
      `;

      return;
    }


    latest.forEach(
      trade => {

        const result =
          Number(trade.result) || 0;


        const resultClass =
          result > 0
            ? "positive"
            : result < 0
              ? "negative"
              : "neutral";


        const sign =
          result > 0
            ? "+"
            : "";


        const item =
          document.createElement(
            "div"
          );


        item.className =
          "trade";


        item.innerHTML = `

          <b>
            ${trade.pair || "—"}
          </b>

          <div>
            ${trade.direction || "—"}
          </div>

          <div>
            ${sign}${formatMoney(
              result
            )}
          </div>

        `;


        item.classList.add(
          resultClass
        );


        container.appendChild(
          item
        );

      }
    );


  } catch (error) {

    console.error(
      "Ошибка последних сделок:",
      error
    );

  }
}


/* =========================
   CHART LIBRARY
========================= */

async function loadChartLibrary() {

  if (
    typeof Chart !==
    "undefined"
  ) {
    return;
  }


  return new Promise(
    (resolve, reject) => {

      const script =
        document.createElement(
          "script"
        );


      script.src =
        "https://cdn.jsdelivr.net/npm/chart.js";


      script.onload =
        resolve;

      script.onerror =
        reject;


      document.head.appendChild(
        script
      );

    }
  );
}


/* =========================
   CHART AREAS
========================= */

function createChartArea() {

  const statsPage =
    document.getElementById(
      "stats"
    );


  if (!statsPage) {
    return;
  }


  if (
    !document.getElementById(
      "profitChart"
    )
  ) {

    const card =
      document.createElement(
        "div"
      );


    card.className =
      "card chart-card";


    card.innerHTML = `

      <div class="card-title">
        Прибыль по сделкам
      </div>

      <div class="chart-wrapper">
        <canvas
          id="profitChart"
        ></canvas>
      </div>

    `;


    statsPage.appendChild(
      card
    );

  }


  if (
    !document.getElementById(
      "resultChart"
    )
  ) {

    const card =
      document.createElement(
        "div"
      );


    card.className =
      "card chart-card";


    card.innerHTML = `

      <div class="card-title">
        Результаты сделок
      </div>

      <div class="chart-wrapper chart-small">
        <canvas
          id="resultChart"
        ></canvas>
      </div>

    `;


    statsPage.appendChild(
      card
    );

  }
}


/* =========================
   CHARTS
========================= */

async function loadCharts() {

  try {

    await loadChartLibrary();

    createChartArea();


    const response =
      await fetch(
        "/api/trades",
        {
          headers: getHeaders()
        }
      );


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

                  data:
                    values,

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
                    color: "#8995aa"
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
