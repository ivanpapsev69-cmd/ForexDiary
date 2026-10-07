const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "web")));

/* =========================
   PAGES
========================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "web", "index.html")
  );
});

/* =========================
   HEALTH
========================= */

app.get("/health", (req, res) => {
  res.json({
    ok: true
  });
});

/* =========================
   SQLITE
========================= */

const DB_PATH = "/data/forex_diary.db";

console.log("Opening SQLite:", DB_PATH);

const db = new sqlite3.Database(
  DB_PATH,
  (err) => {
    if (err) {
      console.error(
        "SQLite open error:",
        err
      );

      process.exit(1);
    }

    console.log(
      "SQLite database opened successfully"
    );
  }
);

/* =========================
   DATABASE INIT
========================= */

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

  /*
    Индекс ускоряет получение сделок
    конкретного пользователя.
  */

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_trades_user_id
    ON trades(user_id)
  `);
});

/* =========================
   USER ID
========================= */

/*
  Telegram Mini App передаёт ID пользователя
  через заголовок:

  x-telegram-user-id

  Каждый Telegram-пользователь получает
  собственный user_id.

  Вне Telegram используется demo.
*/

function getUserId(req) {
  const telegramUserId =
    req.headers["x-telegram-user-id"];

  if (
    telegramUserId !== undefined &&
    telegramUserId !== null &&
    String(telegramUserId).trim() !== ""
  ) {
    return String(telegramUserId).trim();
  }

  return "demo";
}

/* =========================
   BALANCE
========================= */

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
        console.error(
          "GET /api/balance:",
          err
        );

        return res.status(500).json({
          error: err.message
        });
      }

      /*
        Если у пользователя ещё нет баланса,
        создаём только его собственный баланс.
      */

      if (!row) {
        const defaultBalance = 10000;

        db.run(
          `
          INSERT INTO balances
          (user_id, balance)
          VALUES (?, ?)
          `,
          [
            userId,
            defaultBalance
          ],
          (insertErr) => {
            if (insertErr) {
              console.error(
                "Create balance:",
                insertErr
              );

              return res.status(500).json({
                error: insertErr.message
              });
            }

            return res.json({
              balance: defaultBalance
            });
          }
        );

        return;
      }

      return res.json({
        balance:
          Number(row.balance) || 0
      });
    }
  );
});

/* =========================
   MANUAL BALANCE CHANGE
========================= */

app.post("/api/balance", (req, res) => {
  const userId = getUserId(req);

  const balance =
    Number(req.body.balance);

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
    [
      userId,
      balance
    ],
    function (err) {
      if (err) {
        console.error(
          "POST /api/balance:",
          err
        );

        return res.status(500).json({
          error: err.message
        });
      }

      return res.json({
        ok: true,
        user_id: userId,
        balance
      });
    }
  );
});

/* =========================
   GET USER TRADES
========================= */

app.get("/api/trades", (req, res) => {
  const userId = getUserId(req);

  db.all(
    `
    SELECT
      id,
      user_id,
      pair,
      direction,
      entry,
      stop_loss,
      take_profit,
      result,
      notes,
      created_at

    FROM trades

    WHERE user_id = ?

    ORDER BY created_at DESC, id DESC
    `,
    [userId],
    (err, rows) => {
      if (err) {
        console.error(
          "GET /api/trades:",
          err
        );

        return res.status(500).json({
          error: err.message
        });
      }

      return res.json(
        Array.isArray(rows)
          ? rows
          : []
      );
    }
  );
});

/* =========================
   ADD USER TRADE
========================= */

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

  const tradeResult =
    Number(result) || 0;

  const tradePair =
    String(pair || "").trim();

  const tradeDirection =
    String(direction || "").trim();

  const tradeEntry =
    Number(entry) || 0;

  const tradeStopLoss =
    Number(stop_loss) || 0;

  const tradeTakeProfit =
    Number(take_profit) || 0;

  const tradeNotes =
    String(notes || "").trim();

  if (!tradePair) {
    return res.status(400).json({
      error: "Не указана торговая пара"
    });
  }

  /*
    ВАЖНО:
    user_id записывается вместе со сделкой.
    Поэтому сделка принадлежит только этому
    Telegram-пользователю.
  */

  db.serialize(() => {
    db.run(
      "BEGIN TRANSACTION"
    );

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
        tradePair,
        tradeDirection,
        tradeEntry,
        tradeStopLoss,
        tradeTakeProfit,
        tradeResult,
        tradeNotes
      ],
      function (err) {
        if (err) {
          console.error(
            "INSERT trade:",
            err
          );

          db.run("ROLLBACK");

          return res.status(500).json({
            error: err.message
          });
        }

        const tradeId =
          this.lastID;

        /*
          Получаем баланс ТОЛЬКО этого пользователя.
        */

        db.get(
          `
          SELECT balance
          FROM balances
          WHERE user_id = ?
          `,
          [userId],
          (balanceErr, row) => {
            if (balanceErr) {
              console.error(
                "Get balance:",
                balanceErr
              );

              db.run("ROLLBACK");

              return res.status(500).json({
                error: balanceErr.message
              });
            }

            const currentBalance =
              row
                ? Number(row.balance)
                : 10000;

            const newBalance =
              currentBalance +
              tradeResult;

            /*
              Обновляем баланс только
              этого пользователя.
            */

            db.run(
              `
              INSERT INTO balances
              (user_id, balance)

              VALUES (?, ?)

              ON CONFLICT(user_id)
              DO UPDATE SET
                balance = excluded.balance
              `,
              [
                userId,
                newBalance
              ],
              (updateErr) => {
                if (updateErr) {
                  console.error(
                    "Update balance:",
                    updateErr
                  );

                  db.run("ROLLBACK");

                  return res.status(500).json({
                    error: updateErr.message
                  });
                }

                db.run(
                  "COMMIT",
                  (commitErr) => {
                    if (commitErr) {
                      console.error(
                        "COMMIT:",
                        commitErr
                      );

                      return res.status(500).json({
                        error: commitErr.message
                      });
                    }

                    return res.json({
                      ok: true,
                      id: tradeId,
                      user_id: userId,
                      result: tradeResult,
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

/* =========================
   DELETE USER TRADE
========================= */

app.delete(
  "/api/trades/:id",
  (req, res) => {
    const userId =
      getUserId(req);

    const tradeId =
      req.params.id;

    db.serialize(() => {
      db.run(
        "BEGIN TRANSACTION"
      );

      /*
        Ищем сделку одновременно
        по ID и user_id.

        Поэтому один пользователь
        не сможет удалить сделку
        другого пользователя.
      */

      db.get(
        `
        SELECT result
        FROM trades

        WHERE id = ?
        AND user_id = ?
        `,
        [
          tradeId,
          userId
        ],
        (findErr, trade) => {
          if (findErr) {
            console.error(
              "Find trade:",
              findErr
            );

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

          /*
            Получаем баланс только
            текущего пользователя.
          */

          db.get(
            `
            SELECT balance
            FROM balances

            WHERE user_id = ?
            `,
            [userId],
            (balanceErr, row) => {
              if (balanceErr) {
                console.error(
                  "Get balance:",
                  balanceErr
                );

                db.run("ROLLBACK");

                return res.status(500).json({
                  error: balanceErr.message
                });
              }

              const currentBalance =
                row
                  ? Number(row.balance)
                  : 10000;

              /*
                При удалении сделки
                возвращаем её результат.
              */

              const newBalance =
                currentBalance -
                tradeResult;

              db.run(
                `
                DELETE FROM trades

                WHERE id = ?
                AND user_id = ?
                `,
                [
                  tradeId,
                  userId
                ],
                function (deleteErr) {
                  if (deleteErr) {
                    console.error(
                      "Delete trade:",
                      deleteErr
                    );

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
                    DO UPDATE SET
                      balance = excluded.balance
                    `,
                    [
                      userId,
                      newBalance
                    ],
                    (updateErr) => {
                      if (updateErr) {
                        console.error(
                          "Restore balance:",
                          updateErr
                        );

                        db.run("ROLLBACK");

                        return res.status(500).json({
                          error: updateErr.message
                        });
                      }

                      db.run(
                        "COMMIT",
                        (commitErr) => {
                          if (commitErr) {
                            console.error(
                              "COMMIT:",
                              commitErr
                            );

                            return res.status(500).json({
                              error: commitErr.message
                            });
                          }

                          return res.json({
                            ok: true,
                            user_id: userId,
                            deleted: 1,
                            resultReturned:
                              tradeResult,
                            balance:
                              newBalance
                          });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  }
);

/* =========================
   USER STATISTICS
========================= */

app.get("/api/stats", (req, res) => {
  const userId =
    getUserId(req);

  /*
    ВАЖНО:
    статистика считается только
    по сделкам текущего пользователя.
  */

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
        console.error(
          "GET /api/stats:",
          err
        );

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

      return res.json({
        user_id: userId,
        total,
        profit,
        wins,
        losses,
        winrate
      });
    }
  );
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(
    `Forex Diary running on port ${PORT}`
  );
});
