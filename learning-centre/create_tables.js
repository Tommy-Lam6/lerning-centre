// create_tables.js
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("database.sqlite");

// 建立 rooms 表
db.run(`
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    teacher_id INTEGER NOT NULL,
    course_code TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 建立 room_students 關聯表
db.run(`
  CREATE TABLE IF NOT EXISTS room_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log("✅ 資料表建立完成！");
db.close();
