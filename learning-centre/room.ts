import { Router } from "express";
import { requireLogin, requireRole } from "./auth";
import { upload } from "./upload";
import { db } from "./db2";
import { count } from "better-sqlite3-proxy";
import { proxy } from "./proxy";

export let roomRoutes = Router();

// === 房間重定向路由 - 新增 ===
roomRoutes.get("/room/:courseId", requireLogin, (req, res, next) => {
  const courseId = req.params.courseId;
  const userRole = req.session.role;

  console.log(`🔍 訪問房間路由: /room/${courseId}, 用戶角色: ${userRole}`);

  // 檢查請求是否期望 HTML 頁面
  const acceptsHtml =
    req.headers.accept && req.headers.accept.includes("text/html");

  if (acceptsHtml) {
    // 根據用戶角色重定向到正確的頁面
    if (userRole === "teacher") {
      console.log(`🔄 重定向教師到: /teacher-room/${courseId}`);
      return res.redirect(`/teacher-room/${courseId}`);
    } else if (userRole === "student") {
      console.log(`🔄 重定向學生到: /student-room/${courseId}`);
      return res.redirect(`/student-room/${courseId}`);
    } else {
      console.log(`❌ 未知用戶角色: ${userRole}`);
      return res.status(403).json({ success: false, message: "未知用戶角色" });
    }
  }

  // 如果不是 HTML 請求，繼續處理 API 請求
  next();
});

let select_room_by_course = db.prepare(/* sql */ `
    SELECT 
        r.id AS room_id, 
        r.name AS room_name, 
        c.id AS course_id,
        c.name AS course_name,
        c.description AS course_description,
        u.username AS teacher_name
      FROM rooms r 
      JOIN courses c ON c.id = r.course_id
      JOIN users u ON c.teacher_id = u.id
      WHERE r.course_id = :course_id
`);

let select_material_by_room = db.prepare(/* sql */ `
SELECT
  id
, title
, url
, type
, created_at
FROM materials
WHERE room_id = :room_id
ORDER BY created_at DESC
`);

// === 修復房間數據獲取路由 ===
roomRoutes.get("/room/:courseId", requireLogin, (req, res) => {
  const courseId = +req.params.courseId;
  const userId = req.session.userId;
  const userRole = req.session.role;

  console.log(`🔍 獲取房間數據: /room/${courseId}, 用戶角色: ${userRole}`);

  // 檢查權限：老師可以查看自己課程的房間，學生只能查看已選課程的房間
  if (userRole === "student") {
    let enrollment = count(proxy.enrollments, {
      course_id: courseId,
      student_id: userId,
    });
    if (!enrollment) {
      return res
        .status(403)
        .json({ success: false, message: "你未選修此課程，無法進入房間" });
    }
  }

  if (userRole === "teacher") {
    let course = count(proxy.courses, {
      id: courseId,
      teacher_id: userId,
    });
    if (!course) {
      return res
        .status(403)
        .json({ success: false, message: "你無權限查看此課程房間" });
    }
  }

  loadRoomData();

  // console.error("❌ 房間查詢錯誤:", err);

  function loadRoomData() {
    const room = select_room_by_course.get({ course_id: courseId }) as any;

    if (!room) {
      return res.status(404).json({ success: false, message: "房間未找到" });
    }

    // 獲取教材
    let materials = select_material_by_room.all({
      room_id: room.room_id,
    }) as any[];

    // 獲取消息
    let messages: any[];
    try {
      messages = db
        .prepare(
          `SELECT m.id, m.text, m.created_at, u.username, u.role
           FROM messages m 
           LEFT JOIN users u ON u.id = m.user_id
           WHERE m.room_id = ? 
           ORDER BY m.created_at ASC`
        )
        .all(room.room_id) as any[];
    } catch (err) {
      console.error("❌ 查詢消息錯誤:", err);
      messages = [];
    }

    console.log(
      `✅ 成功返回房間數據，課程: ${room.course_name}, 教材數: ${materials.length}, 消息數: ${messages.length}`
    );

    res.json({
      success: true,
      room: room,
      materials: materials,
      messages: messages,
    });
  }
});

// 查房間詳細資訊（學生/老師都可，但有權限檢查）
roomRoutes.get("/api/room/:courseId", requireLogin, (req, res) => {
  const courseId = req.params.courseId;
  const userId = req.session.userId;
  const userRole = req.session.role;

  // 檢查權限：老師可以查看自己課程的房間，學生只能查看已選課程的房間
  if (userRole === "student") {
    try {
      const enrollment = db
        .prepare(
          "SELECT 1 FROM enrollments WHERE course_id = ? AND student_id = ?"
        )
        .get(courseId, userId);
      if (!enrollment) {
        return res
          .status(403)
          .json({ success: false, message: "你未選修此課程，無法進入房間" });
      }
    } catch (err) {
      console.error("❌ 查詢選課錯誤:", err);
      return res.status(500).json({ success: false, message: "伺服器錯誤" });
    }
  } else if (userRole === "teacher") {
    try {
      const course = db
        .prepare("SELECT 1 FROM courses WHERE id = ? AND teacher_id = ?")
        .get(courseId, userId);
      if (!course) {
        return res
          .status(403)
          .json({ success: false, message: "你無權限查看此課程房間" });
      }
    } catch (err) {
      console.error("❌ 查詢課程錯誤:", err);
      return res.status(500).json({ success: false, message: "伺服器錯誤" });
    }
  }

  function loadRoomData() {
    const sqlRoom = `
      SELECT 
        r.id AS room_id, 
        r.name AS room_name, 
        c.id AS course_id,
        c.name AS course_name,
        c.description AS course_description,
        u.username AS teacher_name
      FROM rooms r 
      JOIN courses c ON c.id = r.course_id
      JOIN users u ON c.teacher_id = u.id
      WHERE r.course_id = ?
    `;

    try {
      const room = db.prepare(sqlRoom).get(courseId) as any;
      if (!room) {
        return res.status(404).json({ success: false, message: "房間未找到" });
      }

      // 獲取教材
      let materials: any[] = [];
      try {
        materials = db
          .prepare(
            "SELECT id, title, url, type, created_at FROM materials WHERE room_id = ? ORDER BY created_at DESC"
          )
          .all(room.room_id);
      } catch (e) {
        materials = [];
      }

      // 獲取消息
      let messages: any[] = [];
      try {
        messages = db
          .prepare(
            `SELECT m.id, m.text, m.created_at, u.username, u.role
           FROM messages m 
           LEFT JOIN users u ON u.id = m.user_id
           WHERE m.room_id = ? 
           ORDER BY m.created_at ASC`
          )
          .all(room.room_id);
      } catch (e) {
        messages = [];
      }

      res.json({
        success: true,
        room: room,
        materials: materials,
        messages: messages,
      });
    } catch (err) {
      console.error("❌ 讀取房間數據錯誤:", err);
      return res.status(500).json({ success: false, message: "伺服器錯誤" });
    }
  }
});

// 新增教材
roomRoutes.post("/room/:roomId/material", requireLogin, (req, res) => {
  const { roomId } = req.params;
  const { title, url, type } = req.body;

  try {
    const result = db
      .prepare(
        "INSERT INTO materials (room_id, title, url, type) VALUES (?, ?, ?, ?)"
      )
      .run(roomId, title, url, type);
    res.json({
      success: true,
      message: "教材新增成功",
      id: result.lastInsertRowid,
    });
  } catch (err) {
    console.error("❌ 新增教材錯誤:", err);
    return res.status(500).json({ success: false, message: "新增教材失敗" });
  }
});

// 支持文件上傳的教材上傳接口
roomRoutes.post(
  "/room/:roomId/material-upload",
  requireLogin,
  upload.single("file"),
  (req, res) => {
    const { roomId } = req.params;
    const { title, type } = req.body;
    const file = req.file;

    if (!title || !type) {
      return res
        .status(400)
        .json({ success: false, message: "請提供教材標題和類型" });
    }

    const fileUrl = file ? `/uploads/${file.filename}` : "";

    try {
      const result = db
        .prepare(
          "INSERT INTO materials (room_id, title, url, type) VALUES (?, ?, ?, ?)"
        )
        .run(roomId, title, fileUrl, type);
      res.json({
        success: true,
        message: "教材新增成功",
        id: result.lastInsertRowid,
        material: {
          id: result.lastInsertRowid,
          title: title,
          url: fileUrl,
          type: type,
          created_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error("❌ 新增教材錯誤:", err);
      return res.status(500).json({ success: false, message: "新增教材失敗" });
    }
  }
);

// 删除教材
roomRoutes.delete(
  "/room/:roomId/material/:materialId",
  requireLogin,
  (req, res) => {
    const { roomId, materialId } = req.params;
    const userId = req.session.userId;
    const userRole = req.session.role;

    // 检查权限：只有教师可以删除自己课程的教材
    if (userRole === "teacher") {
      try {
        const course = db
          .prepare(
            `SELECT c.id FROM courses c JOIN rooms r ON c.id = r.course_id WHERE r.id = ? AND c.teacher_id = ?`
          )
          .get(roomId, userId);
        if (!course) {
          return res
            .status(403)
            .json({ success: false, message: "无权限删除此教材" });
        }

        const result = db
          .prepare("DELETE FROM materials WHERE id = ? AND room_id = ?")
          .run(materialId, roomId);
        if (result.changes === 0) {
          return res
            .status(404)
            .json({ success: false, message: "教材未找到" });
        }
        res.json({ success: true, message: "教材删除成功" });
      } catch (err) {
        console.error("❌ 删除教材错误:", err);
        return res
          .status(500)
          .json({ success: false, message: "删除教材失败" });
      }
    } else {
      return res.status(403).json({ success: false, message: "需要教师权限" });
    }
  }
);

// 發送訊息
roomRoutes.post("/room/:roomId/message", requireLogin, (req, res) => {
  const { roomId } = req.params;
  const { text } = req.body;
  const userId = req.session.userId;

  try {
    const result = db
      .prepare("INSERT INTO messages (room_id, user_id, text) VALUES (?, ?, ?)")
      .run(roomId, userId, text);
    res.json({
      success: true,
      message: "訊息發送成功",
      id: result.lastInsertRowid,
    });
  } catch (err) {
    console.error("❌ 發送訊息錯誤:", err);
    return res.status(500).json({ success: false, message: "發送訊息失敗" });
  }
});

// 获取房间学生列表 - 適應現有數據庫結構版本
roomRoutes.get("/room/:roomId/students", requireLogin, (req, res) => {
  const { roomId } = req.params;
  const userId = req.session.userId;
  const userRole = req.session.role;

  console.log(`🔍 [適應版學生API] 房間ID: ${roomId}, 用戶: ${userId}`);

  if (userRole !== "teacher") {
    return res.status(403).json({ success: false, message: "需要教師權限" });
  }

  // 第一步：獲取房間對應的課程ID
  try {
    const roomRow = db
      .prepare("SELECT course_id FROM rooms WHERE id = ?")
      .get(roomId) as any;
    if (!roomRow) {
      console.error("❌ 查詢房間失敗: room not found");
      return res.status(500).json({
        success: false,
        message: "房間查詢失敗",
      });
    }

    const courseId = roomRow.course_id;
    console.log(`✅ 找到房間對應的課程ID: ${courseId}`);

    // 第二步：查詢選修此課程的學生
    const sql = `
      SELECT 
        u.id, 
        u.username,
        u.role
      FROM enrollments e
      JOIN users u ON e.student_id = u.id
      WHERE e.course_id = ? AND u.role = 'student'
      ORDER BY u.username
    `;

    console.log(`📋 執行查詢: ${sql}, 參數: [${courseId}]`);

    let students: any[] = [];
    try {
      students = db.prepare(sql).all(courseId) as any[];
    } catch (err) {
      console.error("❌ 查詢學生失敗:", err);
      return res.status(500).json({
        success: false,
        message: "學生查詢失敗",
        error: (err as Error).message,
      });
    }

    console.log(`✅ 查詢成功，找到 ${students.length} 名學生`);

    const studentsWithDefaults = students.map((student) => ({
      ...student,
      enrolled_courses: 1,
      submitted_assignments: 0,
      last_enrolled: new Date().toISOString(),
    }));

    if (studentsWithDefaults.length === 0) {
      console.log(`ℹ️ 課程 ${courseId} 暫無學生選課`);
    } else {
      console.log(`📋 學生列表:`);
      studentsWithDefaults.forEach((student: any, index: number) => {
        console.log(`   ${index + 1}. ${student.username} (ID: ${student.id})`);
      });
    }

    res.json({
      success: true,
      students: studentsWithDefaults,
      courseId: courseId,
    });
  } catch (err) {
    console.error("❌ 查詢學生流程失敗:", err);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
});

// 获取课程统计信息
roomRoutes.get("/room/:roomId/stats", requireLogin, (req, res) => {
  const { roomId } = req.params;
  const userId = req.session.userId;
  const userRole = req.session.role;

  if (userRole === "teacher") {
    // 获取学生人数
    try {
      const studentResult = db
        .prepare(
          `SELECT COUNT(DISTINCT e.student_id) as student_count
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       JOIN rooms r ON c.id = r.course_id
       WHERE r.id = ? AND c.teacher_id = ?`
        )
        .get(roomId, userId) as any;

      const materialResult = db
        .prepare(
          "SELECT COUNT(*) as material_count FROM materials WHERE room_id = ?"
        )
        .get(roomId) as any;

      const homeworkResult = db
        .prepare(
          "SELECT COUNT(*) as homework_count FROM homework WHERE room_id = ?"
        )
        .get(roomId) as any;

      res.json({
        success: true,
        stats: {
          studentCount: studentResult?.student_count || 0,
          materialCount: materialResult?.material_count || 0,
          homeworkCount: homeworkResult?.homework_count || 0,
          recordings: 0,
        },
      });
    } catch (err) {
      console.error("❌ 查詢統計錯誤:", err);
      return res.status(500).json({ success: false, message: "伺服器錯誤" });
    }
  } else {
    return res.status(403).json({ success: false, message: "需要教師權限" });
  }
});

// 创建作业
roomRoutes.post(
  "/room/:roomId/homework",
  requireLogin,
  requireRole("teacher"),
  (req, res) => {
    const { roomId } = req.params;
    const { title, description, deadline } = req.body;

    if (!title || !deadline) {
      return res
        .status(400)
        .json({ success: false, message: "請提供作業標題和截止日期" });
    }

    try {
      const result = db
        .prepare(
          "INSERT INTO homework (room_id, title, description, deadline) VALUES (?, ?, ?, ?)"
        )
        .run(roomId, title, description, deadline);
      res.json({
        success: true,
        message: "作業創建成功",
        id: result.lastInsertRowid,
      });
    } catch (err) {
      console.error("❌ 創建作業錯誤:", err);
      return res.status(500).json({ success: false, message: "創建作業失敗" });
    }
  }
);

// 获取作业列表
roomRoutes.get("/room/:roomId/homework", requireLogin, (req, res) => {
  const { roomId } = req.params;

  try {
    const rows = db
      .prepare(
        "SELECT id, title, description, deadline, created_at FROM homework WHERE room_id = ? ORDER BY created_at DESC"
      )
      .all(roomId) as any[];
    res.json({ success: true, homework: rows });
  } catch (err) {
    console.error("❌ 查詢作業列表錯誤:", err);
    return res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
});

// 学生提交作业
roomRoutes.post(
  "/room/:roomId/homework/:homeworkId/submit",
  requireLogin,
  requireRole("student"),
  upload.single("file"),
  (req, res) => {
    const { roomId, homeworkId } = req.params;
    const studentId = req.session.userId;
    const file = req.file;

    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: "請選擇要提交的文件" });
    }

    const fileUrl = `/uploads/${file.filename}`;

    try {
      db.prepare(
        "INSERT OR REPLACE INTO homework_submissions (homework_id, student_id, file_url) VALUES (?, ?, ?)"
      ).run(homeworkId, studentId, fileUrl);
      res.json({ success: true, message: "作業提交成功" });
    } catch (err) {
      console.error("❌ 提交作業錯誤:", err);
      return res.status(500).json({ success: false, message: "提交作業失敗" });
    }
  }
);

// 获取作业提交情况
roomRoutes.get(
  "/room/:roomId/homework/:homeworkId/submissions",
  requireLogin,
  requireRole("teacher"),
  (req, res) => {
    const { roomId, homeworkId } = req.params;

    try {
      const rows = db
        .prepare(
          `SELECT hs.id, hs.student_id, u.username, hs.file_url, hs.submitted_at, hs.grade, hs.feedback
     FROM homework_submissions hs
     JOIN users u ON hs.student_id = u.id
     WHERE hs.homework_id = ?
     ORDER BY hs.submitted_at DESC`
        )
        .all(homeworkId) as any[];
      res.json({ success: true, submissions: rows });
    } catch (err) {
      console.error("❌ 查詢作業提交錯誤:", err);
      return res.status(500).json({ success: false, message: "伺服器錯誤" });
    }
  }
);

// 批改作业
roomRoutes.put(
  "/room/:roomId/homework/:homeworkId/submission/:submissionId",
  requireLogin,
  requireRole("teacher"),
  (req, res) => {
    const { submissionId } = req.params;
    const { grade, feedback } = req.body;

    if (grade === undefined) {
      return res.status(400).json({ success: false, message: "請提供成績" });
    }

    try {
      const result = db
        .prepare(
          "UPDATE homework_submissions SET grade = ?, feedback = ? WHERE id = ?"
        )
        .run(grade, feedback, submissionId);
      if (result.changes === 0) {
        return res
          .status(404)
          .json({ success: false, message: "作業提交未找到" });
      }
      res.json({ success: true, message: "作業批改成功" });
    } catch (err) {
      console.error("❌ 批改作業錯誤:", err);
      return res.status(500).json({ success: false, message: "批改作業失敗" });
    }
  }
);

// === 臨時修復：簡單學生API ===
roomRoutes.get("/room/:roomId/students-simple", requireLogin, (req, res) => {
  const { roomId } = req.params;
  const userId = req.session.userId;
  const userRole = req.session.role;

  console.log(`🔍 [簡單學生API] 房間ID: ${roomId}, 用戶: ${userId}`);

  if (userRole !== "teacher") {
    return res.status(403).json({ success: false, message: "需要教師權限" });
  }

  // 最簡單的查詢
  try {
    const roomRow = db
      .prepare("SELECT course_id FROM rooms WHERE id = ?")
      .get(roomId) as any;
    if (!roomRow) {
      return res.status(500).json({ success: false, message: "房間查詢失敗" });
    }

    const courseId = roomRow.course_id;

    try {
      const students = db
        .prepare(
          `SELECT u.id, u.username, u.role, e.enrolled_at as last_enrolled
         FROM enrollments e 
         JOIN users u ON e.student_id = u.id 
         WHERE e.course_id = ? AND u.role = 'student' 
         ORDER BY u.username`
        )
        .all(courseId) as any[];

      const studentsWithSimpleStats = students.map((student) => ({
        ...student,
        enrolled_courses: 1,
        submitted_assignments: 0,
      }));

      res.json({ success: true, students: studentsWithSimpleStats });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "學生查詢失敗",
        error: (err as Error).message,
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: "房間查詢失敗" });
  }
});
