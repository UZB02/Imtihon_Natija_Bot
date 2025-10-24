require("dotenv").config();
const { Telegraf } = require("telegraf");
const cron = require("node-cron");

const setupHandlers = require("./bot/handlers");
const googleServiceFactory = require("./services/googleService");
const storageFactory = require("./services/storage");
const { runCheckAndSend } = require("./bot/checker");

// --- ENV o‘zgaruvchilarni yuklaymiz ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const SHEET_ID = process.env.SHEET_ID;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const CHECK_CRON = process.env.CHECK_CRON || "*/5 * * * *";
const USE_MONGODB = process.env.USE_MONGODB === "true";
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID;

// --- Tekshiruv ---
if (!BOT_TOKEN || !SHEET_ID || !SERVICE_ACCOUNT_KEY) {
  console.error("❌ .env faylini to‘ldiring!");
  process.exit(1);
}

// --- Botni yaratamiz ---
const bot = new Telegraf(BOT_TOKEN);

// --- Google va saqlash servislarini ulaymiz ---
const googleService = googleServiceFactory(SHEET_ID, SERVICE_ACCOUNT_KEY);
const Users = storageFactory(USE_MONGODB, MONGODB_URI);

// --- Handlerlarni ulaymiz ---
setupHandlers(bot, Users, googleService, { ADMIN_ID, runCheckAndSend });

// --- Cron (avtomatik yuborish) ---
cron.schedule(CHECK_CRON, async () => {
  console.log("⏰ Cron ishga tushdi");
  await runCheckAndSend(bot, Users, googleService);
});

// --- Botni ishga tushiramiz ---
bot.launch();
console.log("🤖 Bot ishga tushdi.");

// --- Toza to‘xtatish ---
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
