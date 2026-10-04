const tg = window.Telegram?.WebApp;

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

  if (page === "home" || page === "stats") {
    loadStats();
  }

  if (page === "journal") {
    loadTrades();
  }
}

function getInitData() {
  return tg?.initData || "";
}

async function api(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": getInitData(),
    ...(options.headers || {})
  };

  const response = await fetch(API + url, {
    ...options,
    headers
  });

  if (!response.ok) {
