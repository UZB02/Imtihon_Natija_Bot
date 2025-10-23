const { Markup } = require("telegraf");
const {
  normalizeName,
  chunkArray,
  composeMessage,
} = require("../utils/helpers");

function setupHandlers(bot, Users, googleService, options = {}) {
  const WAITING = {};
  const FAMILY = {};

  // 🔹 Admin ID (ruxsat tekshiruvi uchun)
  const ADMIN_ID = options.ADMIN_ID || process.env.ADMIN_ID;
  const runCheckAndSend = options.runCheckAndSend; // index.js dan kelyapti

  // 🔹 Doimiy pastki tugmalar
  const mainKeyboard = Markup.keyboard([["➕ Farzand qo‘shish", "ℹ️ Yordam"]])
    .resize()
    .oneTime(false);

  // 🟢 Start buyrug‘i
  bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    FAMILY[chatId] = [];
    WAITING[chatId] = { step: "askClass" };

    await ctx.reply(
      "👋 Assalomu alaykum!\n\nQuyidagi pastki tugmalar orqali farzandingizni qo‘shishingiz yoki yordam olishingiz mumkin.",
      mainKeyboard
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

  // 🔹 "➕ Farzand qo‘shish" bosilganda
  bot.hears("➕ Farzand qo‘shish", async (ctx) => {
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

  // 🔹 "ℹ️ Yordam" bosilganda
  bot.hears("ℹ️ Yordam", async (ctx) => {
    await ctx.replyWithMarkdown(
      "ℹ️ *Yordam:*\n\n1️⃣ '➕ Farzand qo‘shish' tugmasini bosing.\n2️⃣ Sinfingizni tanlang.\n3️⃣ Farzandingiz ismini ro‘yxatdan tanlang.\n4️⃣ Yakunlang va natijalarni oling."
    );
  });

  // 🟡 Sinf tanlanganda
  bot.action(/class_(.+)/, async (ctx) => {
    const className = ctx.match[1];
    const chatId = ctx.chat.id;
    WAITING[chatId] = { step: "askChild", className };
    await ctx.answerCbQuery();

    try {
      const students = await googleService.readSheetByName(className);
      if (!students || students.length === 0) {
        return ctx.reply(`❌ ${className} sinfi uchun ma’lumot topilmadi.`);
      }

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

  // 🧒 Farzand tanlanganda
  bot.action(/child_selected_(.+)/, async (ctx) => {
    const childFullName = ctx.match[1];
    const chatId = ctx.chat.id;
    const state = WAITING[chatId];

    if (!state || !state.className) {
      return ctx.reply("⚠️ Iltimos, avval /start buyrug‘idan boshlang.");
    }

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
      [Markup.button.callback("➕ Yana farzand qo‘shish", "add_child")],
      [Markup.button.callback("✅ Yakunlash", "finish_children")],
    ]);

    await ctx.answerCbQuery();
    return ctx.reply(
      `✅ ${childFullName} (${state.className}) ro‘yxatga olindi!`,
      buttons
    );
  });

  // ➕ Yana farzand qo‘shish
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
    await ctx.reply("✅ Barcha natijalar yuborildi. Rahmat!", mainKeyboard);
  });

  // ===============================
  // 🔹 ADMIN PANEL QISMI
  // ===============================

  // 🧑‍💼 /admin buyrug‘i
  bot.command("admin", async (ctx) => {
    const userId = String(ctx.from.id);
    if (String(userId) !== String(ADMIN_ID)) {
      return ctx.reply("❌ Siz admin emassiz!");
    }

    await ctx.reply(
      "🛠 Admin panel:",
      Markup.inlineKeyboard([
        [Markup.button.callback("📤 Natijalarni yuborish", "send_results_all")],
      ])
    );
  });

  // 📤 Tugma bosilganda — barcha ota-onalarga natijalarni yuborish
  bot.action("send_results_all", async (ctx) => {
    const userId = String(ctx.from.id);
    if (String(userId) !== String(ADMIN_ID)) {
      return ctx.answerCbQuery("❌ Sizda ruxsat yo‘q!", { show_alert: true });
    }

    // Callbackni tezda yakunlash uchun javob qaytaramiz
    await ctx.answerCbQuery("⏳ Yuborish jarayoni boshlandi...");
    await ctx.reply("📤 Imtihon natijalari yuborilmoqda...");

    // Asosiy jarayonni orqa fonda (awaitsiz) ishga tushiramiz
    runCheckAndSend(bot, Users, googleService)
      .then(async (result) => {
        if (result.ok) {
          await ctx.reply(`✅ ${result.message}`);
        } else {
          await ctx.reply(`⚠️ Xato: ${result.message}`);
        }
      })
      .catch(async (err) => {
        console.error("Admin yuborish xatosi:", err);
        await ctx.reply("❌ Xatolik yuz berdi. Tafsilotlar konsolda.");
      });
  });

  // 📢 Admin barcha foydalanuvchilarga xabar yuborish
  bot.command("sendall", async (ctx) => {
    const userId = String(ctx.from.id);
    if (String(userId) !== String(ADMIN_ID)) {
      return ctx.reply("❌ Siz admin emassiz!");
    }

    ctx.reply(
      "✉️ Iltimos, yubormoqchi bo‘lgan xabaringizni kiriting:",
      Markup.inlineKeyboard([
        [Markup.button.callback("❌ Bekor qilish", "cancel_sendall")],
      ])
    );

    // Adminning holatini eslab qolamiz
    const chatId = ctx.chat.id;
    WAITING[chatId] = { step: "awaiting_broadcast_message" };
  });

  // 🔹 Admin matn yuborganda
  bot.on("text", async (ctx) => {
    const chatId = ctx.chat.id;

    // Agar admin xabar yuborayotgan bo‘lsa
    if (WAITING[chatId]?.step === "awaiting_broadcast_message") {
      const userId = String(ctx.from.id);
      if (String(userId) !== String(ADMIN_ID)) return;

      const message = ctx.message.text;
      delete WAITING[chatId];

      await ctx.reply(
        `📢 Quyidagi xabar barcha foydalanuvchilarga yuboriladi:\n\n"${message}"\n\nTasdiqlaysizmi?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "✅ Ha, yubor",
              `confirm_sendall_${encodeURIComponent(message)}`
            ),
            Markup.button.callback("❌ Yo‘q, bekor", "cancel_sendall"),
          ],
        ])
      );
    }
  });

  // 🔹 Bekor qilish tugmasi
  bot.action("cancel_sendall", async (ctx) => {
    delete WAITING[ctx.chat.id];
    await ctx.answerCbQuery();
    await ctx.reply("❌ Yuborish bekor qilindi.");
  });

  // 🔹 Tasdiqlanganda xabarni hamma foydalanuvchilarga yuborish
  bot.action(/confirm_sendall_(.+)/, async (ctx) => {
    const userId = String(ctx.from.id);
    if (String(userId) !== String(ADMIN_ID)) {
      return ctx.answerCbQuery("❌ Sizda ruxsat yo‘q!", { show_alert: true });
    }

    const message = decodeURIComponent(ctx.match[1]);
    await ctx.answerCbQuery("📨 Yuborish boshlandi...");
    await ctx.reply("⏳ Xabar yuborilmoqda, biroz kuting...");

    try {
      const users = await Users.getAll(); // barcha foydalanuvchilarni olish
      let success = 0,
        failed = 0;

      for (const user of users) {
        try {
          await bot.telegram.sendMessage(user.chatId, message);
          success++;
        } catch (err) {
          failed++;
          console.error(`❌ Xabar yuborilmadi (${user.chatId}):`, err.message);
        }
        await new Promise((r) => setTimeout(r, 100)); // flood-limitdan saqlanish uchun 0.1s kutish
      }

      await ctx.reply(
        `✅ ${success} ta foydalanuvchiga xabar yuborildi.\n⚠️ ${failed} tasi muvaffaqiyatsiz.`
      );
    } catch (err) {
      console.error("❌ sendall xatosi:", err);
      await ctx.reply("❌ Xabar yuborishda xatolik yuz berdi.");
    }
  });
}

module.exports = setupHandlers;
