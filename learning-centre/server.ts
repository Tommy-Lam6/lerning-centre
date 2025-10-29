// ==============================
// SmartEdu Server (SQLite 版本) - 完整修正版
// ==============================

import express from "express";
import bodyParser from "body-parser";
// sqlite3 callbacks replaced by better-sqlite3 sync API
import { db } from "./db2";
import cors from "cors";
import path from "path";
import session from "express-session";
import multer from "multer";
import fs from "fs";

// --- 擴展 express-session 的 SessionData 型別 ---
declare module "express-session" {
  interface SessionData {
    userId?: number;
    username?: string;
    role?: string;
  }
}

const app = express();

// === 中間件設定 ===
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 請求日誌中間件
app.use((req, res, next) => {
  console.log(`📝 請求: ${req.method} ${req.path}`);
  next();
});

// Session 設定
app.use(
  session({
    secret: "learning-center-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000, // 24小時
    },
  })
);

// 靜態檔案服務
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// add remaining tables and seed rows in one exec
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER,
      title TEXT,
      url TEXT,
      type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER,
      user_id INTEGER,
      text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS homework (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER,
      title TEXT,
      description TEXT,
      deadline DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );

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
    );

    INSERT OR REPLACE INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin');
    INSERT OR REPLACE INTO users (username, password, role) VALUES ('teacher1', 'teacher123', 'teacher');
    INSERT OR REPLACE INTO users (username, password, role) VALUES ('student1', 'student123', 'student');
  `);

  // 驗證種子用戶是否正確插入
  const adminUser = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get("admin") as any;
  const teacherUser = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get("teacher1") as any;
  const studentUser = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get("student1") as any;

  console.log("🔍 驗證種子用戶:");
  console.log(
    "   👨‍💼 管理員:",
    adminUser ? `${adminUser.username}/${adminUser.password}` : "❌ 不存在"
  );
  console.log(
    "   👨‍🏫 教師:",
    teacherUser
      ? `${teacherUser.username}/${teacherUser.password}`
      : "❌ 不存在"
  );
  console.log(
    "   👨‍🎓 學生:",
    studentUser
      ? `${studentUser.username}/${studentUser.password}`
      : "❌ 不存在"
  );
} catch (err) {
  console.error("❌ 初始化額外資料表或插入種子數據失敗:", err);
}

// === 修復數據表結構 ===
try {
  // 嘗試添加 enrolled_at 欄位（如果已存在則捕獲錯誤）
  try {
    db.prepare(
      `ALTER TABLE enrollments ADD COLUMN enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP`
    ).run();
    console.log("✅ 成功修復 enrollments 表，添加 enrolled_at 欄位");
  } catch (e: any) {
    // better-sqlite3 會拋出錯誤，如果是欄位已存在，記錄並繼續
    console.log(
      "ℹ️ enrollments 表已包含 enrolled_at 欄位或修改失敗:",
      e && e.message ? e.message : e
    );
  }

  // 檢查並列出表結構/樣本數據
  console.log("\n🔧 檢查數據表完整性...");
  try {
    const columns = db.prepare("PRAGMA table_info(enrollments)").all() as any[];
    console.log("📋 enrollments 表欄位:");
    columns.forEach((col) => {
      console.log(`   - ${col.name} (${col.type})`);
    });

    const enrollments = db
      .prepare("SELECT * FROM enrollments LIMIT 5")
      .all() as any[];
    console.log(`📊 當前選課記錄: ${enrollments.length} 條`);
    enrollments.forEach((enroll) => {
      console.log(`   課程 ${enroll.course_id} -> 學生 ${enroll.student_id}`);
    });
  } catch (e) {
    console.error("❌ 檢查 enrollments 表或查詢樣本數據失敗:", e);
  }
} catch (err) {
  console.error("❌ 修復數據表結構過程中發生錯誤:", err);
}

// === 文件上傳設定 ===
// file upload is configured in ./upload.ts

// === 身份驗證中間件 ===
import { requireLogin, requireRole } from "./auth";

// === 登入 API ===
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ success: false, message: "請輸入帳號及密碼" });
  }

  try {
    const row = db
      .prepare("SELECT * FROM users WHERE username = ? AND password = ?")
      .get(username, password) as any;
    if (!row) {
      return res.json({ success: false, message: "帳號或密碼錯誤" });
    }

    // Set session and respond on successful login
    req.session.userId = row.id;
    req.session.username = row.username;
    req.session.role = row.role;
    return res.json({
      success: true,
      message: "登入成功",
      role: row.role,
      user: { id: row.id, username: row.username, role: row.role },
    });
  } catch (err) {
    console.error("❌ 登入錯誤:", err);
    return res.json({ success: false, message: "登入失敗" });
  }
});

// 修改用戶 - 需要管理員權限
app.put("/users/:id", requireLogin, requireRole("admin"), (req, res) => {
  const { id } = req.params;
  const { username, password, role } = req.body;

  try {
    db.prepare(
      "UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?"
    ).run(username, password, role, id);
    console.log(`✏️ 更新用戶 (ID: ${id})`);
    return res.json({ success: true, message: "更新成功" });
  } catch (err) {
    console.error("❌ 更新用戶錯誤:", err);
    return res.json({ success: false, message: "更新失敗" });
  }
});

// 刪除用戶 - 需要管理員權限
app.delete("/users/:id", requireLogin, requireRole("admin"), (req, res) => {
  const { id } = req.params;

  try {
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    console.log(`🗑️ 刪除用戶 (ID: ${id})`);
    return res.json({ success: true, message: "刪除成功" });
  } catch (err) {
    console.error("❌ 刪除用戶錯誤:", err);
    return res.json({ success: false, message: "刪除失敗" });
  }
});

// === 獲取所有用戶列表 API ===
app.get("/users", requireLogin, requireRole("admin"), (req, res) => {
  try {
    const users = db
      .prepare(
        "SELECT id, username, role, created_at FROM users ORDER BY created_at DESC"
      )
      .all() as any[];

    console.log(`📋 獲取用戶列表: ${users.length} 個用戶`);
    return res.json(users);
  } catch (err) {
    console.error("❌ 獲取用戶列表錯誤:", err);
    return res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
});

// === 搜尋用戶 API ===
app.get(
  "/admin/users/search",
  requireLogin,
  requireRole("admin"),
  (req, res) => {
    const { keyword, role, page = 1, limit = 50 } = req.query;

    console.log(
      `🔍 搜尋用戶 - 關鍵字: ${keyword}, 角色: ${role}, 頁碼: ${page}`
    );

    let sql = `
    SELECT id, username, role, created_at 
    FROM users 
    WHERE 1=1
  `;
    // normalize query params and prepare params for prepared statements
    const keywordStr = String(keyword || "").trim();
    const roleStr = String(role || "");
    const pageNum = parseInt(String(page || "1")) || 1;
    const limitNum = parseInt(String(limit || "50")) || 50;

    const params: any[] = [];
    if (keywordStr !== "") {
      sql += ` AND (username LIKE ? OR id = ?)`;
      params.push(`%${keywordStr}%`, keywordStr);
    }
    if (roleStr !== "") {
      sql += ` AND role = ?`;
      params.push(roleStr);
    }

    const offset = (pageNum - 1) * limitNum;
    sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
    params.push(limitNum, offset);

    try {
      const rows = db.prepare(sql).all(...params) as any[];

      let countSql = `SELECT COUNT(*) as total FROM users WHERE 1=1`;
      const countParams: any[] = [];
      if (keywordStr !== "") {
        countSql += ` AND (username LIKE ? OR id = ?)`;
        countParams.push(`%${keywordStr}%`, keywordStr);
      }
      if (roleStr !== "") {
        countSql += ` AND role = ?`;
        countParams.push(roleStr);
      }

      const countResult = db.prepare(countSql).get(...countParams) as any;
      const total = Number(countResult?.total || 0);

      res.json({
        success: true,
        users: rows,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        searchParams: { keyword: keywordStr, role: roleStr },
      });
    } catch (err) {
      console.error("❌ 搜尋用戶錯誤:", err);
      return res.status(500).json({ success: false, message: "搜尋失敗" });
    }
  }
);

// === 管理員專用 API ===

// 獲取所有課程列表
app.get("/admin/courses", requireLogin, requireRole("admin"), (req, res) => {
  try {
    console.log("🚀 新版本管理員課程API被呼叫！");
    const courses = db
      .prepare(
        `
        SELECT 
          c.id,
          c.name,
          c.description,
          c.created_at,
          u.username as teacher_name,
          u.id as teacher_id,
          (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as student_count
        FROM courses c
        JOIN users u ON c.teacher_id = u.id
        ORDER BY c.created_at DESC
      `
      )
      .all() as any[];

    console.log(`📋 管理員獲取課程列表: ${courses.length} 個課程`);
    return res.json({
      success: true,
      courses: courses,
      message: `成功獲取 ${courses.length} 個課程`,
    });
  } catch (err) {
    console.error("❌ 獲取課程列表錯誤:", err);
    return res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
});

// 獲取課程詳情
app.get(
  "/admin/courses/:id",
  requireLogin,
  requireRole("admin"),
  (req, res) => {
    const courseId = req.params.id;

    const sql = `
    SELECT 
      c.id,
      c.name,
      c.description,
      c.created_at,
      u.username as teacher_name,
      u.id as teacher_id,
      (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as student_count,
      (SELECT COUNT(*) FROM materials m JOIN rooms r ON m.room_id = r.id WHERE r.course_id = c.id) as material_count,
      (SELECT COUNT(*) FROM homework h JOIN rooms r ON h.room_id = r.id WHERE r.course_id = c.id) as homework_count
    FROM courses c
    JOIN users u ON c.teacher_id = u.id
    WHERE c.id = ?
  `;

    try {
      const course = db.prepare(sql).get(courseId) as any;
      if (!course) {
        return res.status(404).json({ success: false, message: "課程未找到" });
      }

      let students: any[] = [];
      try {
        students = db
          .prepare(
            `SELECT u.id, u.username FROM enrollments e JOIN users u ON e.student_id = u.id WHERE e.course_id = ?`
          )
          .all(courseId) as any[];
      } catch (e) {
        console.error("❌ 獲取學生列表錯誤:", e);
        students = [];
      }

      res.json({ success: true, course: { ...course, students } });
    } catch (err) {
      console.error("❌ 獲取課程詳情錯誤:", err);
      return res.status(500).json({ success: false, message: "伺服器錯誤" });
    }
  }
);

// === 課程 / 房間 API ===

// 學生查看自己課程
app.get(
  "/student/courses",
  requireLogin,
  requireRole("student"),
  (req, res) => {
    const studentId = req.session.userId;
    const sql = `
    SELECT 
      c.id, 
      c.name, 
      c.description, 
      c.created_at,
      r.id AS room_id, 
      r.name AS room_name,
      u.username AS teacher_name
    FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    LEFT JOIN rooms r ON c.id = r.course_id
    LEFT JOIN users u ON c.teacher_id = u.id
    WHERE e.student_id = ?
    ORDER BY c.created_at DESC
  `;
    try {
      const rows = db.prepare(sql).all(studentId) as any[];
      return res.json(rows);
    } catch (err) {
      console.error("❌ 查詢學生課程錯誤:", err);
      return res.status(500).json({ success: false, message: "伺服器錯誤" });
    }
  }
);

// 老師查看自己課程
app.get(
  "/teacher/courses",
  requireLogin,
  requireRole("teacher"),
  (req, res) => {
    const teacherId = req.session.userId;
    const sql = `
    SELECT 
      c.id, 
      c.name, 
      c.description, 
      c.created_at,
      r.id AS room_id, 
      r.name AS room_name,
      (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) AS student_count
    FROM courses c
    LEFT JOIN rooms r ON c.id = r.course_id
    WHERE c.teacher_id = ?
    ORDER BY c.created_at DESC
  `;
    try {
      const rows = db.prepare(sql).all(teacherId) as any[];
      return res.json(rows);
    } catch (err) {
      console.error("❌ 查詢老師課程錯誤:", err);
      return res.status(500).json({ success: false, message: "伺服器錯誤" });
    }
  }
);

// 取得所有課程 (for 學生選課)
app.get("/courses", requireLogin, (req, res) => {
  const studentId = req.session.userId;
  const sql = `
    SELECT 
      c.id, 
      c.name, 
      c.description, 
      c.created_at,
      u.username AS teacher_name,
      r.id AS room_id,
      EXISTS(SELECT 1 FROM enrollments WHERE course_id = c.id AND student_id = ?) AS is_enrolled
    FROM courses c
    JOIN users u ON c.teacher_id = u.id
    LEFT JOIN rooms r ON c.id = r.course_id
    ORDER BY c.created_at DESC
  `;
  try {
    const rows = db.prepare(sql).all(studentId) as any[];
    return res.json(rows);
  } catch (err) {
    console.error("❌ 查詢所有課程錯誤:", err);
    return res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
});

// 老師新增課程（同時建房間）
app.post(
  "/teacher/courses",
  requireLogin,
  requireRole("teacher"),
  (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.json({ success: false, message: "請輸入課程名稱" });

    try {
      const insertCourse = db.prepare(
        "INSERT INTO courses (name, teacher_id, description) VALUES (?, ?, ?)"
      );
      const result = insertCourse.run(
        name,
        req.session.userId,
        description
      ) as any;
      const courseId =
        result.lastInsertRowid ??
        result.lastID ??
        (result as any).lastInsertRowid;

      const insertRoom = db.prepare(
        "INSERT INTO rooms (course_id, name) VALUES (?, ?)"
      );
      const roomResult = insertRoom.run(courseId, `${name} 教室`) as any;
      const roomId =
        roomResult.lastInsertRowid ??
        roomResult.lastID ??
        (roomResult as any).lastInsertRowid;

      return res.json({ success: true, courseId, roomId });
    } catch (err) {
      console.error("❌ 新增課程或建立房間錯誤:", err);
      return res.status(500).json({ success: false, message: "新增課程失敗" });
    }
  }
);

// === 老師修改課程 API ===
app.put(
  "/teacher/courses/:id",
  requireLogin,
  requireRole("teacher"),
  (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    const teacherId = req.session.userId;

    if (!name) {
      return res.json({ success: false, message: "請輸入課程名稱" });
    }

    try {
      const course = db
        .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
        .get(id, teacherId) as any;
      if (!course) {
        return res
          .status(404)
          .json({ success: false, message: "課程未找到或無權限修改" });
      }

      const update = db.prepare(
        "UPDATE courses SET name = ?, description = ? WHERE id = ?"
      );
      update.run(name, description, id);
      console.log(`✏️ 老師 ${teacherId} 更新課程 (ID: ${id})`);
      return res.json({ success: true, message: "課程更新成功" });
    } catch (err) {
      console.error("❌ 更新課程錯誤:", err);
      return res.status(500).json({ success: false, message: "更新失敗" });
    }
  }
);

// === 老師刪除課程 API (修正版) ===
app.delete(
  "/teacher/courses/:id",
  requireLogin,
  requireRole("teacher"),
  (req, res) => {
    const { id } = req.params;
    const teacherId = req.session.userId;

    try {
      const course = db
        .prepare("SELECT * FROM courses WHERE id = ? AND teacher_id = ?")
        .get(id, teacherId) as any;
      if (!course) {
        return res
          .status(404)
          .json({ success: false, message: "課程未找到或無權限刪除" });
      }

      const roomRow = db
        .prepare("SELECT id FROM rooms WHERE course_id = ?")
        .get(id) as any;
      const roomId = roomRow ? roomRow.id : null;

      if (roomId) {
        try {
          db.prepare("DELETE FROM messages WHERE room_id = ?").run(roomId);
          db.prepare("DELETE FROM materials WHERE room_id = ?").run(roomId);
          db.prepare("DELETE FROM homework WHERE room_id = ?").run(roomId);
          db.prepare("DELETE FROM rooms WHERE course_id = ?").run(id);
          db.prepare("DELETE FROM enrollments WHERE course_id = ?").run(id);
          db.prepare("DELETE FROM courses WHERE id = ?").run(id);

          console.log(`🗑️ 老師 ${teacherId} 刪除課程 (ID: ${id}) 及相關資料`);
          return res.json({
            success: true,
            message: "課程及相關資料已成功刪除",
          });
        } catch (err) {
          console.error("❌ 刪除課程相關資料錯誤:", err);
          return res.status(500).json({ success: false, message: "刪除失敗" });
        }
      } else {
        try {
          db.prepare("DELETE FROM enrollments WHERE course_id = ?").run(id);
          db.prepare("DELETE FROM courses WHERE id = ?").run(id);
          console.log(`🗑️ 老師 ${teacherId} 刪除課程 (ID: ${id})`);
          return res.json({ success: true, message: "課程已成功刪除" });
        } catch (err) {
          console.error("❌ 刪除課程錯誤:", err);
          return res.status(500).json({ success: false, message: "刪除失敗" });
        }
      }
    } catch (err) {
      console.error("❌ 查詢課程或房間錯誤:", err);
      return res.status(500).json({ success: false, message: "伺服器錯誤" });
    }
  }
);

// 學生選課 API
app.post(
  "/student/enroll",
  requireLogin,
  requireRole("student"),
  (req, res) => {
    const { course_id } = req.body;
    const student_id = req.session.userId;

    console.log(
      `🚀 學生選課API被呼叫: 學生ID ${student_id}, 課程ID ${course_id}`
    );

    if (!course_id) {
      return res.status(400).json({ success: false, message: "缺少課程 ID" });
    }

    try {
      const course = db
        .prepare("SELECT id FROM courses WHERE id = ?")
        .get(course_id) as any;
      if (!course) {
        return res.status(404).json({ success: false, message: "課程未找到" });
      }

      try {
        // 檢查是否已經選課
        const existingEnrollment = db
          .prepare(
            "SELECT id FROM enrollments WHERE course_id = ? AND student_id = ?"
          )
          .get(course_id, student_id) as any;

        if (existingEnrollment) {
          return res.json({
            success: false,
            message: "您已經選擇了此課程",
          });
        }

        // 添加選課記錄
        const result = db
          .prepare(
            "INSERT INTO enrollments (course_id, student_id) VALUES (?, ?)"
          )
          .run(course_id, student_id);

        if (result.changes > 0) {
          console.log(`📚 學生 ${student_id} 成功選課 ${course_id}`);
          return res.json({
            success: true,
            message: "選課成功",
          });
        } else {
          return res.json({
            success: false,
            message: "選課失敗，請稍後再試",
          });
        }
      } catch (err) {
        console.error("❌ 選課錯誤:", err);
        return res.status(500).json({ success: false, message: "選課失敗" });
      }
    } catch (err) {
      console.error("❌ 檢查課程錯誤:", err);
      return res.status(500).json({ success: false, message: "伺服器錯誤" });
    }
  }
);

// 學生退課 API
app.post(
  "/student/unenroll",
  requireLogin,
  requireRole("student"),
  (req, res) => {
    const { course_id } = req.body;
    const student_id = req.session.userId;

    if (!course_id) {
      return res.status(400).json({ success: false, message: "缺少課程 ID" });
    }

    try {
      // 檢查是否已選課
      const enrollment = db
        .prepare(
          "SELECT id FROM enrollments WHERE course_id = ? AND student_id = ?"
        )
        .get(course_id, student_id) as any;

      if (!enrollment) {
        return res
          .status(404)
          .json({ success: false, message: "您沒有選擇此課程" });
      }

      // 刪除選課記錄
      try {
        const result = db
          .prepare(
            "DELETE FROM enrollments WHERE course_id = ? AND student_id = ?"
          )
          .run(course_id, student_id);

        if (result.changes > 0) {
          console.log(`📚 學生 ${student_id} 成功退選課程 ${course_id}`);
          return res.json({
            success: true,
            message: "退選成功",
          });
        } else {
          return res.status(404).json({
            success: false,
            message: "退選失敗，未找到選課記錄",
          });
        }
      } catch (err) {
        console.error("❌ 退課錯誤:", err);
        return res.status(500).json({ success: false, message: "退課失敗" });
      }
    } catch (err) {
      console.error("❌ 檢查選課記錄錯誤:", err);
      return res.status(500).json({ success: false, message: "伺服器錯誤" });
    }
  }
);

// === 房間頁面路由 - 修正路徑 ===

// 學生房間頁面 - 修正路徑
app.get(
  "/student-room/:courseId",
  requireLogin,
  requireRole("student"),
  (req, res) => {
    res.sendFile(path.join(__dirname, "public", "student-room.html"));
  }
);

// 教師房間頁面 - 修正路徑
app.get(
  "/teacher-room/:courseId",
  requireLogin,
  requireRole("teacher"),
  (req, res) => {
    res.sendFile(path.join(__dirname, "public", "teacher-room.html"));
  }
);

// === 數據庫診斷路由 ===
app.get("/debug/database-check", requireLogin, (req, res) => {
  console.log("🔧 執行數據庫診斷檢查...");

  const checks = [];

  // 檢查 rooms 表
  try {
    const rooms = db
      .prepare("SELECT id, course_id, name FROM rooms LIMIT 5")
      .all() as any[];
    checks.push({
      table: "rooms",
      result: `找到 ${rooms.length} 個房間`,
      data: rooms,
    });

    const courses = db
      .prepare("SELECT id, name, teacher_id FROM courses LIMIT 5")
      .all() as any[];
    checks.push({
      table: "courses",
      result: `找到 ${courses.length} 個課程`,
      data: courses,
    });

    const enrollments = db
      .prepare(
        "SELECT course_id, student_id, enrolled_at FROM enrollments LIMIT 10"
      )
      .all() as any[];
    checks.push({
      table: "enrollments",
      result: `找到 ${enrollments.length} 個選課記錄`,
      data: enrollments,
    });

    const users = db
      .prepare("SELECT id, username, role FROM users")
      .all() as any[];
    checks.push({
      table: "users",
      result: `找到 ${users.length} 個用戶`,
      data: users,
    });

    res.json({
      success: true,
      diagnostic: checks,
      summary: {
        totalRooms: rooms.length,
        totalCourses: courses.length,
        totalEnrollments: enrollments.length,
        totalUsers: users.length,
      },
    });
  } catch (err) {
    console.error("❌ database-check 錯誤:", err);
    return res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
});

// === 修復 enrollments 表結構 ===
app.get("/debug/fix-enrollments", requireLogin, (req, res) => {
  console.log("🔧 開始修復 enrollments 表結構...");

  // 方法1：嘗試添加 enrolled_at 欄位（允許NULL）
  interface Enrollment {
    course_id: number;
    student_id: number;
    enrolled_at?: string;
  }

  interface FixEnrollmentsResponse {
    success: boolean;
    message?: string;
    error?: string;
  }

  try {
    // 方法1：嘗試添加 enrolled_at 欄位
    try {
      db.prepare(
        "ALTER TABLE enrollments ADD COLUMN enrolled_at DATETIME"
      ).run();
      console.log("✅ 成功添加 enrolled_at 欄位");

      // 更新現有記錄的時間戳
      db.prepare(
        "UPDATE enrollments SET enrolled_at = datetime('now') WHERE enrolled_at IS NULL"
      ).run();
      console.log("✅ 時間戳更新完成");

      const response: FixEnrollmentsResponse = {
        success: true,
        message: "enrollments 表結構修復完成",
      };
      return res.json(response);
    } catch (alterErr: any) {
      console.log("ℹ️ 方法1失敗，嘗試方法2...:", alterErr.message);

      // 方法2：創建新表並遷移數據
      try {
        // 創建臨時表
        db.prepare(
          `
          CREATE TABLE IF NOT EXISTS enrollments_new (
            course_id INTEGER,
            student_id INTEGER,
            enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (course_id, student_id),
            FOREIGN KEY (course_id) REFERENCES courses(id),
            FOREIGN KEY (student_id) REFERENCES users(id)
          )
        `
        ).run();

        console.log("✅ 新表創建成功");

        db.prepare(
          `
          INSERT OR IGNORE INTO enrollments_new (course_id, student_id, enrolled_at) 
          SELECT course_id, student_id, datetime('now') FROM enrollments
        `
        ).run();

        console.log("✅ 數據遷移成功");

        db.prepare("ALTER TABLE enrollments RENAME TO enrollments_old").run();
        db.prepare("ALTER TABLE enrollments_new RENAME TO enrollments").run();

        console.log("✅ 表結構修復完成！");
        const response: FixEnrollmentsResponse = {
          success: true,
          message: "enrollments 表結構修復完成",
        };
        return res.json(response);
      } catch (err: any) {
        console.error("❌ 修復 enrollments 表結構過程中發生錯誤:", err);
        const response: FixEnrollmentsResponse = {
          success: false,
          error: err.message,
        };
        return res.json(response);
      }
    }
  } catch (err: any) {
    console.error("❌ 修復流程失敗:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// === 檢查身份 API ===
app.get("/check-auth", (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({
      success: true,
      user: {
        id: req.session.userId,
        username: req.session.username,
        role: req.session.role,
      },
    });
  } else {
    return res.json({ success: false, message: "未登入" });
  }
});

// === 登出 API ===
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.json({ success: false, message: "登出失敗" });
    }

    // 設置防緩存頭
    res.set({
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });

    res.json({ success: true, message: "登出成功" });
  });
});

// === 角色專頁路由 ===
app.get("/admin", requireLogin, requireRole("admin"), (req, res) => {
  // 設置防緩存頭
  res.set({
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.sendFile(path.join(__dirname, "public", "admin", "index.html"));
});

app.get("/teacher", requireLogin, requireRole("teacher"), (req, res) => {
  // 設置防緩存頭
  res.set({
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/student", requireLogin, requireRole("student"), (req, res) => {
  // 設置防緩存頭
  res.set({
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// === 預設頁面 ===
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// === 導入房間路由 ===
import { roomRoutes } from "./room";
app.use(roomRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`   👨‍💼 管理員 - 帳號: admin, 密碼: admin123`);
  console.log(`   👨‍🏫 教師 - 帳號: teacher1, 密碼: teacher123`);
  console.log(`   👨‍🎓 學生 - 帳號: student1, 密碼: student123`);
});
