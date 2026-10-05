const tg = window.Telegram && window.Telegram.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const API = "/api";

let profitChart = null;
let resultChart = null;
let chartsLoaded = false;


// ========================================
// HEADERS
// ========================================

function getHeaders() {

  const headers = {
    "Content-Type": "application/json"
  };

  if (
    tg &&
    tg.initDataUnsafe &&
    tg.initDataUnsafe.user
  ) {
    headers["x-telegram-user-id"] =
      String(tg.initDataUnsafe.user.id);
  }

  return headers;
}


// ========================================
// MONEY
// ========================================

function formatMoney(value) {

  return (
    "$" +
    Number(value || 0).toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )
  );
}


// ========================================
// LOAD CHART.JS
// ========================================

function loadChartLibrary() {

  return new Promise((resolve, reject) => {

    if (window.Chart) {
      resolve();
      return;
    }

    const script =
      document.createElement("script");

    script.src =
      "https://cdn.jsdelivr.net/npm/chart.js";

    script.onload = () => {
      resolve();
    };

    script.onerror = () => {
      reject(
        new Error(
          "Не удалось загрузить Chart.js"
        )
      );
    };

    document.head.appendChild(script);
  });
}


// ========================================
// PAGE NAVIGATION
// ========================================

function showPage(page) {

  document
    .querySelectorAll(".page")
    .forEach((el) => {
      el.classList.remove("active");
    });

  const target =
    document.getElementById(page);

  if (target) {
    target.classList.add("active");
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


// ========================================
// BALANCE
// ========================================

async function loadBalance() {

  try {

    const response =
      await fetch(
        `${API}/balance`,
        {
          headers: getHeaders()
        }
      );

    if (!response.ok) {
      throw new Error(
        "Ошибка загрузки баланса"
      );
    }

    const data =
      await response.json();

    const balance =
      Number(data.balance) || 0;

    const element =
      document.getElementById(
        "balance"
      );

    if (element) {

      element.textContent =
        formatMoney(balance);
    }

  } catch (error) {

    console.error(error);
  }
}


// ========================================
// CHANGE BALANCE
// ========================================

async function changeBalance() {

  const element =
    document.getElementById(
      "balance"
    );

  const currentText =
    element
      ? element.textContent
      : "$10000";

  const currentBalance =
    parseFloat(
      currentText
        .replace("$", "")
        .replace(/,/g, "")
    ) || 0;


  const input =
    prompt(
      "Введите новый баланс:",
      currentBalance
    );


  if (input === null) {
    return;
  }


  const newBalance =
    Number(
      input
        .replace(",", ".")
        .replace("$", "")
        .trim()
    );


  if (!Number.isFinite(newBalance)) {

    alert(
      "Введите корректную сумму."
    );

    return;
  }


  try {

    const response =
      await fetch(
        `${API}/balance`,
        {
          method: "POST",

          headers: getHeaders(),

          body: JSON.stringify({
            balance: newBalance
          })
        }
      );


    if (!response.ok) {

      throw new Error(
        "Ошибка сохранения баланса"
      );
    }


    const data =
      await response.json();


    if (element) {

      element.textContent =
        formatMoney(
          data.balance
        );
    }


    alert(
      "Баланс сохранён!"
    );


  } catch (error) {

    console.error(error);

    alert(
      "Не удалось сохранить баланс."
    );
  }
}


// ========================================
// ADD TRADE
// ========================================

async function addTrade() {

  const trade = {

    pair:
      document.getElementById(
        "pair"
      ).value,

    direction:
      document.getElementById(
        "direction"
      ).value,

    entry:
      document.getElementById(
        "entry"
      ).value,

    stop_loss:
      document.getElementById(
        "stop_loss"
      ).value,

    take_profit:
      document.getElementById(
        "take_profit"
      ).value,

    result:
      document.getElementById(
        "result"
      ).value,

    notes:
      document.getElementById(
        "notes"
      ).value
  };


  if (!trade.pair) {

    alert(
      "Укажи валютную пару"
    );

    return;
  }


  try {

    const response =
      await fetch(
        `${API}/trades`,
        {
          method: "POST",

          headers: getHeaders(),

          body: JSON.stringify(
            trade
          )
        }
      );


    if (!response.ok) {

      throw new Error(
        "Ошибка сохранения"
      );
    }


    alert(
      "Сделка сохранена!"
    );


    document.getElementById(
      "pair"
    ).value = "";

    document.getElementById(
      "entry"
    ).value = "";

    document.getElementById(
      "stop_loss"
    ).value = "";

    document.getElementById(
      "take_profit"
    ).value = "";

    document.getElementById(
      "result"
    ).value = "";

    document.getElementById(
      "notes"
    ).value = "";


    showPage("journal");


  } catch (error) {

    console.error(error);

    alert(
      "Не удалось сохранить сделку"
    );
  }
}


// ========================================
// LOAD TRADES
// ========================================

async function loadTrades() {

  const container =
    document.getElementById(
      "trades"
    );

  if (!container) {
    return;
  }


  container.innerHTML =
    "Загрузка...";


  try {

    const response =
      await fetch(
        `${API}/trades`,
        {
          headers: getHeaders()
        }
      );


    if (!response.ok) {

      throw new Error(
        "Ошибка загрузки"
      );
    }


    const trades =
      await response.json();


    if (!trades.length) {

      container.innerHTML =
        "Сделок пока нет.";

      return;
    }


    container.innerHTML =
      trades.map(
        (trade) => `

        <div class="trade">

          <b>${trade.pair}</b>

          <div>
            ${trade.direction}
          </div>

          <div>
            Вход: ${trade.entry}
          </div>

          <div>
            SL: ${trade.stop_loss}
          </div>

          <div>
            TP: ${trade.take_profit}
          </div>

          <div>
            Результат:
            ${formatMoney(
              trade.result
            )}
          </div>

          <div>
            ${trade.notes || ""}
          </div>

        </div>

      `
      ).join("");


  } catch (error) {

    console.error(error);

    container.innerHTML =
      "Ошибка загрузки сделок.";
  }
}


// ========================================
// LOAD STATS
// ========================================

async function loadStats() {

  try {

    const response =
      await fetch(
        `${API}/stats`,
        {
          headers: getHeaders()
        }
      );


    if (!response.ok) {

      throw new Error(
        "Ошибка статистики"
      );
    }


    const stats =
      await response.json();


    const total =
      document.getElementById(
        "total"
      );

    const profit =
      document.getElementById(
        "profit"
      );

    const wins =
      document.getElementById(
        "wins"
      );

    const losses =
      document.getElementById(
        "losses"
      );

    const winrate =
      document.getElementById(
        "winrate"
      );


    if (total) {

      total.textContent =
        stats.total || 0;
    }


    if (profit) {

      profit.textContent =
        formatMoney(
          stats.profit
        );
    }


    if (wins) {

      wins.textContent =
        stats.wins || 0;
    }


    if (losses) {

      losses.textContent =
        stats.losses || 0;
    }


    if (winrate) {

      winrate.textContent =
        `${stats.winrate || 0}%`;
    }


  } catch (error) {

    console.error(error);
  }
}


// ========================================
// HOME STATS
// ========================================

async function loadHomeStats() {

  try {

    const response =
      await fetch(
        `${API}/stats`,
        {
          headers: getHeaders()
        }
      );


    if (!response.ok) {

      throw new Error(
        "Ошибка статистики"
      );
    }


    const stats =
      await response.json();


    const profit =
      document.getElementById(
        "homeProfit"
      );

    const winrate =
      document.getElementById(
        "homeWinrate"
      );

    const trades =
      document.getElementById(
        "homeTrades"
      );


    if (profit) {

      profit.textContent =
        formatMoney(
          stats.profit
        );
    }


    if (winrate) {

      winrate.textContent =
        `${stats.winrate || 0}%`;
    }


    if (trades) {

      trades.textContent =
        stats.total || 0;
    }


  } catch (error) {

    console.error(error);
  }
}


// ========================================
// HOME TRADES
// ========================================

async function loadHomeTrades() {

  const container =
    document.getElementById(
      "homeTradesList"
    );


  if (!container) {
    return;
  }


  try {

    const response =
      await fetch(
        `${API}/trades`,
        {
          headers: getHeaders()
        }
      );


    if (!response.ok) {

      throw new Error(
        "Ошибка загрузки"
      );
    }


    const trades =
      await response.json();


    if (!trades.length) {

      container.innerHTML =
        "Пока нет сделок";

      return;
    }


    const latestTrades =
      trades.slice(0, 3);


    container.innerHTML =
      latestTrades.map(
        (trade) => `

        <div class="trade">

          <b>${trade.pair}</b>

          <div>
            ${trade.direction}
          </div>

          <div>
            Результат:
            ${formatMoney(
              trade.result
            )}
          </div>

        </div>

      `
      ).join("");


  } catch (error) {

    console.error(error);

    container.innerHTML =
      "Ошибка загрузки сделок.";
  }
}


// ========================================
// CREATE CHART AREA
// ========================================

function createChartArea() {

  const statsPage =
    document.getElementById(
      "stats"
    );

  if (!statsPage) {
    return null;
  }


  let charts =
    document.getElementById(
      "chartsContainer"
    );


  if (charts) {
    return charts;
  }


  charts =
    document.createElement(
      "div"
    );

  charts.id =
    "chartsContainer";


  charts.innerHTML = `

    <div class="chart-card">

      <div class="chart-title">
        Прибыль по сделкам
      </div>

      <div class="chart-subtitle">
        Накопленный результат
      </div>

      <div class="chart-wrapper">
        <canvas
          id="profitChart">
        </canvas>
      </div>

    </div>


    <div class="chart-card">

      <div class="chart-title">
        Результаты сделок
      </div>

      <div class="chart-subtitle">
        Прибыльные и убыточные
      </div>

      <div class="chart-wrapper chart-small">
        <canvas
          id="resultChart">
        </canvas>
      </div>

    </div>

  `;


  const grid =
    statsPage.querySelector(
      ".stats-grid"
    );


  if (grid) {

    grid.after(charts);

  } else {

    statsPage.appendChild(
      charts
    );
  }


  return charts;
}


// ========================================
// LOAD CHARTS
// ========================================

async function loadCharts() {

  try {

    await loadChartLibrary();


    const response =
      await fetch(
        `${API}/trades`,
        {
          headers: getHeaders()
        }
      );


    if (!response.ok) {

      throw new Error(
        "Ошибка загрузки сделок"
      );
    }


    const trades =
      await response.json();


    createChartArea();


    const profitCanvas =
      document.getElementById(
        "profitChart"
      );

    const resultCanvas =
      document.getElementById(
        "resultChart"
      );


    if (!profitCanvas ||
        !resultCanvas) {

      return;
    }


    // ====================================
    // SORT TRADES
    // ====================================

    const sortedTrades =
      [...trades].sort(
        (a, b) =>
          new Date(a.created_at) -
          new Date(b.created_at)
      );


    // ====================================
    // CUMULATIVE PROFIT
    // ====================================

    let cumulative = 0;

    const labels = [];

    const profitData = [];


    sortedTrades.forEach(
      (trade, index) => {

        cumulative +=
          Number(
            trade.result
          ) || 0;

        labels.push(
          `#${index + 1}`
        );

        profitData.push(
          Number(
            cumulative.toFixed(2)
          )
        );
      }
    );


    if (profitChart) {

      profitChart.destroy();
    }


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
                  "Прибыль",

                data:
                  profitData,

                borderColor:
                  "#22d993",

                backgroundColor:
                  "rgba(34,217,147,0.10)",

                borderWidth: 2,

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
              },

              tooltip: {

                callbacks: {

                  label:
                    function(context) {

                      return (
                        " " +
                        formatMoney(
                          context.parsed.y
                        )
                      );
                    }
                }
              }
            },

            scales: {

              x: {

                grid: {
                  display: false
                },

                ticks: {
                  color:
                    "#66738a"
                }
              },

              y: {

                grid: {
                  color:
                    "rgba(255,255,255,0.05)"
                },

                ticks: {

                  color:
                    "#66738a",

                  callback:
                    function(value) {

                      return "$" + value;
                    }
                }
              }
            }
          }
        }
      );


    // ====================================
    // WIN / LOSS
    // ====================================

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


    if (resultChart) {

      resultChart.destroy();
    }


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

                borderWidth: 0,

                hoverOffset: 5
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

                position:
                  "bottom",

                labels: {

                  color:
                    "#f5f7ff",

                  padding: 16,

                  usePointStyle:
                    true
                }
              }
            }
          }
        }
      );


    chartsLoaded = true;


  } catch (error) {

    console.error(
      "Ошибка графиков:",
      error
    );
  }
}


// ========================================
// START
// ========================================

showPage("home");
