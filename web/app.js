const tg = window.Telegram && window.Telegram.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const API = "/api";

function showPage(page) {
  document.querySelectorAll(".page").forEach((el) => {
    el.classList.remove("active");
  });

  const target = document.getElementById(page);

  if (target) {
    target.classList.add("active");
  }

  if (page === "journal") {
    loadTrades();
  }

  if (page === "stats") {
    loadStats();
  }
}

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

async function addTrade() {
  const trade = {
    pair: document.getElementById("pair").value,
    direction: document.getElementById("direction").value,
    entry: document.getElementById("entry").value,
    stop_loss: document.getElementById("stop_loss").value,
    take_profit: document.getElementById("take_profit").value,
    result: document.getElementById("result").value,
    notes: document.getElementById("notes").value
  };

  if (!trade.pair) {
    alert("Укажи валютную пару");
    return;
  }

  try {
    const response = await fetch(`${API}/trades`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(trade)
    });

    if (!response.ok) {
      throw new Error("Ошибка сохранения");
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
    alert("Не удалось сохранить сделку");
    console.error(error);
  }
}

async function loadTrades() {
  const container = document.getElementById("trades");

  if (!container) return;

  container.innerHTML = "Загрузка...";

  try {
    const response = await fetch(`${API}/trades`, {
      headers: getHeaders()
    });

    if (!response.ok) {
      throw new Error("Ошибка загрузки");
    }

    const trades = await response.json();

    if (!trades.length) {
      container.innerHTML = "Сделок пока нет.";
      return;
    }

    container.innerHTML = trades.map((trade) => `
      <div class="trade">
        <b>${trade.pair}</b>
        <div>${trade.direction}</div>
        <div>Вход: ${trade.entry}</div>
        <div>SL: ${trade.stop_loss}</div>
        <div>TP: ${trade.take_profit}</div>
        <div>Результат: ${trade.result}</div>
        <div>${trade.notes || ""}</div>
      </div>
    `).join("");

  } catch (error) {
    container.innerHTML = "Ошибка загрузки сделок.";
    console.error(error);
  }
}

async function loadStats() {
  try {
    const response = await fetch(`${API}/stats`, {
      headers: getHeaders()
    });

    if (!response.ok) {
      throw new Error("Ошибка статистики");
    }

    const stats = await response.json();

    document.getElementById("total").textContent =
      stats.total || 0;

    document.getElementById("profit").textContent =
      stats.profit || 0;

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

showPage("home");
