import express from "express";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import TelegramBot from "node-telegram-bot-api";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;

if (!BOT_TOKEN || !WEBAPP_URL) {
  console.warn("Set BOT_TOKEN and WEBAPP_URL in .env");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("forex_diary.db");

db.exec(`
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  username TEXT,
  created_at TEXT NOT NULL,
  pair TEXT NOT NULL,
  direction TEXT NOT NULL,
  entry REAL,
  sl REAL,
  tp REAL,
  lots REAL,
  risk REAL,
  timeframe TEXT,
  setup TEXT,
  result TEXT,
  pnl REAL,
  comment TEXT
);
CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(telegram_id);
`);

function validateTelegramInitData(initData) {
  if (!initData || !BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const calculated = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) return null;
  const authDate = Number(params.get("auth_date") || 0);
  if (Date.now()/1000 - authDate > 86400) return null;
  try { return JSON.parse(params.get("user") || "{}"); } catch { return null; }
}

function auth(req, res, next) {
  const user = validateTelegramInitData(req.headers["x-telegram-init-data"]);
  if (!user?.id) return res.status(401).json({error:"Telegram authorization required"});
  req.tgUser = user;
  next();
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "web")));

app.get("/api/me", auth, (req,res) => res.json(req.tgUser));

app.get("/api/trades", auth, (req,res) => {
  const rows = db.prepare(
    "SELECT * FROM trades WHERE telegram_id=? ORDER BY id DESC"
  ).all(String(req.tgUser.id));
  res.json(rows);
});

app.post("/api/trades", auth, (req,res) => {
  const b = req.body || {};
  const stmt = db.prepare(`
    INSERT INTO trades
    (telegram_id,username,created_at,pair,direction,entry,sl,tp,lots,risk,timeframe,setup,result,pnl,comment)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const info = stmt.run(
    String(req.tgUser.id), req.tgUser.username || "",
    new Date().toISOString(), b.pair, b.direction, Number(b.entry)||0,
    Number(b.sl)||0, Number(b.tp)||0, Number(b.lots)||0,
    Number(b.risk)||0, b.timeframe || "M5", b.setup || "Order Block",
    b.result || "Win", Number(b.pnl)||0, String(b.comment || "")
  );
  res.json({id: info.lastInsertRowid});
});

app.delete("/api/trades/:id", auth, (req,res) => {
  db.prepare("DELETE FROM trades WHERE id=? AND telegram_id=?")
    .run(Number(req.params.id), String(req.tgUser.id));
  res.json({ok:true});
});

app.get("/api/stats", auth, (req,res) => {
  const rows = db.prepare("SELECT result,pnl FROM trades WHERE telegram_id=?")
    .all(String(req.tgUser.id));
  const wins = rows.filter(x=>x.result==="Win").length;
  const losses = rows.filter(x=>x.result==="Loss").length;
  const pnl = rows.reduce((s,x)=>s+Number(x.pnl||0),0);
  const grossWin = rows.filter(x=>x.pnl>0).reduce((s,x)=>s+Number(x.pnl),0);
  const grossLoss = Math.abs(rows.filter(x=>x.pnl<0).reduce((s,x)=>s+Number(x.pnl),0));
  res.json({
    total: rows.length, wins, losses, pnl,
    winRate: (wins/Math.max(1,wins+losses))*100,
    profitFactor: grossLoss ? grossWin/grossLoss : 0
  });
});

app.listen(PORT, () => console.log(`Forex Diary running on port ${PORT}`));

if (BOT_TOKEN && WEBAPP_URL) {
  const bot = new TelegramBot(BOT_TOKEN, {polling:true});
  bot.onText(/\/start/, msg => {
    bot.sendMessage(msg.chat.id,
      "📊 Forex Diary\n\nТвой дневник Forex-сделок прямо в Telegram.",
      {reply_markup:{inline_keyboard:[[{
        text:"📈 Открыть Forex Diary", web_app:{url:WEBAPP_URL}
      }]]}}
    );
  });
  bot.setMyCommands([
    {command:"start", description:"Открыть Forex Diary"}
  ]).catch(()=>{});
}