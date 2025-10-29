const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("database.sqlite");

db.all("SELECT name FROM sqlite_master WHERE type='table';", (err, rows) => {
  if (err) {
    console.error("❌ 錯誤:", err);
  } else {
    console.log("📋 資料庫裡面現有的資料表:");
    rows.forEach(r => console.log(" -", r.name));
  }
  db.close();
});
