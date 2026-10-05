const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "web")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "web", "index.html"));
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const db = new sqlite3.Database("./forex_diary.db");

// =========================
// ТАБЛИЦА СДЕЛОК
// =========================

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

// =========================
// ТАБЛИЦА БАЛАНСА
// =========================

db.run(`
  CREATE TABLE IF NOT EXISTS balances (
    user_id TEXT PRIMARY KEY,
    balance REAL DEFAULT 10000
  )
`);

// =========================
// ПОЛУЧИТЬ ID TELEGRAM
// =========================

function getUserId(req) {
  return (
    req.headers["x-telegram-user-id"] ||
    "demo"
  );
}

// =========================
// ПОЛУЧИТЬ БАЛАНС
// =========================

app.get("/api/balance", (req, res) => {

  const userId = getUserId(req);

  db.get(
    `
    SELECT balance
    FROM balances
    WHERE user_id = ?
    `,
    [userId],
    (err, row) => {

      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }

      if (!row) {

        const defaultBalance = 10000;

        db.run(
          `
          INSERT INTO balances
          (user_id, balance)
          VALUES (?, ?)
          `,
          [userId, defaultBalance],
          (insertErr) => {

            if (insertErr) {
              return res.status(500).json({
                error: insertErr.message
              });
            }

            res.json({
              balance: defaultBalance
            });
          }
        );

        return;
      }

      res.json({
        balance: Number(row.balance) || 0
      });
    }
  );
});

// =========================
// СОХРАНИТЬ БАЛАНС
// =========================

app.post("/api/balance", (req, res) => {

  const userId = getUserId(req);

  const balance = Number(
    req.body.balance
  );

  if (!Number.isFinite(balance)) {

    return res.status(400).json({
      error: "Некорректный баланс"
    });
  }

  db.run(
    `
    INSERT INTO balances
    (user_id, balance)

    VALUES (?, ?)

    ON CONFLICT(user_id)
    DO UPDATE SET
    balance = excluded.balance
    `,
    [userId, balance],
    function (err) {

      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }

      res.json({
        ok: true,
        balance: balance
      });
    }
  );
});

// =========================
// ПОЛУЧИТЬ ВСЕ СДЕЛКИ
// =========================

app.get("/api/trades", (req, res) => {

  const userId = getUserId(req);

  db.all(
    `
    SELECT *
    FROM trades
    WHERE user_id = ?
    ORDER BY created_at DESC
    `,
    [userId],
    (err, rows) => {

      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }

      res.json(rows);
    }
  );
});

// =========================
// ДОБАВИТЬ СДЕЛКУ
// =========================

app.post("/api/trades", (req, res) => {

  const userId = getUserId(req);

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
    (
      user_id,
      pair,
      direction,
      entry,
      stop_loss,
      take_profit,
      result,
      notes
    )

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
        return res.status(500).json({
          error: err.message
        });
      }

      res.json({
        ok: true,
        id: this.lastID
      });
    }
  );
});

// =========================
// УДАЛИТЬ СДЕЛКУ
// =========================

app.delete("/api/trades/:id", (req, res) => {

  const userId = getUserId(req);

  db.run(
    `
    DELETE FROM trades
    WHERE id = ?
    AND user_id = ?
    `,
    [
      req.params.id,
      userId
    ],
    function (err) {

      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }

      res.json({
        ok: true,
        deleted: this.changes
      });
    }
  );
});

// =========================
// СТАТИСТИКА
// =========================

app.get("/api/stats", (req, res) => {

  const userId = getUserId(req);

  db.get(
    `
    SELECT

      COUNT(*) AS total,

      COALESCE(
        SUM(result),
        0
      ) AS profit,

      COALESCE(
        SUM(
          CASE
            WHEN result > 0
            THEN 1
            ELSE 0
          END
        ),
        0
      ) AS wins,

      COALESCE(
        SUM(
          CASE
            WHEN result < 0
            THEN 1
            ELSE 0
          END
        ),
        0
      ) AS losses

    FROM trades

    WHERE user_id = ?
    `,
    [userId],
    (err, row) => {

      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }

      const total =
        Number(row.total) || 0;

      const wins =
        Number(row.wins) || 0;

      const losses =
        Number(row.losses) || 0;

      const profit =
        Number(row.profit) || 0;

      const winrate =
        total > 0
          ? Math.round(
              (wins / total) * 100
            )
          : 0;

      res.json({
        total,
        profit,
        wins,
        losses,
        winrate
      });
    }
  );
});

// =========================
// ЗАПУСК СЕРВЕРА
// =========================

app.listen(PORT, () => {

  console.log(
    `Forex Diary running on port ${PORT}`
  );

});
