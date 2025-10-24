require("dotenv").config();
const { Telegraf } = require("telegraf");
const express = require("express");
const cron = require("node-cron");
const axios = require("axios");

const setupHandlers = require("./bot/handlers");
const googleServiceFactory = require("./services/googleService");
const storageFactory = require("./services/storage");
const { runCheckAndSend } = require("./bot/checker");

// --- ENV ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const SHEET_ID = process.env.SHEET_ID;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const CHECK_CRON = process.env.CHECK_CRON || "*/5 * * * *";
const USE_MONGODB = process.env.USE_MONGODB === "true";
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID;
const PORT = process.env.PORT || 3000;
const RAILWAY_URL =
  process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL;

// --- Tekshiruv ---
if (!BOT_TOKEN || !SHEET_ID || !SERVICE_ACCOUNT_KEY) {
  console.error("❌ .env faylini to‘ldiring!");
  process.exit(1);
}

// --- Bot yaratamiz ---
const bot = new Telegraf(BOT_TOKEN);

// --- Google va saqlash servislarini ulaymiz ---
const googleService = googleServiceFactory(SHEET_ID, SERVICE_ACCOUNT_KEY);
const Users = storageFactory(USE_MONGODB, MONGODB_URI);

// --- Handlerlarni ulaymiz ---
setupHandlers(bot, Users, googleService, { ADMIN_ID, runCheckAndSend });

// --- Cron (avtomatik yuborish) ---
cron.schedule(CHECK_CRON, async () => {
  console.log("⏰ Cron ishga tushdi");
  try {
    await runCheckAndSend(bot, Users, googleService);
  } catch (err) {
    console.error("❌ Cron bajarilishida xato:", err.message);
  }
});

// --- Express app ---
const app = express();
app.use(express.json());
app.use(bot.webhookCallback("/webhook"));

// === Keep-alive uchun har 5 daqiqada ping ===
cron.schedule("*/5 * * * *", async () => {
  if (!RAILWAY_URL) return;
  try {
    await axios.get(`https://${RAILWAY_URL}`);
    console.log("🔄 Keep-alive ping yuborildi");
  } catch (err) {
    console.error("⚠️ Ping yuborishda xato:", err.message);
  }
});

// --- Webhookni o‘rnatish ---
(async () => {
  try {
    const webhookUrl = `https://${RAILWAY_URL}/webhook`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`🌐 Webhook ${webhookUrl} ga o‘rnatildi`);
  } catch (err) {
    console.error("❌ Webhook o‘rnatishda xato:", err.message);
  }
})();

// --- Asosiy endpoint ---
app.get("/", (req, res) => res.send("✅ Bot ishga tushdi (Railway)"));

app.listen(PORT, () => {
  console.log(`🚀 Server ${PORT}-portda ishlayapti`);
});
