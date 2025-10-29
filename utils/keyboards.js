const { Markup } = require("telegraf");

const mainKeyboard = Markup.keyboard([["➕ Natijalarni ko'rish", "ℹ️ Yordam"]])
  .resize()
  .oneTime(false);

const adminMainKeyboard = Markup.keyboard([
  ["📤 Natijalarni yuborish", "📢 Barcha foydalanuvchilarga xabar yuborish"],
  ["➕ Natijalarni ko'rish", "ℹ️ Yordam"],
])
  .resize()
  .oneTime(false);

module.exports = { mainKeyboard, adminMainKeyboard };
