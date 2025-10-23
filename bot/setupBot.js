const { Telegraf, Markup } = require("telegraf");
const cron = require("node-cron");
const setupHandlers = require("./handlers");
const { composeMessage } = require("../utils/helpers");

function setupBot({ Users, googleService, BOT_TOKEN, CHECK_CRON }) {
  if (!BOT_TOKEN) throw new Error("BOT_TOKEN topilmadi!");

  const bot = new Telegraf(BOT_TOKEN);

  let cronEnabled = false;
  let cronJob = null;

  // 🔹 Barcha handlerlarni ulaymiz (foydalanuvchilar uchun)
  setupHandlers(bot, Users, googleService);

  // 🔹 Cron ishini bajaruvchi funksiya
  async function checkAndSendAll() {
    try {
      const sheetNames = await googleService.getSheetNames();
      for (const sheetName of sheetNames) {
        const students = await googleService.readSheetByName(sheetName);
        for (const student of students) {
          const parents = await Users.findByClassAndName(sheetName, student.fullName);
          if (!parents?.length) continue;

          const msg = composeMessage(sheetName, student);
          for (const p of parents) {
            try {
              await bot.telegram.sendMessage(p.chatId, msg);
              console.log(`✅ ${p.chatId} -> ${student.fullName} (${sheetName})`);
            } catch (err) {
              console.error("❌ Yuborishda xato:", p.chatId, err?.message);
            }
          }
        }
      }
      console.log("✅ Tekshiruv tugadi.");
    } catch (err) {
      console.error("checkAndSendAll xatosi:", err);
    }
  }

  // 🔹 Cronni yoqish yoki o‘chirish
  function toggleCron(ctx) {
    if (!cronEnabled) {
      cronJob = cron.schedule(CHECK_CRON, async () => {
        console.log("⏰ Cron job: tekshiruv", new Date().toISOString());
        await checkAndSendAll();
      });
      cronEnabled = true;
      ctx.reply("✅ Cron yoqildi (avtomatik tekshiruv).");
    } else {
      cronJob?.stop();
      cronEnabled = false;
      ctx.reply("⛔ Cron o‘chirildi.");
    }
  }

  // 🔹 Admin panel tugmalari
  const adminKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback("📊 Imtihon natijalarini yuborish", "send_results")],
    [Markup.button.callback("📢 Barcha foydalanuvchilarga xabar yuborish", "send_all")],
    [Markup.button.callback("⚙️ Cronni yoqish/o‘chirish", "toggle_cron")],
  ]);

  // 🔹 Start buyrug‘i
  bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const adminIds = (process.env.ADMIN_IDS || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map(Number);

    console.log("🧩 start:", chatId, adminIds);

    if (adminIds.includes(chatId)) {
      await ctx.reply("👋 Salom, Admin!\nQuyidagi tugmalardan foydalaning:", adminKeyboard);
    } else {
      await ctx.reply(
        "👋 Assalomu alaykum!\nBotdan foydalanish uchun '➕ Farzand qo‘shish' tugmasini bosing."
      );
    }
  });

  // 🔹 Admin uchun tugma actionlari
  bot.action("send_results", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("📊 Imtihon natijalari yuborilmoqda...");
    await checkAndSendAll();
    await ctx.reply("✅ Barcha natijalar yuborildi.");
  });

  bot.action("send_all", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply("✍️ Yuboriladigan xabar matnini kiriting:");
    bot.once("text", async (msgCtx) => {
      const text = msgCtx.message.text;
      const users = await Users.getAll();
      for (const u of users) {
        try {
          await bot.telegram.sendMessage(u.chatId, text);
        } catch (err) {
          console.error("Xabar yuborishda xato:", err.message);
        }
      }
      await msgCtx.reply("✅ Xabar barcha foydalanuvchilarga yuborildi.");
    });
  });

  bot.action("toggle_cron", async (ctx) => {
    await ctx.answerCbQuery();
    toggleCron(ctx);
  });

  return bot;
}

module.exports = setupBot;
