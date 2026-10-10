
(() => {
  "use strict";

  const tg = window.Telegram?.WebApp;
  const API = "/api";
  const $ = (id) => document.getElementById(id);

  let trades = [];
  let balance = 10000;
  let activeFilter = "all";
  let loading = false;

  // 1. Скрываем заставку сразу, не дожидаясь сервера.
  function hideLoader() {
    const loader = $("loader");
    if (loader) {
      loader.style.display = "none";
      loader.classList.add("hidden");
    }
  }

  function showLoader() {
    const loader = $("loader");
    if (loader) {
      loader.style.display = "flex";
      loader.classList.remove("hidden");
    }
  }

  // 2. Запускаем Telegram и интерфейс.
  try {
    if (tg) {
      tg.ready();
      tg.expand();
    }
  } catch (error) {
    console.warn("Telegram WebApp:", error);
  }

  // Заставка не должна оставаться на экране.
  hideLoader();
  window.addEventListener("load", hideLoader);
  setTimeout(hideLoader, 1500);

  function userHeaders(json = false) {
    const headers = {};
    if (json) headers["Content-Type"] = "application/json";

    const userId = tg?.initDataUnsafe?.user?.id;
    if (userId) headers["x-telegram-user-id"] = String(userId);

    return headers;
  }

  // 3. Защита от бесконечного ожидания ответа API.
  async function api(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(API + url, {
        ...options,
        headers: {
          ...userHeaders(Boolean(options.body)),
          ...(options.headers || {})
        },
        signal: controller.signal,
        cache: "no-store"
      });

      const text = await response.text();
      let data = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error("Сервер вернул неверный ответ.");
      }

      if (!response.ok) {
        throw new Error(data.error || `Ошибка сервера: ${response.status}`);
      }

      return data;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Сервер отвечает слишком долго. Попробуй ещё раз.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function money(value) {
    const number = Number(value) || 0;
    return number.toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " $";
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function toast(message) {
    const el = $("toast");
    if (!el) {
      alert(message);
      return;
    }

    el.textContent = message;
    el.style.display = "block";
    el.classList.add("show");

    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      el.classList.remove("show");
      el.style.display = "";
    }, 3000);
  }

  function setPage(page) {
    document.querySelectorAll(".page").forEach((el) => {
      el.classList.toggle("active", el.id === page);
      el.classList.toggle("hidden", el.id !== page);
    });

    document.querySelectorAll(".nav-button").forEach((el) => {
      el.classList.toggle("active", el.dataset.page === page);
    });

    if (page === "journal") renderTrades();
    if (page === "stats") renderAnalytics();

    hideLoader();
  }

  function renderHome() {
    setText("balance", money(balance));

    const total = trades.length;
    const wins = trades.filter((t) => Number(t.result) > 0).length;
    const profit = trades.reduce((sum, t) => sum + (Number(t.result) || 0), 0);
    const winrate = total ? Math.round((wins / total) * 100) : 0;

    setText("homeTotal", total);
    setText("homeProfit", money(profit));
    setText("homeWinrate", winrate + "%");

    const list = $("homeTradesList");
    if (!list) return;

    list.replaceChildren();

    if (!trades.length) {
      list.innerHTML = '<div class="empty-state">Пока нет сделок</div>';
      return;
    }

    trades.slice(0, 3).forEach((trade) => {
      list.appendChild(makeTradeCard(trade, false));
    });
  }

  function makeTradeCard(trade, allowDelete = true) {
    const card = document.createElement("div");
    card.className = "trade-card";

    const result = Number(trade.result) || 0;
    const title = document.createElement("strong");
    title.textContent = trade.pair || "Сделка";

    const direction = document.createElement("span");
    direction.textContent = trade.direction === "SELL" ? "SELL" : "BUY";

    const amount = document.createElement("strong");
    amount.textContent = (result > 0 ? "+" : "") + money(result);
    amount.className = result >= 0 ? "profit" : "loss";

    const date = document.createElement("small");
    date.textContent = trade.created_at
      ? new Date(trade.created_at.replace(" ", "T") + "Z").toLocaleString("ru-RU")
      : "";

    const notes = document.createElement("p");
    notes.textContent = trade.notes || "";

    card.append(title, document.createTextNode(" · "), direction, amount, date, notes);

    if (allowDelete) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary-button";
      remove.textContent = "Удалить";
      remove.addEventListener("click", async () => {
        if (!confirm("Удалить сделку? Баланс будет скорректирован.")) return;

        try {
          await api("/trades/" + encodeURIComponent(trade.id), {
            method: "DELETE"
          });
          await refreshData();
          toast("Сделка удалена");
        } catch (error) {
          toast(error.message);
        }
      });
      card.appendChild(remove);
    }

    return card;
  }

  function renderTrades() {
    const list = $("trades");
    if (!list) return;

    list.replaceChildren();

    const filtered = trades.filter((trade) => {
      const result = Number(trade.result) || 0;

      if (activeFilter === "profit") return result > 0;
      if (activeFilter === "loss") return result < 0;

      if (activeFilter === "today") {
        if (!trade.created_at) return false;
        const date = new Date(trade.created_at.replace(" ", "T") + "Z");
        const now = new Date();
        return date.toDateString() === now.toDateString();
      }

      return true;
    });

    if (!filtered.length) {
      list.innerHTML = '<div class="empty-state">Сделок пока нет</div>';
      return;
    }

    filtered.forEach((trade) => list.appendChild(makeTradeCard(trade, true)));

    const total = trades.length;
    const wins = trades.filter((t) => Number(t.result) > 0).length;
    const profit = trades.reduce((sum, t) => sum + (Number(t.result) || 0), 0);

    setText("journalTotal", total);
    setText("journalProfit", money(profit));
    setText("journalWinrate", (total ? Math.round(wins / total * 100) : 0) + "%");
  }

  function renderAnalytics() {
    const results = trades.map((t) => Number(t.result) || 0);
    const wins = results.filter((n) => n > 0);
    const losses = results.filter((n) => n < 0);
    const totalProfit = results.reduce((a, b) => a + b, 0);
    const winrate = results.length ? Math.round(wins.length / results.length * 100) : 0;
    const grossWin = wins.reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));

    setText("analyticsTrades", results.length);
    setText("aProfit", money(totalProfit));
    setText("aWinrate", winrate + "%");
    setText("aAvgWin", money(wins.length ? grossWin / wins.length : 0));
    setText("aAvgLoss", money(losses.length ? grossLoss / losses.length : 0));
    setText("aProfitFactor", grossLoss ? (grossWin / grossLoss).toFixed(2) : (grossWin ? "∞" : "0"));
    setText("aExpectancy", money(results.length ? totalProfit / results.length : 0));
    setText("aBest", money(results.length ? Math.max(...results) : 0));
    setText("aWorst", money(results.length ? Math.min(...results) : 0));

    let currentWin = 0, bestWin = 0, currentLoss = 0, bestLoss = 0;
    [...trades].reverse().forEach((t) => {
      const r = Number(t.result) || 0;
      if (r > 0) {
        currentWin++;
        bestWin = Math.max(bestWin, currentWin);
        currentLoss = 0;
      } else if (r < 0) {
        currentLoss++;
        bestLoss = Math.max(bestLoss, currentLoss);
        currentWin = 0;
      } else {
        currentWin = 0;
        currentLoss = 0;
      }
    });

    setText("aWinStreak", bestWin);
    setText("aLossStreak", bestLoss);

    drawChart();
    renderBreakdown("pairAnalytics", (t) => t.pair || "Другое");
    renderBreakdown("dailyAnalytics", (t) => {
      if (!t.created_at) return "Без даты";
      return t.created_at.slice(0, 10);
    });
  }

  function renderBreakdown(id, getKey) {
    const el = $(id);
    if (!el) return;

    const groups = {};
    trades.forEach((trade) => {
      const key = getKey(trade);
      groups[key] = (groups[key] || 0) + (Number(trade.result) || 0);
    });

    el.replaceChildren();
    const entries = Object.entries(groups);

    if (!entries.length) {
      el.textContent = "Данных пока нет";
      return;
    }

    entries.forEach(([key, value]) => {
      const row = document.createElement("p");
      row.textContent = `${key}: ${money(value)}`;
      el.appendChild(row);
    });
  }

  function drawChart() {
    const canvas = $("equityChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.clientWidth || 300;
    const height = 180;
    const ratio = window.devicePixelRatio || 1;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = height + "px";
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);

    const values = [balance - trades.reduce((s, t) => s + (Number(t.result) || 0), 0)];
    let current = values[0];

    [...trades].reverse().forEach((t) => {
      current += Number(t.result) || 0;
      values.push(current);
    });

    if (values.length < 2) {
      ctx.fillStyle = "#999";
      ctx.font = "14px sans-serif";
      ctx.fillText("Добавь сделки, чтобы увидеть график", 12, 35);
      return;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    ctx.beginPath();
    values.forEach((v, i) => {
      const x = 10 + i * (width - 20) / (values.length - 1);
      const y = height - 15 - ((v - min) / range) * (height - 30);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = "#35d49a";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  async function refreshData() {
    if (loading) return;
    loading = true;

    try {
      const results = await Promise.all([
        api("/balance"),
        api("/trades")
      ]);

      balance = Number(results[0].balance) || 0;
      trades = Array.isArray(results[1]) ? results[1] : [];

      renderHome();
      renderTrades();
      renderAnalytics();
    } catch (error) {
      console.error("Forex Diary load error:", error);
      toast(error.message);
    } finally {
      loading = false;
      hideLoader();
    }
  }

  // 4. Навигация.
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const page = button.dataset.page;
      if (page) setPage(page);
    });
  });

  $("newTrade")?.addEventListener("click", () => setPage("add"));
  $("openJournal")?.addEventListener("click", () => setPage("journal"));

  // 5. BUY / SELL.
  document.querySelectorAll("[data-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = button.dataset.direction;
      if ($("direction")) $("direction").value = direction;

      document.querySelectorAll("[data-direction]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
    });
  });

  // 6. Фильтры журнала.
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      renderTrades();
    });
  });

  // 7. Добавление сделки.
  $("tradeForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const resultValue = Number($("result")?.value);
    if (!Number.isFinite(resultValue)) {
      toast("Введи финансовый результат сделки.");
      return;
    }

    const submit = $("tradeForm").querySelector('[type="submit"]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Сохраняем...";
    }

    try {
      await api("/trades", {
        method: "POST",
        body: JSON.stringify({
          pair: $("pair")?.value || "XAU/USD",
          direction: $("direction")?.value || "BUY",
          entry: $("entry")?.value || 0,
          stop_loss: $("stop_loss")?.value || 0,
          take_profit: $("take_profit")?.value || 0,
          result: resultValue,
          notes: $("notes")?.value || ""
        })
      });

      $("tradeForm").reset();
      if ($("direction")) $("direction").value = "BUY";
      document.querySelectorAll("[data-direction]").forEach((button) => {
        button.classList.toggle("active", button.dataset.direction === "BUY");
      });

      await refreshData();
      setPage("home");
      toast("Сделка сохранена");
    } catch (error) {
      toast(error.message);
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Сохранить сделку";
      }
    }
  });

  // 8. Редактирование баланса.
  async function editBalance() {
    const answer = prompt("Введи новый баланс ($):", String(balance));
    if (answer === null) return;

    const value = Number(answer);
    if (!Number.isFinite(value) || answer.trim() === "") {
      toast("Введи корректное число.");
      return;
    }

    try {
      await api("/balance", {
        method: "POST",
        body: JSON.stringify({ balance: value })
      });

      balance = value;
      renderHome();
      renderAnalytics();
      toast("Баланс сохранён");
    } catch (error) {
      toast(error.message);
    }
  }

  $("editBalance")?.addEventListener("click", editBalance);
  $("profileEditBalance")?.addEventListener("click", editBalance);

  // 9. Запуск без вечной заставки.
  document.addEventListener("DOMContentLoaded", () => {
    hideLoader();
    refreshData();
  });

  // Скрипт может подключиться уже после DOMContentLoaded.
  if (document.readyState !== "loading") {
    hideLoader();
    refreshData();
  }

  window.addEventListener("pageshow", hideLoader);
})();
