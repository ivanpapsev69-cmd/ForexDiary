const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 10000;

/*
  На Deplexo рабочая директория может быть недоступна
  для записи. /tmp обычно доступна.
*/
const DB_PATH = "/tmp/forex_diary.db";

app.use(express.json());
app.use(express.static(path.join(__dirname, "web")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "web", "index.html"));
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

console.log("Opening SQLite:", DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("SQLite open error:", err);
    process.exit(1);
  }

  console.log("SQLite database opened successfully");
});

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

  db.run(`
    CREATE TABLE IF NOT EXISTS balances (
      user_id TEXT PRIMARY KEY,
      balance REAL DEFAULT 10000
    )
  `);
});

function getUserId(req) {
  return req.headers["x-telegram-user-id"] || "demo";
}

/* BALANCE */
app.get("/api/balance", (req, res) => {
  const userId = getUserId(req);

  db.get(
    `SELECT balance FROM balances WHERE user_id = ?`,
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

/* MANUAL BALANCE CHANGE */
app.post("/api/balance", (req, res) => {
  const userId = getUserId(req);
  const balance = Number(req.body.balance);

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
    DO UPDATE SET balance = excluded.balance
    `,
    [userId, balance],
    (err) => {
      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }

      res.json({
        ok: true,
        balance
      });
    }
  );
});

/* GET TRADES */
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

/* ADD TRADE */
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

  const tradeResult = Number(result) || 0;

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

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
        tradeResult,
        notes || ""
      ],
      function (err) {
        if (err) {
          db.run("ROLLBACK");

          return res.status(500).json({
            error: err.message
          });
        }

        const tradeId = this.lastID;

        db.get(
          `
          SELECT balance
          FROM balances
          WHERE user_id = ?
          `,
          [userId],
          (balanceErr, row) => {
            if (balanceErr) {
              db.run("ROLLBACK");

              return res.status(500).json({
                error: balanceErr.message
              });
            }

            const currentBalance =
              row ? Number(row.balance) : 10000;

            const newBalance =
              currentBalance + tradeResult;

            db.run(
              `
              INSERT INTO balances
              (user_id, balance)
              VALUES (?, ?)
              ON CONFLICT(user_id)
              DO UPDATE SET balance = excluded.balance
              `,
              [userId, newBalance],
              (updateErr) => {
                if (updateErr) {
                  db.run("ROLLBACK");

                  return res.status(500).json({
                    error: updateErr.message
                  });
                }

                db.run("COMMIT");

                res.json({
                  ok: true,
                  id: tradeId,
                  result: tradeResult,
                  balance: newBalance
                });
              }
            );
          }
        );
      }
    );
  });
});

/* DELETE TRADE */
app.delete("/api/trades/:id", (req, res) => {
  const userId = getUserId(req);
  const tradeId = req.params.id;

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.get(
      `
      SELECT result
      FROM trades
      WHERE id = ?
      AND user_id = ?
      `,
      [tradeId, userId],
      (findErr, trade) => {
        if (findErr) {
          db.run("ROLLBACK");

          return res.status(500).json({
            error: findErr.message
          });
        }

        if (!trade) {
          db.run("ROLLBACK");

          return res.status(404).json({
            error: "Сделка не найдена"
          });
        }

        const tradeResult =
          Number(trade.result) || 0;

        db.get(
          `
          SELECT balance
          FROM balances
          WHERE user_id = ?
          `,
          [userId],
          (balanceErr, row) => {
            if (balanceErr) {
              db.run("ROLLBACK");

              return res.status(500).json({
                error: balanceErr.message
              });
            }

            const currentBalance =
              row ? Number(row.balance) : 10000;

            const newBalance =
              currentBalance - tradeResult;

            db.run(
              `
              DELETE FROM trades
              WHERE id = ?
              AND user_id = ?
              `,
              [tradeId, userId],
              function (deleteErr) {
                if (deleteErr) {
                  db.run("ROLLBACK");

                  return res.status(500).json({
                    error: deleteErr.message
                  });
                }

                db.run(
                  `
                  INSERT INTO balances
                  (user_id, balance)
                  VALUES (?, ?)
                  ON CONFLICT(user_id)
                  DO UPDATE SET balance = excluded.balance
                  `,
                  [userId, newBalance],
                  (updateErr) => {
                    if (updateErr) {
                      db.run("ROLLBACK");

                      return res.status(500).json({
                        error: updateErr.message
                      });
                    }

                    db.run("COMMIT");

                    res.json({
                      ok: true,
                      deleted: deleteErr ? 0 : 1,
                      resultReturned: tradeResult,
                      balance: newBalance
                    });
                  }
                );
              }
            );
          }
        );
      }
    );
  });
});

/* STATISTICS */
app.get("/api/stats", (req, res) => {
  const userId = getUserId(req);

  db.get(
    `
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(result), 0) AS profit,
      COALESCE(
        SUM(CASE WHEN result > 0 THEN 1 ELSE 0 END),
        0
      ) AS wins,
      COALESCE(
        SUM(CASE WHEN result < 0 THEN 1 ELSE 0 END),
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

      const total = Number(row.total) || 0;
      const wins = Number(row.wins) || 0;
      const losses = Number(row.losses) || 0;
      const profit = Number(row.profit) || 0;

      const winrate =
        total > 0
          ? Math.round((wins / total) * 100)
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

app.listen(PORT, () => {
  console.log(
    `Forex Diary running on port ${PORT}`
  );
});
