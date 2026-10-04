# Forex Diary — Telegram Mini App

Готовая заготовка для Telegram Mini App:
- Telegram-бот с кнопкой «Открыть Forex Diary»
- Mini App на HTML/CSS/JS
- Backend на Node.js + Express
- SQLite для сделок
- авторизация через Telegram `initData`
- статистика и журнал
- торговый план H4 → H1 → M15 → M5
- Order Block / FVG / Liquidity / BOS / CHOCH

## 1. Создать бота
В Telegram открой @BotFather:
1. `/newbot`
2. придумай имя и username
3. сохрани токен как секрет.

## 2. Настроить Mini App URL
После публикации сервера у тебя будет HTTPS-адрес, например:
`https://your-domain.example`

В @BotFather:
- `/setmenubutton`
- выбери своего бота
- текст: `Forex Diary`
- URL: адрес Mini App

## 3. Запуск локально

Нужен Node.js 20+.

```bash
npm install
cp .env.example .env
```

В `.env`:
```env
BOT_TOKEN=токен_от_BotFather
WEBAPP_URL=https://твой-https-адрес
PORT=3000
```

Запуск:
```bash
npm start
```

## 4. Важно
Telegram Mini App должен открываться по HTTPS. Для реального использования размести проект на сервере/VPS/хостинге с HTTPS.

Токен бота нельзя публиковать в HTML, GitHub или сообщениях.
