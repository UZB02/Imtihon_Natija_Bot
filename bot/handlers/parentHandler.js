const { Markup } = require("telegraf");
const {
  normalizeName,
  chunkArray,
  composeMessage,
} = require("../../utils/helpers.js");

module.exports = function parentHandler(
  bot,
  Users,
  googleService,
  FAMILY,
  WAITING,
  ADMIN_ID
) {
  // 🔹 Start
  bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    FAMILY[chatId] = [];
    WAITING[chatId] = { step: "askClass" };

    const userId = String(ctx.from.id);
    const isAdmin = userId === String(ADMIN_ID);

    const mainKeyboard = Markup.keyboard([
      ["➕ Natijalarni ko'rish", "ℹ️ Yordam"],
    ])
      .resize()
      .oneTime(false);

    const adminKeyboard = Markup.keyboard([
      [
        "📤 Natijalarni yuborish",
        "📢 Barcha foydalanuvchilarga xabar yuborish",
      ],
      ["➕ Natijalarni ko'rish", "ℹ️ Yordam"],
    ])
      .resize()
      .oneTime(false);

    await ctx.reply(
      "👋 Assalomu alaykum!\nQuyidagi pastki tugmalar orqali farzandingizni qo‘shishingiz yoki yordam olishingiz mumkin.",
      isAdmin ? adminKeyboard : mainKeyboard
    );

    let classes = [];
    try {
      classes = await googleService.getSheetNames();
    } catch {
      classes = ["5-Green", "5-Blue", "6-Green"];
    }

    const chunks = chunkArray(classes, 8);
    for (const group of chunks) {
      const buttons = group.map((c) => Markup.button.callback(c, `class_${c}`));
      await ctx.reply(
        "📘 Sinfingizni tanlang:",
        Markup.inlineKeyboard(buttons, { columns: 2 })
      );
    }
  });

  // ℹ️ Yordam
  bot.hears("ℹ️ Yordam", async (ctx) => {
    await ctx.replyWithMarkdown(
      "ℹ️ *Yordam:*\n1️⃣ '➕ Natijalarni ko'rish' tugmasini bosing.\n2️⃣ Sinfni tanlang.\n3️⃣ Farzand ismini tanlang.\n4️⃣ Yakunlang va natijalarni oling."
    );
  });

  // ➕ Natijalarni ko‘rish
  bot.hears("➕ Natijalarni ko'rish", async (ctx) => {
    const chatId = ctx.chat.id;
    WAITING[chatId] = { step: "askClass" };

    let classes = [];
    try {
      classes = await googleService.getSheetNames();
    } catch {
      classes = ["5-Green", "5-Blue", "6-Green"];
    }

    const chunks = chunkArray(classes, 8);
    for (const group of chunks) {
      const buttons = group.map((c) => Markup.button.callback(c, `class_${c}`));
      await ctx.reply(
        "📘 Sinfingizni tanlang:",
        Markup.inlineKeyboard(buttons, { columns: 2 })
      );
    }
  });

  // 🟡 Sinf tanlash
  bot.action(/class_(.+)/, async (ctx) => {
    const className = ctx.match[1];
    const chatId = ctx.chat.id;
    WAITING[chatId] = { step: "askChild", className };
    await ctx.answerCbQuery();

    try {
      const students = await googleService.readSheetByName(className);
      if (!students || students.length === 0)
        return ctx.reply(`❌ ${className} sinfi uchun ma’lumot topilmadi.`);

      const chunks = chunkArray(students, 8);
      for (const group of chunks) {
        const buttons = group.map((s) =>
          Markup.button.callback(s.fullName, `child_selected_${s.fullName}`)
        );
        await ctx.reply(
          `👨‍🎓 Farzandingizni tanlang (${className}):`,
          Markup.inlineKeyboard(buttons, { columns: 2 })
        );
      }
    } catch (err) {
      console.error("❌ O‘quvchilarni olishda xato:", err);
      await ctx.reply("⚠️ Ma’lumotni olishda xato yuz berdi.");
    }
  });

  // 🧒 Farzand tanlash
  bot.action(/child_selected_(.+)/, async (ctx) => {
    const childFullName = ctx.match[1];
    const chatId = ctx.chat.id;
    const state = WAITING[chatId];
    if (!state || !state.className)
      return ctx.reply("⚠️ Iltimos, avval /start buyrug‘idan boshlang.");

    const payload = {
      chatId,
      parentName:
        ctx.from.first_name +
        (ctx.from.last_name ? " " + ctx.from.last_name : ""),
      className: state.className,
      childFullName,
    };

    if (!FAMILY[chatId]) FAMILY[chatId] = [];
    await Users.addUser(payload);
    FAMILY[chatId].push(payload);
    delete WAITING[chatId];

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback("➕ Farzand qo'shish", "add_child")],
      [Markup.button.callback("✅ Yakunlash", "finish_children")],
    ]);

    await ctx.answerCbQuery();
    return ctx.reply(
      `✅ ${childFullName} (${state.className}) ro‘yxatga olindi!`,
      buttons
    );
  });

  // ➕ Yana qo‘shish
  bot.action("add_child", async (ctx) => {
    const chatId = ctx.chat.id;
    WAITING[chatId] = { step: "askClass" };
    await ctx.answerCbQuery();

    const classes = await googleService.getSheetNames();
    const chunks = chunkArray(classes, 8);
    for (const group of chunks) {
      const buttons = group.map((c) => Markup.button.callback(c, `class_${c}`));
      await ctx.reply(
        "📘 Sinfingizni tanlang:",
        Markup.inlineKeyboard(buttons, { columns: 2 })
      );
    }
  });

  // ✅ Yakunlash
  bot.action("finish_children", async (ctx) => {
    const chatId = ctx.chat.id;
    await ctx.answerCbQuery();

    const family = FAMILY[chatId] || [];
    if (!family.length) return ctx.reply("⚠️ Siz hali farzand kiritmadingiz.");

    await ctx.reply("📊 Farzandlaringiz natijalari olinmoqda...");

    for (const child of family) {
      const students = await googleService.readSheetByName(child.className);
      const student = students.find(
        (s) => normalizeName(s.fullName) === normalizeName(child.childFullName)
      );

      if (!student) {
        await ctx.reply(
          `❌ ${child.childFullName} (${child.className}) topilmadi.`
        );
        continue;
      }

      const msg = composeMessage(child.className, student);
      await ctx.reply(msg);
    }

    delete FAMILY[chatId];
    await ctx.reply("✅ Barcha natijalar yuborildi. Rahmat!");
  });
};
