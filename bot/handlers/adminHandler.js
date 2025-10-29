// bot/adminHandlers.js
const { Markup } = require("telegraf");

function setupAdminHandlers(bot, Users, googleService, options = {}) {
  const ADMIN_ID = options.ADMIN_ID || process.env.ADMIN_ID;
  const runCheckAndSend = options.runCheckAndSend;
  const WAITING = {};

  const adminMainKeyboard = Markup.keyboard([
    ["📤 Natijalarni yuborish", "📢 Barcha foydalanuvchilarga xabar yuborish"],
    ["➕ Natijalarni ko'rish", "ℹ️ Yordam"],
  ])
    .resize()
    .oneTime(false);

  // 🛠 Admin panel
  bot.command("admin", async (ctx) => {
    const userId = String(ctx.from.id);
    if (userId !== String(ADMIN_ID)) return ctx.reply("❌ Siz admin emassiz!");
    await ctx.reply("🛠 Admin panel:", adminMainKeyboard);
  });

  // 📤 Natijalarni yuborish
  bot.hears("📤 Natijalarni yuborish", async (ctx) => {
    const userId = String(ctx.from.id);
    if (userId !== String(ADMIN_ID)) return;

    await ctx.reply("📤 Imtihon natijalari yuborilmoqda...");
    runCheckAndSend(bot, Users, googleService)
      .then(async (result) => {
        if (result.ok)
          await ctx.reply(`✅ ${result.message}`, adminMainKeyboard);
        else await ctx.reply(`⚠️ Xato: ${result.message}`, adminMainKeyboard);
      })
      .catch(async (err) => {
        console.error("Admin yuborish xatosi:", err);
        await ctx.reply(
          "❌ Xatolik yuz berdi. Tafsilotlar konsolda.",
          adminMainKeyboard
        );
      });
  });

  // 📢 Broadcast xabar
  bot.hears("📢 Barcha foydalanuvchilarga xabar yuborish", async (ctx) => {
    const userId = String(ctx.from.id);
    if (userId !== String(ADMIN_ID)) return;

    const chatId = ctx.chat.id;
    WAITING[chatId] = { step: "awaiting_broadcast_message" };
    await ctx.reply(
      "✉️ Iltimos, yubormoqchi bo‘lgan xabaringizni kiriting (matn, rasm, video yoki fayl bo‘lishi mumkin):"
    );
  });

  // 📨 Xabarni olish (har qanday formatda)
  bot.on("message", async (ctx) => {
    const chatId = ctx.chat.id;
    const waiting = WAITING[chatId];

    if (!waiting || waiting.step !== "awaiting_broadcast_message") return;

    const userId = String(ctx.from.id);
    if (userId !== String(ADMIN_ID)) return;

    delete WAITING[chatId];

    WAITING[chatId] = {
      step: "confirm_broadcast",
      message: ctx.message, // to‘liq xabar obyektini saqlaymiz
    };

    await ctx.reply(
      "📢 Shu xabar barcha foydalanuvchilarga yuborilsinmi?",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Ha, yubor", "confirm_sendall_message"),
          Markup.button.callback("❌ Bekor", "cancel_sendall"),
        ],
      ])
    );
  });

  // ❌ Bekor
  bot.action("cancel_sendall", async (ctx) => {
    const chatId = ctx.chat.id;
    delete WAITING[chatId];
    await ctx.answerCbQuery();
    await ctx.reply("❌ Yuborish bekor qilindi.", adminMainKeyboard);
  });

  // ✅ Tasdiqlab yuborish
  bot.action("confirm_sendall_message", async (ctx) => {
    const userId = String(ctx.from.id);
    if (userId !== String(ADMIN_ID))
      return ctx.answerCbQuery("❌ Sizda ruxsat yo‘q!", { show_alert: true });

    const chatId = ctx.chat.id;
    const waiting = WAITING[chatId];
    if (!waiting || !waiting.message)
      return ctx.answerCbQuery("❌ Hech qanday xabar topilmadi!");

    const message = waiting.message;
    delete WAITING[chatId];

    await ctx.answerCbQuery("📨 Yuborish boshlandi...");
    const warningMessage = await ctx.reply(
      "⏳ Xabar yuborilmoqda, biroz kuting..."
    );

    try {
      const users = await Users.getAll();
      const uniqueChatIds = [...new Set(users.map((u) => u.chatId))];

      let success = 0,
        failed = 0;

      for (const targetId of uniqueChatIds) {
        try {
          // ✅ copyMessage original formatni saqlaydi (matn, rasm, video, fayl)
          await bot.telegram.copyMessage(
            targetId,
            message.chat.id,
            message.message_id
          );
          success++;
        } catch (err) {
          failed++;
          console.error(`❌ Xabar yuborilmadi (${targetId}):`, err.message);
        }

        await new Promise((r) => setTimeout(r, 100)); // flood limitdan saqlanish
      }

      await ctx.deleteMessage(warningMessage.message_id);
      await ctx.reply(
        `✅ ${success} ta foydalanuvchiga xabar yuborildi.\n⚠️ ${failed} tasi yuborilmadi.`,
        adminMainKeyboard
      );
    } catch (err) {
      console.error("❌ sendall xatosi:", err);
      await ctx.reply(
        "❌ Xabar yuborishda xatolik yuz berdi.",
        adminMainKeyboard
      );
    }
  });
}

module.exports = setupAdminHandlers;
