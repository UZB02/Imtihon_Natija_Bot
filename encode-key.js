const fs = require("fs");

const key = fs.readFileSync("./keys/imtihonnatijabot-3ef67e32585a.json", "utf8");

// Barcha yangi qatorlarni (\n) va qo‘shtirnoqlarni to‘g‘rilaymiz
const oneLine = key.replace(/\n/g, "\\n").replace(/"/g, '\\"');

console.log("👇 Buni .env faylingizga qo‘ying:\n");
console.log(`GOOGLE_SERVICE_ACCOUNT_KEY="${oneLine}"`);
