# 智能學習中心系統

一個基於 Node.js + TypeScript + SQLite 的學習管理系統。

## 功能特點

- ✅ 用戶身份驗證（學生、教師、管理員）
- ✅ 課程管理
- ✅ 學生選課/退課
- ✅ 房間聊天系統
- ✅ 檔案上傳
- ✅ 防回退快取機制

## 快速開始

### 安裝依賴

```bash
npm install
```

### 建置專案

```bash
npm run build
```

### 啟動伺服器

```bash
npm run server
```

或使用便利腳本：

```bash
# Windows
start-server.bat

# Linux/Mac
bash start-server.sh
```

### 訪問系統

開啟瀏覽器，前往：`http://localhost:3000`

## 預設帳號

- **管理員**: `admin` / `admin123`
- **教師**: `teacher1` / `teacher123`
- **學生**: `student1` / `student123`

## 專案結構

```
learning-centre/
├── src/                 # TypeScript 源碼
├── public/             # 靜態檔案
├── dist/               # 編譯輸出
├── uploads/            # 上傳檔案
├── database.sqlite     # SQLite 資料庫
└── start-server.*      # 啟動腳本
```

## 開發指令

```bash
npm run build      # 編譯 TypeScript
npm run clean      # 清理 dist 目錄
npm run rebuild    # 重新建置
npm start          # 啟動伺服器
npm run dev        # 開發模式
```

## 注意事項

- 伺服器預設運行在 port 3000
- 資料庫會自動初始化並建立種子資料
- 所有頁面都有防回退快取保護

## 技術棧

- **後端**: Node.js + Express + TypeScript
- **資料庫**: SQLite + better-sqlite3
- **前端**: 原生 HTML/CSS/JavaScript
- **身份驗證**: Express Session
