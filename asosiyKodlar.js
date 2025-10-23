require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const { google } = require("googleapis");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const _ = require("lodash");

const BOT_TOKEN = process.env.BOT_TOKEN;
const SHEET_ID = process.env.SHEET_ID;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const CHECK_CRON = process.env.CHECK_CRON || "*/5 * * * *";
const USE_MONGODB = process.env.USE_MONGODB === "true";

if (!BOT_TOKEN || !SHEET_ID || !SERVICE_ACCOUNT_KEY) {
  console.error(
    "Iltimos .env faylini to‘ldiring: BOT_TOKEN, SHEET_ID, GOOGLE_SERVICE_ACCOUNT_KEY"
  );
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// --- Storage layer (JSON yoki MongoDB) ---
let Users;
if (USE_MONGODB) {
  const mongoose = require("mongoose");
  mongoose
    .connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => console.log("MongoDB ulanish o‘rnatildi"))
    .catch((err) => console.error("MongoDB error", err));

  const userSchema = new mongoose.Schema({
    chatId: Number,
    parentName: String,
    className: String,
    childFullName: String,
    phone: String,
    createdAt: { type: Date, default: Date.now },
  });

  const UserModel = mongoose.model("Parent", userSchema);

  Users = {
    addUser: async (u) =>
      UserModel.findOneAndUpdate(
        {
          chatId: u.chatId,
          className: u.className,
          childFullName: u.childFullName,
        },
        u,
        { upsert: true, new: true }
      ),
    findByClassAndName: async (className, childFullName) =>
      UserModel.find({
        className: new RegExp("^" + _.escapeRegExp(className) + "$", "i"),
        childFullName: new RegExp(
          "^" + _.escapeRegExp(childFullName) + "$",
          "i"
        ),
      }),
    listAll: async () => UserModel.find({}),
  };
} else {
  const DATA_FILE = path.join(__dirname, "data", "users.json");
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  if (!fs.existsSync(DATA_FILE))
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));

  const readAll = () => JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const writeAll = (arr) =>
    fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2));

  Users = {
    addUser: async (u) => {
      const arr = readAll();
      const existingIndex = arr.findIndex(
        (x) =>
          x.chatId === u.chatId &&
          x.className === u.className &&
          x.childFullName.toLowerCase() === u.childFullName.toLowerCase()
      );
      if (existingIndex >= 0)
        arr[existingIndex] = { ...arr[existingIndex], ...u };
      else arr.push(u);
      writeAll(arr);
      return u;
    },
    findByClassAndName: async (className, childFullName) => {
      const arr = readAll();
      const norm = (s) => (s || "").trim().toLowerCase();
      return arr.filter(
        (x) =>
          norm(x.className) === norm(className) &&
          norm(x.childFullName) === norm(childFullName)
      );
    },
    listAll: async () => readAll(),
  };
}

// --- Google Sheets setup ---
const auth = new google.auth.GoogleAuth({
  keyFile: SERVICE_ACCOUNT_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// --- Utils ---
function normalizeName(s) {
  return (s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

async function readSheetByName(sheetName) {
  const range = `${sheetName}!A1:F1000`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  if (rows.length < 2) return [];

  const headers = rows[1];
  const dataRows = rows.slice(2);

  return dataRows
    .map((r) => ({
      idx: r[0],
      fullName: r[1],
      scores: headers.slice(2).map((subject, i) => ({
        name: subject,
        value: r[i + 2] || "",
      })),
    }))
    .filter((x) => x.fullName && x.fullName.trim().length > 0);
}

function composeMessage(sheetName, student) {
  let text = `📘 Sinf: ${sheetName}\n👨‍🎓 O‘quvchi: ${student.fullName}\n\n📊 Imtihon natijalari:\n`;
  student.scores.forEach((subject) => {
    text += `• ${subject.name}: ${subject.value}\n`;
  });
  return text.trim();
}

// --- checkAndSendAll ---
async function checkAndSendAll() {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const sheetNames = meta.data.sheets.map((s) => s.properties.title);

    for (const sheetName of sheetNames) {
      const students = await readSheetByName(sheetName);
      for (const student of students) {
        const parents = await Users.findByClassAndName(
          sheetName,
          student.fullName
        );
        if (!parents?.length) continue;

        const msg = composeMessage(sheetName, student);
        for (const p of parents) {
          try {
            await bot.telegram.sendMessage(p.chatId, msg);
            console.log(`✅ ${p.chatId} -> ${student.fullName} (${sheetName})`);
          } catch (err) {
            console.error(
              "Xatolik yuborishda",
              p.chatId,
              err?.description || err?.message || err
            );
          }
        }
      }
    }
  } catch (err) {
    console.error("checkAndSendAll xatosi:", err);
  }
}

// --- Bot flow ---
const WAITING = {};
const FAMILY = {};

function chunkArray(arr, size) {
  const res = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

bot.start(async (ctx) => {
  const chatId = ctx.chat.id;
  FAMILY[chatId] = [];
  WAITING[chatId] = { step: "askClass" };

  let classes = [];
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    classes = meta.data.sheets.map((s) => s.properties.title);
  } catch {
    classes = ["5-Green", "5-Blue", "6-Green"];
  }

  const chunks = chunkArray(classes, 8);
  for (const group of chunks) {
    const buttons = group.map((c) => Markup.button.callback(c, `class_${c}`));
    await ctx.reply(
      "Sinfingizni tanlang:",
      Markup.inlineKeyboard(buttons, { columns: 2 })
    );
  }
  await ctx.reply(
    "Agar ro‘yxatda yo‘q bo‘lsa, sinf nomini yozing (masalan: 5-Green)"
  );
});

bot.action(/class_(.+)/, async (ctx) => {
  const className = ctx.match[1];
  const chatId = ctx.chat.id;
  WAITING[chatId] = { step: "askChild", className };
  await ctx.answerCbQuery();
  await ctx.reply(
    `Sinf: ${className}\nFarzandingizning to‘liq ism-familiyasini yozing:`
  );
});

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const text = (ctx.message.text || "").trim();
  if (!WAITING[chatId]) return ctx.reply("Iltimos /start buyrug‘ini bosing.");

  const state = WAITING[chatId];

  if (state.step === "askClass") {
    state.className = text;
    state.step = "askChild";
    return ctx.reply(
      `Sinf: ${text}\nEndi farzandingizning ism-familiyasini yozing:`
    );
  }

  if (state.step === "askChild") {
    state.childFullName = text;
    state.step = "askPhone";
    return ctx.reply('Telefon raqamingizni kiriting (yoki "skip")');
  }

  if (state.step === "askPhone") {
    const phone = text.toLowerCase() === "skip" ? "" : text;

    const payload = {
      chatId,
      parentName:
        ctx.from.first_name +
        (ctx.from.last_name ? " " + ctx.from.last_name : ""),
      className: state.className,
      childFullName: state.childFullName,
      phone,
    };
    await Users.addUser(payload);
    FAMILY[chatId].push(payload);

    delete WAITING[chatId];

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback("➕ Yana farzand qo‘shish", "add_child")],
      [Markup.button.callback("✅ Yakunlash", "finish_children")],
    ]);

    return ctx.reply(
      "Farzand ro‘yxatga olindi! Quyidagilardan birini tanlang:",
      buttons
    );
  }
});

// ➕ Yana farzand qo‘shish
bot.action("add_child", async (ctx) => {
  const chatId = ctx.chat.id;
  WAITING[chatId] = { step: "askClass" };
  await ctx.answerCbQuery();

  let classes = [];
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    classes = meta.data.sheets.map((s) => s.properties.title);
  } catch {
    classes = ["5-Green", "5-Blue", "6-Green"];
  }

  const chunks = chunkArray(classes, 8);
  for (const group of chunks) {
    const buttons = group.map((c) => Markup.button.callback(c, `class_${c}`));
    await ctx.reply(
      "Sinfingizni tanlang:",
      Markup.inlineKeyboard(buttons, { columns: 2 })
    );
  }
});

// ✅ Yakunlash
bot.action("finish_children", async (ctx) => {
  const chatId = ctx.chat.id;
  await ctx.answerCbQuery();

  const family = FAMILY[chatId] || [];
  if (!family.length) return ctx.reply("Siz hali farzand kiritmadingiz.");

  await ctx.reply("📊 Farzandlaringiz uchun natijalar olinmoqda...");

  for (const child of family) {
    const className = child.className;
    const students = await readSheetByName(className);
    const student = students.find(
      (s) => normalizeName(s.fullName) === normalizeName(child.childFullName)
    );

    if (!student) {
      await ctx.reply(
        `❌ ${child.childFullName} (${className}) uchun maʼlumot topilmadi.`
      );
      continue;
    }

    const msg = composeMessage(className, student);
    await ctx.reply(msg);
  }

  delete FAMILY[chatId];
  await ctx.reply("✅ Barcha farzandlaringiz natijalari yuborildi. Rahmat!");
});

// Admin qo‘lda tekshirishi
bot.command("checknow", async (ctx) => {
  const adminIds = (process.env.ADMIN_IDS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map(Number);
  if (adminIds.length && !adminIds.includes(ctx.chat.id)) {
    return ctx.reply("Sizda ruxsat yo‘q.");
  }
  await ctx.reply("Tekshirish boshlandi...");
  await checkAndSendAll();
  await ctx.reply("Tekshirish tugadi.");
});

// Botni ishga tushurish
bot.launch();
console.log("✅ Bot ishga tushdi.");

// Cron ishga tushurish
cron.schedule(CHECK_CRON, async () => {
  console.log("⏰ Cron job: tekshiruv", new Date().toISOString());
  await checkAndSendAll();
});

// Yakuniy tozalash
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
