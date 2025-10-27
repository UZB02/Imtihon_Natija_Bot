// index.js
require("dotenv").config();
const { Telegraf } = require("telegraf");
const cron = require("node-cron");
const express = require("express");

const setupHandlers = require("./bot/handlers");
const googleServiceFactory = require("./services/googleService");
const storageFactory = require("./services/storage");
const { runCheckAndSend } = require("./bot/checker");

// === ENV o‘zgaruvchilar ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const SHEET_ID = process.env.SHEET_ID;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const CHECK_CRON = process.env.CHECK_CRON || "*/5 * * * *";
const USE_MONGODB = process.env.USE_MONGODB === "true";
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID;
const RAILWAY_URL = process.env.RAILWAY_URL;
const PORT = process.env.PORT || 3000;

// === Asosiy tekshiruv ===
if (!BOT_TOKEN || !SHEET_ID || !SERVICE_ACCOUNT_KEY) {
  console.error("❌ .env faylini to‘ldiring!");
  process.exit(1);
}

// === Botni yaratamiz ===
const bot = new Telegraf(BOT_TOKEN);

// === Servislarni ulaymiz ===
const googleService = googleServiceFactory(SHEET_ID, SERVICE_ACCOUNT_KEY);
const Users = storageFactory(USE_MONGODB, MONGODB_URI);

// === Handlerlarni o‘rnatamiz ===
setupHandlers(bot, Users, googleService, { ADMIN_ID, runCheckAndSend });

// === Express server (webhook uchun) ===
const app = express();
app.use(express.json());

// Webhook endpoint (tokenni URLga qo‘shmaslik kerak!)
app.post("/webhook", (req, res) => {
  bot.handleUpdate(req.body);
  res.status(200).end();
});

// Test uchun oddiy route
app.get("/", (req, res) => {
  res.send("🤖 Imtihon Natija Bot webhook orqali ishlayapti!");
});

// === Cron ishga tushirish ===
cron.schedule(CHECK_CRON, async () => {
  console.log("⏰ Cron ishga tushdi");
  await runCheckAndSend(bot, Users, googleService);
});

// === Serverni ishga tushirish ===
app.listen(PORT, async () => {
  console.log(`🚀 Server ${PORT}-portda ishga tushdi`);

  try {
    // Avval eski webhookni o‘chiramiz
    await bot.telegram.deleteWebhook();

    // Yangi webhookni o‘rnatamiz
    await bot.telegram.setWebhook(`${RAILWAY_URL}/webhook`);
    console.log(`🌐 Webhook o‘rnatildi: ${RAILWAY_URL}/webhook`);

    // ✅ (ixtiyoriy) Lokal test uchun pollingni o‘chirish:
    // await bot.launch();
  } catch (err) {
    console.error("❌ Webhook o‘rnatishda xatolik:", err.message);
  }
});

// === Toza to‘xtatish ===
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
