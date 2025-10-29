import { NextFunction, Request, Response } from "express";

// 檢查是否已登入
export function requireLogin(req: Request, res: Response, next: NextFunction) {
  if (req.session && req.session.userId) {
    return next();
  } else {
    return res.status(401).json({ 
      success: false, 
      message: "請先登入系統" 
    });
  }
}

// 檢查是否為特定角色
export function requireRole(role: string) {
  return function(req: Request, res: Response, next: NextFunction) {
    if (req.session && req.session.role === role) {
      return next();
    } else {
      return res.status(403).json({ 
        success: false, 
        message: `權限不足，需要 ${role} 角色` 
      });
    }
  };
}