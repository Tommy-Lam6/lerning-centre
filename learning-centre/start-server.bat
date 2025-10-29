@echo off
REM 學習中心伺服器啟動腳本 (Windows批次檔)

echo 🔧 準備啟動學習中心伺服器...

REM 檢查是否在正確目錄
if not exist "server.ts" (
    echo ❌ 錯誤: 請在 learning-centre 目錄中運行此腳本
    pause
    exit /b 1
)

REM 終止現有的 node 進程
echo 🛑 停止現有的伺服器進程...
taskkill /F /IM node.exe 2>nul || echo 沒有需要停止的進程

REM 編譯 TypeScript
echo 📦 編譯 TypeScript...
call npx tsc
if errorlevel 1 (
    echo ❌ TypeScript 編譯失敗
    pause
    exit /b 1
)

REM 複製 public 資料夾到 dist
echo 📁 複製靜態檔案...
xcopy /E /I /Y public dist\public >nul

REM 確保 uploads 目錄存在
if not exist "uploads" mkdir uploads
if not exist "dist\uploads" mkdir dist\uploads

echo 🚀 啟動伺服器...
echo 📍 伺服器將在 http://localhost:3000 啟動
echo 🔄 使用 Ctrl+C 停止伺服器

REM 啟動伺服器
node dist\server.js

pause