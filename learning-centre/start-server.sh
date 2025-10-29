#!/bin/bash
# 學習中心伺服器啟動腳本

echo "🔧 準備啟動學習中心伺服器..."

# 檢查是否在正確目錄
if [ ! -f "server.ts" ]; then
    echo "❌ 錯誤: 請在 learning-centre 目錄中運行此腳本"
    exit 1
fi

# 終止現有的 node 進程
echo "🛑 停止現有的伺服器進程..."
taskkill //F //IM node.exe 2>/dev/null || echo "沒有需要停止的進程"

# 編譯 TypeScript
echo "📦 編譯 TypeScript..."
npx tsc
if [ $? -ne 0 ]; then
    echo "❌ TypeScript 編譯失敗"
    exit 1
fi

# 複製 public 資料夾到 dist
echo "📁 複製靜態檔案..."
cp -r public dist/

# 確保 uploads 目錄存在
mkdir -p uploads
mkdir -p dist/uploads

echo "🚀 啟動伺服器..."
echo "📍 伺服器將在 http://localhost:3000 啟動"
echo "🔄 使用 Ctrl+C 停止伺服器"

# 啟動伺服器
node dist/server.js