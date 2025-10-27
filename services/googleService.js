const { google } = require("googleapis");

module.exports = (SHEET_ID, SERVICE_ACCOUNT_KEY) => {
  const key = SERVICE_ACCOUNT_KEY.trim().startsWith("{")
    ? JSON.parse(SERVICE_ACCOUNT_KEY)
    : SERVICE_ACCOUNT_KEY;

  const auth = new google.auth.GoogleAuth({
    credentials: typeof key === "object" ? key : undefined,
    keyFile: typeof key === "string" ? key : undefined,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  async function readSheetByName(sheetName) {
    const range = `${sheetName}!A1:H1000`;
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

  async function getSheetNames() {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    return meta.data.sheets.map((s) => s.properties.title);
  }

  return { readSheetByName, getSheetNames };
};
