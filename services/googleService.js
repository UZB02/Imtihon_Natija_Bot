const { google } = require("googleapis");

module.exports = (SHEET_ID, SERVICE_ACCOUNT_KEY) => {
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  async function readSheetByName(sheetName) {
    const range = `${sheetName}!A1:I1000`; // A dan I gacha (O‘rin ustuni ham kiradi)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return [];

    const headers = rows[1]; // 2-qator — sarlavhalar
    const dataRows = rows.slice(2); // 3-qator va keyingi qatordan ma’lumotlar

    return dataRows
      .map((r) => ({
        place: r[0], // 🥇 O‘rin (A ustun)
        fullName: r[1], // F.I.O. (C ustun)
        scores: headers.slice(2, headers.length - 2).map((subject, i) => ({
          name: subject, // Fan nomi
          value: r[i + 2] || "", // Ball
        })),
        total: r[headers.length - 2] || "", // Umumiy ball (H ustun)
        percent: r[headers.length - 1] || "", // % (I ustun)
      }))
      .filter((x) => x.fullName && x.fullName.trim().length > 0);
  }

  async function getSheetNames() {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    return meta.data.sheets.map((s) => s.properties.title);
  }

  return { readSheetByName, getSheetNames };
};
