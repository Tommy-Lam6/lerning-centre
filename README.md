# 學習中心專案

這個倉庫包含完整的智能學習中心系統。

## 📁 專案結構

```
learning-center-2025-10-11/
└── learning-centre/          # 主要專案資料夾
    ├── public/               # 前端靜態檔案
    ├── src/                  # TypeScript 源碼
    ├── dist/                 # 編譯輸出 (被忽略)
    ├── uploads/              # 上傳檔案資料夾
    ├── package.json          # 專案依賴
    ├── tsconfig.json         # TypeScript 配置
    ├── start-server.*        # 啟動腳本
    └── README.md             # 詳細專案說明
```

## 🚀 快速開始

```bash
# 進入專案目錄
cd learning-centre

# 安裝依賴
npm install

# 啟動專案
npm run server
```

## 📖 詳細說明

請查看 `learning-centre/README.md` 獲取完整的專案文檔和使用說明。

## 🔗 技術棧

- **後端**: Node.js + Express + TypeScript
- **資料庫**: SQLite + better-sqlite3
- **前端**: 原生 HTML/CSS/JavaScript
- **身份驗證**: Express Session

## 👥 預設帳號

- **管理員**: `admin1` / `1234`
- **教師**: `teacher1` / `teacher123`
- **學生**: `student1` / `student123`
