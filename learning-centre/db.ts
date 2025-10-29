import path from "path";
import sqlite3 from "sqlite3";

// === 初始化資料庫 ===
export const db = new sqlite3.Database(
  path.join(__dirname, "database.sqlite"),
  (err) => {
    if (err) console.error("❌ 資料庫連接失敗:", err);
    else console.log("✅ SQLite 資料庫連接成功");
  }
);

// === 建立所有資料表 ===
db.serialize(() => {
  // users 資料表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT CHECK(role IN ('student', 'teacher', 'admin'))
    )
  `);

  // courses 資料表
  db.run(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      teacher_id INTEGER NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    )
  `);

  // enrollments 資料表
  db.run(`
    CREATE TABLE IF NOT EXISTS enrollments (
      course_id INTEGER,
      student_id INTEGER,
      enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (course_id, student_id),
      FOREIGN KEY (course_id) REFERENCES courses(id),
      FOREIGN KEY (student_id) REFERENCES users(id)
    )
  `);

  // rooms 資料表
  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER UNIQUE,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id)
    )
  `);

  // materials 資料表
  db.run(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER,
      title TEXT,
      url TEXT,
      type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    )
  `);

  // messages 資料表
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER,
      user_id INTEGER,
      text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // homework 資料表
  db.run(`
    CREATE TABLE IF NOT EXISTS homework (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER,
      title TEXT,
      description TEXT,
      deadline DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    )
  `);

  // homework_submissions 資料表
  db.run(`
    CREATE TABLE IF NOT EXISTS homework_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      homework_id INTEGER,
      student_id INTEGER,
      file_url TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      grade INTEGER,
      feedback TEXT,
      FOREIGN KEY (homework_id) REFERENCES homework(id),
      FOREIGN KEY (student_id) REFERENCES users(id)
    )
  `);

  // 插入預設管理員帳號（如果不存在）
  db.run(`
    INSERT OR IGNORE INTO users (username, password, role) 
    VALUES ('admin', 'admin123', 'admin')
  `);

  // 插入預設教師帳號（如果不存在）
  db.run(`
    INSERT OR IGNORE INTO users (username, password, role) 
    VALUES ('teacher1', 'teacher123', 'teacher')
  `);

  // 插入預設學生帳號（如果不存在）
  db.run(`
    INSERT OR IGNORE INTO users (username, password, role) 
    VALUES ('student1', 'student123', 'student')
  `);
});

// === 修復數據表結構 ===
db.serialize(() => {
  // 修復 enrollments 表 - 添加 enrolled_at 欄位
  db.run(
    `
    ALTER TABLE enrollments 
    ADD COLUMN enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP
  `,
    (err: { message: string | string[] }) => {
      if (err && !err.message.includes("duplicate column name")) {
        console.log(
          "ℹ️ enrollments 表已包含 enrolled_at 欄位或修改失敗:",
          err.message
        );
      } else {
        console.log("✅ 成功修復 enrollments 表，添加 enrolled_at 欄位");
      }
    }
  );

  // 確保所有必要欄位都存在
  setTimeout(() => {
    console.log("\n🔧 檢查數據表完整性...");

    // 檢查 enrollments 表結構
    db.all("PRAGMA table_info(enrollments)", (err: any, columns: any[]) => {
      if (err) {
        console.error("❌ 檢查 enrollments 表結構失敗:", err);
      } else {
        console.log("📋 enrollments 表欄位:");
        columns.forEach((col) => {
          console.log(`   - ${col.name} (${col.type})`);
        });

        // 檢查選課記錄
        db.all(
          "SELECT * FROM enrollments LIMIT 5",
          (err: any, enrollments: any[]) => {
            if (err) {
              console.error("❌ 查詢選課記錄失敗:", err);
            } else {
              console.log(`📊 當前選課記錄: ${enrollments.length} 條`);
              enrollments.forEach((enroll) => {
                console.log(
                  `   課程 ${enroll.course_id} -> 學生 ${enroll.student_id}`
                );
              });
            }
          }
        );
      }
    });
  }, 500);
});
