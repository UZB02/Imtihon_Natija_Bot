function normalizeName(s) {
  return (s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function chunkArray(arr, size) {
  const res = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

function composeMessage(sheetName, student) {
  let text = `📘 Sinf: ${sheetName}\n👨‍🎓 O‘quvchi: ${student.fullName}\n\n📊 Imtihon natijalari:\n`;
  student.scores.forEach((subject) => {
    text += `• ${subject.name}: ${subject.value}\n`;
  });
  return text.trim();
}

module.exports = { normalizeName, chunkArray, composeMessage };
