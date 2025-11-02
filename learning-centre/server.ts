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
import mammoth from "mammoth";
const PDF2JSON = require("pdf2json");

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

// === 驗證資料庫初始化完成 ===
try {
  console.log("\n🔍 驗證資料庫初始化狀態:");

  const userCount = db
    .prepare("SELECT COUNT(*) as count FROM users")
    .get() as any;
  console.log(`   👥 用戶數: ${userCount.count}`);

  const courseCount = db
    .prepare("SELECT COUNT(*) as count FROM courses")
    .get() as any;
  console.log(`   � 課程數: ${courseCount.count}`);

  const enrollmentCount = db
    .prepare("SELECT COUNT(*) as count FROM enrollments")
    .get() as any;
  console.log(`   🎓 選課記錄數: ${enrollmentCount.count}`);

  const roomCount = db
    .prepare("SELECT COUNT(*) as count FROM rooms")
    .get() as any;
  console.log(`   🏠 房間數: ${roomCount.count}`);

  console.log("✅ 資料庫已初始化完成\n");
} catch (err) {
  console.error("❌ 驗證資料庫狀態失敗:", err);
}

// === 文件上傳設定 ===
// file upload is configured in ./upload.ts

// === 身份驗證中間件 ===
import { requireLogin, requireRole } from "./auth";

// === 登入 API ===
let select_user_for_login = db.prepare<
  { username: string; password: string },
  { id: number; role: string }
>(
  /* sql */
  `SELECT id, role
   FROM users
   WHERE username = :username AND password = :password`
);
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ success: false, message: "請輸入帳號及密碼" });
  }

  try {
    const row = select_user_for_login.get({ username, password });
    if (!row) {
      return res.json({ success: false, message: "帳號或密碼錯誤" });
    }

    // Set session and respond on successful login
    req.session.userId = row.id;
    req.session.username = username;
    req.session.role = row.role;
    return res.json({
      success: true,
      message: "登入成功",
      role: row.role,
      user: { id: row.id, username: username, role: row.role },
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

// === 用戶管理 API ===

// 新增用戶
app.post("/users", requireLogin, requireRole("admin"), (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({
      success: false,
      message: "帳號、密碼和角色為必填項",
    });
  }

  // 驗證角色
  const validRoles = ["student", "teacher", "admin"];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      message: "無效的角色",
    });
  }

  try {
    // 檢查帳號是否已存在
    const existingUser = db
      .prepare("SELECT id FROM users WHERE username = ?")
      .get(username) as any;

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "此帳號已存在",
      });
    }

    // 插入新用戶
    const result = db
      .prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)")
      .run(username, password, role);

    console.log(`✅ 新用戶已建立: ${username}, 角色: ${role}`);

    res.json({
      success: true,
      message: "用戶新增成功",
      user: {
        id: result.lastInsertRowid,
        username,
        role,
      },
    });
  } catch (err) {
    console.error("❌ 新增用戶錯誤:", err);
    res.status(500).json({
      success: false,
      message: "伺服器錯誤",
    });
  }
});

// 刪除用戶
app.delete("/users/:id", requireLogin, requireRole("admin"), (req, res) => {
  const userId = parseInt(req.params.id);

  if (isNaN(userId) || userId <= 0) {
    return res.status(400).json({
      success: false,
      message: "無效的用戶ID",
    });
  }

  try {
    // 防止刪除當前登入的用戶
    if (userId === req.session.userId) {
      return res.status(400).json({
        success: false,
        message: "不能刪除自己",
      });
    }

    // 檢查用戶是否存在
    const user = db
      .prepare("SELECT id, username FROM users WHERE id = ?")
      .get(userId) as any;

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "用戶不存在",
      });
    }

    // 刪除用戶
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);

    console.log(`✅ 用戶已刪除: ${user.username}`);

    res.json({
      success: true,
      message: "用戶刪除成功",
    });
  } catch (err) {
    console.error("❌ 刪除用戶錯誤:", err);
    res.status(500).json({
      success: false,
      message: "伺服器錯誤",
    });
  }
});

// 編輯用戶
app.put("/users/:id", requireLogin, requireRole("admin"), (req, res) => {
  const userId = parseInt(req.params.id);
  const { username, password, role } = req.body;

  if (isNaN(userId) || userId <= 0) {
    return res.status(400).json({
      success: false,
      message: "無效的用戶ID",
    });
  }

  if (!username || !role) {
    return res.status(400).json({
      success: false,
      message: "帳號和角色為必填項",
    });
  }

  const validRoles = ["student", "teacher", "admin"];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      message: "無效的角色",
    });
  }

  try {
    // 檢查用戶是否存在
    const user = db
      .prepare("SELECT id FROM users WHERE id = ?")
      .get(userId) as any;

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "用戶不存在",
      });
    }

    // 檢查新帳號是否與其他用戶重複
    const existingUser = db
      .prepare("SELECT id FROM users WHERE username = ? AND id != ?")
      .get(username, userId) as any;

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "此帳號已被其他用戶使用",
      });
    }

    // 更新用戶
    if (password) {
      db.prepare(
        "UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?"
      ).run(username, password, role, userId);
    } else {
      db.prepare("UPDATE users SET username = ?, role = ? WHERE id = ?").run(
        username,
        role,
        userId
      );
    }

    console.log(
      `✅ 用戶已更新: ID ${userId}, 新帳號: ${username}, 角色: ${role}`
    );

    res.json({
      success: true,
      message: "用戶更新成功",
    });
  } catch (err) {
    console.error("❌ 編輯用戶錯誤:", err);
    res.status(500).json({
      success: false,
      message: "伺服器錯誤",
    });
  }
});

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

// === 文件上傳 API ===
import { upload } from "./upload";

// 作業上傳端點
app.post(
  "/upload-homework",
  requireLogin,
  requireRole("student"),
  upload.single("homework"),
  async (req, res) => {
    console.log(`📁 學生 ${req.session.userId} 上傳作業文件`);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "請選擇要上傳的文件",
      });
    }

    try {
      const fileInfo = {
        originalName: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        path: `/uploads/${req.file.filename}`,
        uploadTime: new Date().toISOString(),
        studentId: req.session.userId,
      };

      // 嘗試提取文檔內容
      let extractedContent = null;

      if (
        req.file.mimetype ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        req.file.originalname.endsWith(".docx")
      ) {
        try {
          console.log(`📄 正在提取 DOCX 文件內容: ${req.file.originalname}`);
          const result = await mammoth.extractRawText({ path: req.file.path });
          extractedContent = result.value;
          console.log(`✅ 成功提取內容，長度: ${extractedContent.length} 字符`);
        } catch (extractError) {
          console.log(
            `⚠️ 提取 DOCX 內容失敗: ${
              extractError instanceof Error
                ? extractError.message
                : String(extractError)
            }`
          );
        }
      } else if (
        req.file.mimetype === "application/pdf" ||
        req.file.originalname.endsWith(".pdf")
      ) {
        try {
          console.log(`📄 正在提取 PDF 文件內容: ${req.file.originalname}`);
          const dataBuffer = fs.readFileSync(req.file.path);
          const pdfParser = new PDF2JSON();

          // 使用Promise包裝非同步操作
          extractedContent = await new Promise<string>((resolve, reject) => {
            pdfParser.on("pdfParser_dataError", (errData: any) => {
              console.log(`⚠️ PDF 解析錯誤: ${errData}`);
              reject(new Error(errData));
            });

            pdfParser.on("pdfParser_dataReady", () => {
              const pdfData = pdfParser.getRawTextContent();
              console.log(`✅ 成功提取 PDF 內容，長度: ${pdfData.length} 字符`);
              console.log(`📄 PDF 內容前200字符: ${pdfData.substring(0, 200)}`);
              resolve(pdfData || "");
            });

            if (req.file) {
              pdfParser.loadPDF(req.file.path);
            }

            // 設定超時防止永久等待
            setTimeout(() => {
              reject(new Error("PDF 提取超時"));
            }, 5000);
          });
        } catch (extractError) {
          console.log(
            `⚠️ 提取 PDF 內容失敗: ${
              extractError instanceof Error
                ? extractError.message
                : String(extractError)
            }`
          );
          extractedContent = null;
        }
      }

      res.json({
        success: true,
        file: fileInfo,
        extractedContent: extractedContent,
        message: "作業文件上傳成功",
      });
    } catch (error) {
      console.error("❌ 上傳作業錯誤:", error);
      res.status(500).json({
        success: false,
        message: "文件上傳失敗",
      });
    }
  }
);

// === AI 功能 API ===

// 自動生成試題 API
app.post(
  "/api/generate-quiz",
  requireLogin,
  requireRole("student"),
  (req, res) => {
    const { homeworkContent, questionCount = 3 } = req.body;

    console.log(`🧠 學生 ${req.session.userId} 請求生成試題`);

    if (!homeworkContent) {
      return res.status(400).json({
        success: false,
        message: "需要提供作業內容",
      });
    }

    try {
      // 簡單的試題生成邏輯（模擬AI生成）
      const questions = generateQuestions(homeworkContent, questionCount);

      res.json({
        success: true,
        questions: questions,
        message: "試題生成成功",
      });
    } catch (error) {
      console.error("❌ 生成試題錯誤:", error);
      res.status(500).json({
        success: false,
        message: "試題生成失敗",
      });
    }
  }
);

// AI 學習助手 API
app.post(
  "/api/ai-assistant",
  requireLogin,
  requireRole("student"),
  (req, res) => {
    const { question, context } = req.body;

    console.log(`🤖 學生 ${req.session.userId} 詢問AI助手: ${question}`);

    if (!question) {
      return res.status(400).json({
        success: false,
        message: "請提供問題",
      });
    }

    try {
      // 簡單的AI回答生成（模擬AI回答）
      const answer = generateAIResponse(question, context);

      res.json({
        success: true,
        answer: answer,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ AI助手錯誤:", error);
      res.status(500).json({
        success: false,
        message: "AI助手暫時無法回答",
      });
    }
  }
);

// Zoom API 整合
app.post(
  "/api/create-zoom-meeting",
  requireLogin,
  requireRole("teacher"),
  async (req, res) => {
    const { title, startTime, duration = 60, description, courseId } = req.body;

    console.log(
      `📹 教師 ${req.session.userId} 為課程 ${courseId} 創建Zoom會議: ${title}`
    );

    if (!title || !startTime) {
      return res.status(400).json({
        success: false,
        message: "需要提供會議標題和開始時間",
      });
    }

    try {
      // 模擬創建Zoom會議（實際需要Zoom API）
      const meeting = {
        id: Date.now().toString(),
        title,
        startTime,
        duration,
        description,
        joinUrl: `https://zoom.us/j/${Date.now()}`,
        meetingId: Date.now().toString(),
        password: Math.random().toString(36).substring(2, 8),
        teacherId: req.session.userId,
        courseId: courseId,
        created: new Date().toISOString(),
      };

      // 保存會議資訊到資料庫（簡化版）
      try {
        const result = db
          .prepare(
            `
        INSERT INTO zoom_meetings (meeting_id, title, start_time, duration, join_url, password, teacher_id, course_id, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
          )
          .run(
            meeting.meetingId,
            title,
            startTime,
            duration,
            meeting.joinUrl,
            meeting.password,
            req.session.userId,
            courseId,
            description
          );

        meeting.id = result.lastInsertRowid.toString();
      } catch (dbError) {
        console.log("📝 Zoom會議表可能不存在，創建中...");
        // 如果表不存在，先創建表
        db.exec(`
        CREATE TABLE IF NOT EXISTS zoom_meetings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          meeting_id TEXT UNIQUE,
          title TEXT NOT NULL,
          start_time TEXT NOT NULL,
          duration INTEGER DEFAULT 60,
          join_url TEXT,
          password TEXT,
          teacher_id INTEGER,
          course_id INTEGER,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

        const result = db
          .prepare(
            `
        INSERT INTO zoom_meetings (meeting_id, title, start_time, duration, join_url, password, teacher_id, course_id, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
          )
          .run(
            meeting.meetingId,
            title,
            startTime,
            duration,
            meeting.joinUrl,
            meeting.password,
            req.session.userId,
            courseId,
            description
          );

        meeting.id = result.lastInsertRowid.toString();
      }

      res.json({
        success: true,
        meeting: meeting,
        message: "Zoom會議創建成功",
      });
    } catch (error) {
      console.error("❌ 創建Zoom會議錯誤:", error);
      res.status(500).json({
        success: false,
        message: "創建會議失敗",
      });
    }
  }
);

// 獲取教師的Zoom會議列表
app.get(
  "/api/zoom-meetings",
  requireLogin,
  requireRole("teacher"),
  (req, res) => {
    try {
      const meetings = db
        .prepare(
          `
      SELECT * FROM zoom_meetings 
      WHERE teacher_id = ? 
      ORDER BY start_time DESC
    `
        )
        .all(req.session.userId);

      res.json({
        success: true,
        meetings: meetings,
      });
    } catch (error) {
      // 如果表不存在，返回空陣列
      res.json({
        success: true,
        meetings: [],
      });
    }
  }
);

// 獲取學生可參加的會議
app.get(
  "/api/student-meetings",
  requireLogin,
  requireRole("student"),
  (req, res) => {
    try {
      // 獲取學生選修課程的會議（按course_id正確過濾）
      const meetings = db
        .prepare(
          `
      SELECT zm.*, u.username as teacher_name, c.name as course_name
      FROM zoom_meetings zm
      JOIN users u ON zm.teacher_id = u.id
      JOIN courses c ON c.id = zm.course_id
      JOIN enrollments e ON e.course_id = c.id
      WHERE e.student_id = ?
      AND datetime(zm.start_time) >= datetime('now', '-2 hours')
      ORDER BY zm.start_time ASC
    `
        )
        .all(req.session.userId);

      console.log(
        `📹 學生 ${req.session.userId} 查詢會議，找到 ${meetings.length} 個`
      );

      res.json({
        success: true,
        meetings: meetings,
      });
    } catch (error) {
      console.log(
        `⚠️ 查詢會議錯誤: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      res.json({
        success: true,
        meetings: [],
      });
    }
  }
);

// === 輔助函數 ===

function generateQuestions(content: string, count: number) {
  console.log("🔍 開始從內容中提取問題...");
  console.log("📄 內容長度:", content.length);

  // 首先嘗試從內容中提取實際的問題
  const extractedQuestions = extractQuestionsFromContent(content);

  if (extractedQuestions.length > 0) {
    console.log(`✅ 成功從內容中提取到 ${extractedQuestions.length} 個問題`);

    // 隨機打亂問題順序
    const shuffledQuestions = shuffleArray(extractedQuestions);

    // 返回指定數量的問題
    const selectedQuestions = shuffledQuestions.slice(
      0,
      Math.min(count, shuffledQuestions.length)
    );
    console.log(`🎲 隨機選擇了 ${selectedQuestions.length} 個問題`);

    return selectedQuestions;
  }

  console.log("ℹ️ 內容中沒有找到問題，返回空陣列");
  return [];
}

// 隨機打亂陣列的函數（Fisher-Yates 算法）
function shuffleArray(array: any[]): any[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 從文件內容中提取實際問題的函數，支援子問題（如3a, 3b）
function extractQuestionsFromContent(content: string) {
  const questions: any[] = [];
  let questionId = 1;

  // 檢查是否是檔案信息格式，如果是則跳過
  if (content.includes("檔案名稱：") || content.includes("檔案類型：")) {
    console.log("⚠️ 檢測到檔案信息格式，無法提取問題");
    return [];
  }

  // 首先嘗試提取帶子題的問題（例如：3) 主題 a) 選項1 b) 選項2）
  const groupedQuestions = extractGroupedQuestions(content);
  if (groupedQuestions.length > 0) {
    console.log(`✅ 成功提取到 ${groupedQuestions.length} 個帶子題的問題組`);
    return groupedQuestions;
  }

  // 然後嘗試提取一般格式的問題
  const questionPatterns = [
    // 匹配 "1. 問題內容？" 或 "1、問題內容？" 或 "一、問題內容？"
    /(?:^|\n)[\s]*(?:\d+[.、]|[一二三四五六七八九十]+[、.])\s*([^?\n]*\?[^?\n]*)/gm,
    // 匹配 "問題：內容？" 或 "Question: 內容？"
    /(?:^|\n)[\s]*(?:問題|題目|Question|Q)[\s]*[:：]\s*([^?\n]*\?[^?\n]*)/gim,
    // 匹配獨立的問句（以？結尾的句子）
    /(?:^|\n)[\s]*([^?\n。！]{10,}[？?])/gm,
    // 匹配 "(1) 問題內容？" 格式
    /(?:^|\n)[\s]*\([^\)]+\)\s*([^?\n]*\?[^?\n]*)/gm,
  ];

  console.log("🔍 使用多種模式搜索問題...");

  questionPatterns.forEach((pattern, patternIndex) => {
    console.log(`  📌 模式 ${patternIndex + 1}: 搜索中...`);
    const matches = content.matchAll(pattern);
    let patternMatchCount = 0;

    for (const match of matches) {
      const questionText = match[1]?.trim();
      if (
        questionText &&
        questionText.length > 5 &&
        questionText.length < 300 // 增加長度限制，以容納更長的問題
      ) {
        // 清理問題文本
        const cleanedQuestion = questionText
          .replace(/^\d+[.、]\s*/, "") // 移除開頭的編號
          .replace(/^[一二三四五六七八九十]+[、.]\s*/, "") // 移除中文編號
          .replace(/^(?:問題|題目|Question|Q)[\s]*[:：]\s*/i, "") // 移除問題標籤
          .trim();

        if (cleanedQuestion.length > 5) {
          // 檢測是否為多選題
          const mcOptions = extractMultipleChoiceOptions(
            content,
            cleanedQuestion
          );

          questions.push({
            id: questionId++,
            type: mcOptions.length > 0 ? "multiple-choice" : "short-answer",
            question: cleanedQuestion,
            options: mcOptions,
            explanation: "這是從您的作業文件中提取的問題",
          });

          patternMatchCount++;
          console.log(
            `    📝 找到問題: ${cleanedQuestion.substring(0, 40)}...`
          );
        }
      }
    }
    console.log(
      `  ✅ 模式 ${patternIndex + 1} 找到 ${patternMatchCount} 個問題`
    );
  });

  console.log(`📊 提取前去重：找到 ${questions.length} 個問題候選`);

  // 去重（基於問題內容的相似性）
  const uniqueQuestions: any[] = [];
  for (const question of questions) {
    const isDuplicate = uniqueQuestions.some((existing: any) => {
      const similarity = calculateSimilarity(
        existing.question,
        question.question
      );
      return similarity > 0.8; // 80% 相似度視為重複
    });

    if (!isDuplicate) {
      uniqueQuestions.push(question);
    }
  }

  console.log(`✅ 最終提取到 ${uniqueQuestions.length} 個唯一問題`);
  uniqueQuestions.forEach((q, idx) => {
    console.log(`  ${idx + 1}. ${q.question.substring(0, 50)}...`);
  });

  return uniqueQuestions;
}

// 提取帶子題的問題組（例如：3) 主題 ... a) 選項 b) 選項）
function extractGroupedQuestions(content: string): any[] {
  const groupedQuestions: any[] = [];
  let questionId = 1;

  // 匹配主題和子題的模式
  // 例如：3) 這是主題
  //      a) 第一個選項
  //      b) 第二個選項
  const mainQuestionPattern =
    /(?:^|\n)[\s]*(\d+)\)\s*([^\n]+?)(?=\n\s*[a-z]\)|$)/gm;

  let match;
  while ((match = mainQuestionPattern.exec(content)) !== null) {
    const mainNum = match[1];
    const mainQuestion = match[2].trim();

    // 在主題後查找子題
    const startPos = match.index + match[0].length;
    const nextMainQuestionPattern = new RegExp(
      `\n\\s*${parseInt(mainNum) + 1}\\)`
    );
    const nextMainMatch = nextMainQuestionPattern.exec(
      content.substring(startPos)
    );
    const endPos = nextMainMatch
      ? startPos + nextMainMatch.index
      : content.length;

    const subQuestionText = content.substring(startPos, endPos);

    // 提取子題
    const subQuestions: any[] = [];
    const subPattern = /\n\s*([a-z])\)\s*([^\n]+)/g;

    let subMatch;
    while ((subMatch = subPattern.exec(subQuestionText)) !== null) {
      subQuestions.push({
        letter: subMatch[1],
        text: subMatch[2].trim(),
      });
    }

    // 如果找到子題，則創建分組問題
    if (subQuestions.length > 0) {
      groupedQuestions.push({
        id: questionId++,
        type: "multiple-choice",
        mainQuestion: mainQuestion,
        subQuestions: subQuestions,
        question: mainQuestion, // 保持向後相容性
        options: subQuestions.map((sq) => sq.letter + ") " + sq.text),
        explanation: "這是從您的作業文件中提取的分組問題",
      });

      console.log(
        `📝 提取到分組問題 ${questionId - 1}: ${mainQuestion} (包含 ${
          subQuestions.length
        } 個子題)`
      );
    }
  }

  return groupedQuestions;
}

// 提取多選題選項 (a, b, c, d 或 A, B, C, D)
function extractMultipleChoiceOptions(
  content: string,
  questionText: string
): string[] {
  // 在問題文本後查找選項
  const questionIndex = content.indexOf(questionText);
  if (questionIndex === -1) return [];

  // 搜索範圍：問題後的100-500個字符
  const searchStart = questionIndex + questionText.length;
  const searchEnd = Math.min(searchStart + 500, content.length);
  const searchText = content.substring(searchStart, searchEnd);

  // 尋找 a), b), c), d) 或 A), B), C), D) 格式
  const optionPattern = /\n\s*([a-dA-D])\)\s*([^\n]+)/g;
  const options: string[] = [];

  let match;
  while ((match = optionPattern.exec(searchText)) !== null) {
    const letter = match[1];
    const optionText = match[2].trim();

    if (optionText.length > 2 && optionText.length < 200) {
      options.push(letter + ") " + optionText);
    }
  }

  // 只有找到4個選項才認為是多選題
  return options.length === 4 ? options : [];
}

// 簡單的文本相似度計算
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);

  const intersection = words1.filter((word) => words2.includes(word));
  const union = [...new Set([...words1, ...words2])];

  return intersection.length / union.length;
}

// 提取內容關鍵詞的輔助函數
function extractKeywords(content: string): string[] {
  // 檢查是否是檔案信息格式
  if (content.includes("檔案名稱：") || content.includes("檔案類型：")) {
    return extractFileKeywords(content);
  }

  // 一般文字內容的關鍵詞提取
  const commonWords = [
    "的",
    "是",
    "了",
    "在",
    "有",
    "和",
    "與",
    "及",
    "或",
    "但",
    "如果",
    "因為",
    "所以",
    "這",
    "那",
    "我",
    "你",
    "他",
    "她",
    "它",
    "檔案",
    "名稱",
    "類型",
    "大小",
    "KB",
    "MB",
    "已",
    "上傳",
  ];

  // 移除標點符號並分割單詞
  const words = content
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !commonWords.includes(word))
    .slice(0, 10); // 取前10個關鍵詞

  // 如果沒有找到關鍵詞，使用預設詞彙
  if (words.length === 0) {
    return ["學習重點", "知識概念", "核心理論", "實踐應用", "分析方法"];
  }

  return words;
}

// 從檔案信息中提取關鍵詞
function extractFileKeywords(fileInfo: string): string[] {
  const keywords = [];

  // 提取檔案名稱中的關鍵詞
  const nameMatch = fileInfo.match(/檔案名稱：(.+)/);
  if (nameMatch) {
    const fileName = nameMatch[1].trim();

    // 根據檔案擴展名確定學科領域
    if (fileName.match(/\.(pdf|doc|docx)$/i)) {
      keywords.push("文件分析", "內容理解", "重點摘要");
    } else if (fileName.match(/\.(jpg|jpeg|png|gif|bmp)$/i)) {
      keywords.push("圖像識別", "視覺分析", "觀察能力");
    } else if (fileName.match(/\.(mp3|wav|mp4|avi)$/i)) {
      keywords.push("多媒體理解", "內容分析", "感知能力");
    } else if (fileName.match(/\.(xls|xlsx|csv)$/i)) {
      keywords.push("數據分析", "統計概念", "表格理解");
    } else if (fileName.match(/\.(ppt|pptx)$/i)) {
      keywords.push("簡報技巧", "內容組織", "表達能力");
    } else if (fileName.match(/\.(txt|md)$/i)) {
      keywords.push("文字處理", "內容分析", "理解能力");
    }

    // 從檔案名稱中提取學科相關詞彙
    if (fileName.includes("數學") || fileName.includes("math")) {
      keywords.push("數學概念", "計算方法", "邏輯思維");
    } else if (fileName.includes("科學") || fileName.includes("science")) {
      keywords.push("科學原理", "實驗方法", "觀察分析");
    } else if (fileName.includes("歷史") || fileName.includes("history")) {
      keywords.push("歷史事件", "時間概念", "因果關係");
    } else if (fileName.includes("語文") || fileName.includes("language")) {
      keywords.push("語言理解", "文字表達", "溝通技巧");
    } else if (fileName.includes("英文") || fileName.includes("english")) {
      keywords.push("英語學習", "語法結構", "詞彙運用");
    }
  }

  // 如果沒有提取到特定關鍵詞，使用通用關鍵詞
  if (keywords.length === 0) {
    keywords.push("檔案分析", "學習內容", "知識理解", "學習方法", "作業要求");
  }

  return keywords.slice(0, 5); // 限制關鍵詞數量
}

function generateAIResponse(question: string, context?: string) {
  // 改進的AI回答生成邏輯
  const lowerQuestion = question.toLowerCase();

  // 分析問題類型和關鍵詞
  if (
    lowerQuestion.includes("你好") ||
    lowerQuestion.includes("您好") ||
    lowerQuestion.includes("hello")
  ) {
    return "您好！我是您的AI學習助手，很高興為您服務！🤖 請隨時告訴我您的學習問題，我會盡力幫助您。";
  }

  if (lowerQuestion.includes("作業") || lowerQuestion.includes("homework")) {
    return `關於作業問題，我建議您可以這樣思考：

📝 **作業分析步驟：**
1. 仔細閱讀題目要求
2. 分析相關概念和理論
3. 組織答案結構
4. 檢查邏輯完整性

💡 **提示：** 如果您能提供具體的作業內容，我可以給出更詳細的指導建議。`;
  }

  if (
    lowerQuestion.includes("概念") ||
    lowerQuestion.includes("理論") ||
    lowerQuestion.includes("定義")
  ) {
    return `這是一個很好的概念性問題！🧠

**學習概念的有效方法：**
• 理解定義的核心要點
• 找出概念之間的聯繫
• 結合實際例子來理解
• 嘗試用自己的話解釋

如果您能告訴我具體是哪個概念，我可以提供更針對性的説明。`;
  }

  if (
    lowerQuestion.includes("如何") ||
    lowerQuestion.includes("怎麼") ||
    lowerQuestion.includes("怎樣")
  ) {
    return `您問的是方法類問題，我來為您提供系統性的建議：

🎯 **問題解決步驟：**
1. 明確目標和要求
2. 分析現有條件
3. 制定解決方案
4. 執行並驗證結果

請告訴我您具體想了解什麼方法，我可以給您更詳細的指導。`;
  }

  if (
    lowerQuestion.includes("為什麼") ||
    lowerQuestion.includes("為何") ||
    lowerQuestion.includes("原因")
  ) {
    return `您提出了一個探究原因的問題，這很好！🔍

**分析原因的思路：**
• 從現象看本質
• 分析前因後果
• 考慮多個影響因素
• 尋找關鍵節點

如果您能提供更多背景信息，我可以幫您進行更深入的分析。`;
  }

  // 預設回答
  const contextInfo = context
    ? `\n\n📋 **相關內容：** ${context.substring(0, 100)}${
        context.length > 100 ? "..." : ""
      }`
    : "";

  return `謝謝您的問題！我理解您想了解："${question}"

🤖 **我的建議：**
• 可以從多個角度來分析這個問題
• 建議結合理論知識和實際應用
• 如果有具體例子會更容易理解

💬 **互動提示：** 您可以提供更多詳細信息，這樣我就能給出更精確的回答。比如：
- 這個問題的具體背景
- 您目前的理解程度
- 遇到的具體困難${contextInfo}`;
}

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
