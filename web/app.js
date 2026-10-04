const tg = window.Telegram && window.Telegram.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const API = "/api";

function getHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };

  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    headers["x-telegram-user-id"] =
      String(tg.initDataUnsafe.user.id);
  }

  return headers;
}

function formatMoney(value) {
  return (
    "$" +
    Number(value || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  );
}

function showPage(page) {
  document.querySelectorAll(".page").forEach((el) => {
    el.classList.remove("active");
  });

  const target = document.getElementById(page);

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
  }
}


/* =========================
   БАЛАНС
========================= */

async function loadBalance() {
  try {
    const response = await fetch(`${API}/balance`, {
      headers: getHeaders()
    });

    if (!response.ok) {
      throw new Error("Ошибка загрузки баланса");
    }

    const data = await response.json();

    const balance = Number(data.balance) || 0;

    const element = document.getElementById("balance");

    if (element) {
      element.textContent = formatMoney(balance);
    }

  } catch (error) {
    console.error(error);
  }
}


async function changeBalance() {

  const currentElement =
    document.getElementById("balance");

  const currentText =
    currentElement
      ? currentElement.textContent
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
    alert("Введите корректную сумму.");
    return;
  }

  try {

    const response =
      await fetch(`${API}/balance`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          balance: newBalance
        })
      });

    if (!response.ok) {
      throw new Error(
        "Ошибка сохранения баланса"
      );
    }

    const data =
      await response.json();

    if (currentElement) {
      currentElement.textContent =
        formatMoney(data.balance);
    }

    alert("Баланс сохранён!");

  } catch (error) {

    console.error(error);

    alert(
      "Не удалось сохранить баланс."
    );
  }
}


/* =========================
   ДОБАВЛЕНИЕ СДЕЛКИ
========================= */

async function addTrade() {

  const trade = {

    pair:
      document.getElementById("pair").value,

    direction:
      document.getElementById("direction").value,

    entry:
      document.getElementById("entry").value,

    stop_loss:
      document.getElementById("stop_loss").value,

    take_profit:
      document.getElementById("take_profit").value,

    result:
      document.getElementById("result").value,

    notes:
      document.getElementById("notes").value
  };


  if (!trade.pair) {

    alert("Укажи валютную пару");

    return;
  }


  try {

    const response =
      await fetch(`${API}/trades`, {

        method: "POST",

        headers: getHeaders(),

        body: JSON.stringify(trade)
      });


    if (!response.ok) {

      throw new Error(
        "Ошибка сохранения"
      );
    }


    alert("Сделка сохранена!");


    document.getElementById("pair").value = "";

    document.getElementById("entry").value = "";

    document.getElementById("stop_loss").value = "";

    document.getElementById("take_profit").value = "";

    document.getElementById("result").value = "";

    document.getElementById("notes").value = "";


    showPage("journal");


  } catch (error) {

    console.error(error);

    alert(
      "Не удалось сохранить сделку"
    );
  }
}


/* =========================
   ЖУРНАЛ
========================= */

async function loadTrades() {

  const container =
    document.getElementById("trades");

  if (!container) {
    return;
  }


  container.innerHTML =
    "Загрузка...";


  try {

    const response =
      await fetch(`${API}/trades`, {
        headers: getHeaders()
      });


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
      trades.map((trade) => `

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
            ${formatMoney(trade.result)}
          </div>

          <div>
            ${trade.notes || ""}
          </div>

        </div>

      `).join("");


  } catch (error) {

    console.error(error);

    container.innerHTML =
      "Ошибка загрузки сделок.";
  }
}


/* =========================
   СТАТИСТИКА
========================= */

async function loadStats() {

  try {

    const response =
      await fetch(`${API}/stats`, {
        headers: getHeaders()
      });


    if (!response.ok) {

      throw new Error(
        "Ошибка статистики"
      );
    }


    const stats =
      await response.json();


    document.getElementById("total").textContent =
      stats.total || 0;


    document.getElementById("profit").textContent =
      formatMoney(stats.profit);


    document.getElementById("wins").textContent =
      stats.wins || 0;


    document.getElementById("losses").textContent =
      stats.losses || 0;


    document.getElementById("winrate").textContent =
      `${stats.winrate || 0}%`;


  } catch (error) {

    console.error(error);
  }
}


/* =========================
   СТАТИСТИКА НА ГЛАВНОЙ
========================= */

async function loadHomeStats() {

  try {

    const response =
      await fetch(`${API}/stats`, {
        headers: getHeaders()
      });


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
        formatMoney(stats.profit);
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


/* =========================
   ПОСЛЕДНИЕ СДЕЛКИ
========================= */

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
      await fetch(`${API}/trades`, {
        headers: getHeaders()
      });


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
      latestTrades.map((trade) => `

        <div class="trade">

          <b>${trade.pair}</b>

          <div>
            ${trade.direction}
          </div>

          <div>
            Результат:
            ${formatMoney(trade.result)}
          </div>

        </div>

      `).join("");


  } catch (error) {

    console.error(error);

    container.innerHTML =
      "Ошибка загрузки сделок.";
  }
}


/* =========================
   ЗАПУСК
========================= */

showPage("home");
