// bot/checker.js
const { composeMessage } = require("../utils/helpers");
const { Telegraf } = require("telegraf");
const bot = new Telegraf(process.env.BOT_TOKEN);


/**
 * Barcha ota-onalarga imtihon natijalarini yuborish
 */
async function runCheckAndSend(bot, Users, googleService) {
  try {
    const sheetNames = await googleService.getSheetNames();
    let totalSentCount = 0; // umumiy hisob
    console.log("📊 Natijalar yuborilishi boshlandi...");

    for (const sheetName of sheetNames) {
      let sentCount = 0; // har bir sinf uchun alohida hisob
      const students = await googleService.readSheetByName(sheetName);
      const allSendPromises = [];

      for (const student of students) {
        const parents = await Users.findByClassAndName(
          sheetName,
          student.fullName
        );
        if (!parents?.length) continue;

        const msg = composeMessage(sheetName, student);

        parents.forEach((parent) => {
          allSendPromises.push(
            bot.telegram
              .sendMessage(parent.chatId, msg)
              .then(() => (sentCount += 1))
              .catch(() => {})
          );
        });
      }

      // Parallel yuborishni 30 tadan bo‘lib yuboramiz
      const chunkSize = 30;
      for (let i = 0; i < allSendPromises.length; i += chunkSize) {
        const chunk = allSendPromises.slice(i, i + chunkSize);
        await Promise.all(chunk);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log(`✅ ${sheetName} sinfidan ${sentCount} ta xabar yuborildi.`);
      totalSentCount += sentCount; // umumiy hisobga qo‘shamiz
    }

    console.log(
      `📨 Umumiy ${totalSentCount} ta natijalar yuborildi.`
    );
    return { ok: true, message: `${totalSentCount} ta ota-onaga yuborildi.` };
  } catch (err) {
    console.error("❌ runCheckAndSend xatosi:", err);
    return { ok: false, message: err.message || "Xato yuz berdi." };
  }
}



// Admin uchun barcha ota-onalarga natijalarni yuborish buyrug‘i
bot.action("send_results_all", async (ctx) => {
  const userId = String(ctx.from.id);
  if (String(userId) !== String(process.env.ADMIN_ID)) {
    return ctx.answerCbQuery("❌ Sizda ruxsat yo‘q!", { show_alert: true });
  }

  // Admin darhol xabar oladi
  await ctx.answerCbQuery("✅ Yuborish boshlandi...");
  await ctx.reply("📨 Natijalar yuborilishi boshlandi. Iltimos, kuting...");

  try {
    // Yuborish jarayonini fon (background)da ishga tushiramiz
    runCheckAndSend(bot, Users, googleService)
      .then((res) => {
        ctx.reply(`✅ ${res.message}`);
      })
      .catch((err) => {
        console.error("❌ runCheckAndSend xatosi:", err);
        ctx.reply("⚠️ Xatolik yuz berdi.");
      });
  } catch (err) {
    console.error("❌ send_results_all handler xatosi:", err);
    await ctx.reply("❌ Yuborish vaqtida xatolik yuz berdi.");
  }
});




module.exports = { runCheckAndSend };
