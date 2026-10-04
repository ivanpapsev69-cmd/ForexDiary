const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;

app.use(express.json());

// ВАЖНО: подключаем папку web
app.use(express.static(path.join(__dirname, "web")));

// Главная страница Mini App
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "web", "index.html"));
});

// Проверка сервера
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// База данных
const db = new sqlite3.Database("./forex_diary.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      pair TEXT,
      direction TEXT,
      entry REAL,
      stop_loss REAL,
      take_profit REAL,
      result REAL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Проверка Telegram initData
function validateTelegramInitData(initData) {
  if (!BOT_TOKEN || !initData) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");

    if (!hash) return null;

    params.delete("hash");

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(BOT_TOKEN)
      .digest();

    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (calculatedHash !== hash) return null;

    const user = params.get("user");
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

// Получить пользователя
app.get("/api/me", (req, res) => {
  const user = validateTelegramInitData(req.headers["x-telegram-init-data"]);

  if (!user) {
    return res.json({
      id: "demo",
      first_name: "Trader"
    });
  }

  res.json(user);
});

// Получить сделки
app.get("/api/trades", (req, res) => {
  const user = validateTelegramInitData(req.headers["x-telegram-init-data"]);
  const userId = user ? String(user.id) : "demo";

  db.all(
    `SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json(rows);
    }
  );
});

// Добавить сделку
app.post("/api/trades", (req, res) => {
  const user = validateTelegramInitData(req.headers["x-telegram-init-data"]);
  const userId = user ? String(user.id) : "demo";

  const {
    pair,
    direction,
    entry,
    stop_loss,
    take_profit,
    result,
    notes
  } = req.body;

  db.run(
    `
    INSERT INTO trades
    (user_id, pair, direction, entry, stop_loss, take_profit, result, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      pair || "",
      direction || "",
      Number(entry) || 0,
      Number(stop_loss) || 0,
      Number(take_profit) || 0,
      Number(result) || 0,
      notes || ""
    ],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json({
        ok: true,
        id: this.lastID
      });
    }
  );
});

// Удалить сделку
app.delete("/api/trades/:id", (req, res) => {
  const user = validateTelegramInitData(req.headers["x-telegram-init-data"]);
  const userId = user ? String(user.id) : "demo";

  db.run(
    `DELETE FROM trades WHERE id = ? AND user_id = ?`,
    [req.params.id, userId],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json({
        ok: true,
        deleted: this.changes
      });
    }
  );
});

// Статистика
app.get("/api/stats", (req, res) => {
  const user = validateTelegramInitData(req.headers["x-telegram-init-data"]);
  const userId = user ? String(user.id) : "demo";

  db.get(
    `
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(result), 0) AS profit,
      COALESCE(SUM(CASE WHEN result > 0 THEN 1 ELSE 0 END), 0) AS wins,
      COALESCE(SUM(CASE WHEN result < 0 THEN 1 ELSE 0 END), 0) AS losses
    FROM trades
    WHERE user_id = ?
    `,
    [userId],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const total = Number(row.total) || 0;
      const wins = Number(row.wins) || 0;

      res.json({
        total,
        profit: Number(row.profit) || 0,
        wins,
        losses: Number(row.losses) || 0,
        winrate: total ? Math.round((wins / total) * 100) : 0
      });
    }
  );
});

// Запуск
app.listen(PORT, () => {
  console.log(`Forex Diary running on port ${PORT}`);
});
