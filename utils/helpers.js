function normalizeName(s) {
  return (s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function chunkArray(arr, size) {
  const res = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

function composeMessage(sheetName, student) {
  let text = `📘 Sinf: ${sheetName}\n`;
  text += `👨‍🎓 O‘quvchi: ${student.fullName}\n`;

  // 🥇 Egallagan o‘rni mavjud bo‘lsa, qo‘shamiz
  if (student.place) {
    text += `🏅 Egallagan o‘rni: ${student.place}-o‘rin\n`;
  }

  text += `\n📊 Imtihon natijalari:\n`;
  student.scores.forEach((subject) => {
    text += `• ${subject.name}: ${subject.value} ball\n`;
  });

  // Umumiy ball va foiz ham qo‘shiladi
  if (student.total) text += `\n🔢 Umumiy ball: ${student.total}\n`;
  if (student.percent) text += `📈Fanlarni o'zlashtirishi (%): ${student.percent}%\n`;

  return text.trim();
}

module.exports = { normalizeName, chunkArray, composeMessage };
