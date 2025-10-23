// bot/checker.js
const { composeMessage } = require("../utils/helpers");

/**
 * Barcha ota-onalarga imtihon natijalarini yuborish
 */
async function runCheckAndSend(bot, Users, googleService) {
  try {
    const sheetNames = await googleService.getSheetNames();

    for (const sheetName of sheetNames) {
      const students = await googleService.readSheetByName(sheetName);

      for (const student of students) {
        const parents = await Users.findByClassAndName(
          sheetName,
          student.fullName
        );
        if (!parents?.length) continue;

        const msg = composeMessage(sheetName, student);

        for (const parent of parents) {
          await bot.telegram.sendMessage(parent.chatId, msg).catch(() => {});
        }
      }
    }

    console.log("✅ Ota-onalarga natijalar yuborildi.");
    return { ok: true, message: "Barcha ota-onalarga natijalar yuborildi." };
  } catch (err) {
    console.error("❌ runCheckAndSend xatosi:", err);
    return { ok: false, message: err.message || "Xato yuz berdi." };
  }
}

module.exports = { runCheckAndSend };
