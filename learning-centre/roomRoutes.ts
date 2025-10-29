import { Router } from "express";
import { requireLogin, requireRole } from "./auth";
import { db } from "./db2";

const router = Router();

// 获取房间信息
router.get("/room/:roomId", requireLogin, (req, res) => {
  const roomId = req.params.roomId;

  try {
    const room = db
      .prepare(
        `
      SELECT r.*, c.name as course_name, u.username as teacher_name
      FROM rooms r 
      JOIN courses c ON r.course_id = c.id
      JOIN users u ON c.teacher_id = u.id
      WHERE r.id = ?
    `
      )
      .get(roomId) as any;

    if (!room) {
      return res.status(404).json({ success: false, message: "房间未找到" });
    }

    return res.json({ success: true, room });
  } catch (err) {
    console.error("❌ 获取房间信息错误:", err);
    return res.status(500).json({ success: false, message: "服务器错误" });
  }
});

// 获取房间的所有消息
router.get("/room/:roomId/messages", requireLogin, (req, res) => {
  const roomId = req.params.roomId;

  try {
    const messages = db
      .prepare(
        `
      SELECT m.*, u.username 
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.room_id = ?
      ORDER BY m.created_at DESC
      LIMIT 100
    `
      )
      .all(roomId) as any[];

    return res.json({ success: true, messages });
  } catch (err) {
    console.error("❌ 获取房间消息错误:", err);
    return res.status(500).json({ success: false, message: "服务器错误" });
  }
});

// 发送消息到房间
router.post("/room/:roomId/messages", requireLogin, (req, res) => {
  const roomId = req.params.roomId;
  const userId = req.session.userId;
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ success: false, message: "消息不能为空" });
  }

  try {
    const result = db
      .prepare(
        `
      INSERT INTO messages (room_id, user_id, text) 
      VALUES (?, ?, ?)
    `
      )
      .run(roomId, userId, text) as any;

    return res.json({
      success: true,
      message: {
        id: result.lastInsertRowid,
        room_id: roomId,
        user_id: userId,
        text,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("❌ 发送消息错误:", err);
    return res.status(500).json({ success: false, message: "服务器错误" });
  }
});

export default router;
