@echo off
chcp 65001 >nul
set "ROOT=%~dp0.."
cd /d "%ROOT%"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [錯誤] 找不到 node。請先安裝 Node.js ^(LTS^)：https://nodejs.org/
  echo 安裝完成後請「關閉並重新開啟」終端機或 Cursor，再執行本檔案。
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo [錯誤] 找不到 npm。請重新安裝 Node.js ^(勾選 Add to PATH^)，或修復 PATH 後重試。
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo 首次執行：正在 npm install ...
  call npm install
  if errorlevel 1 (
    echo npm install 失敗，請將上方錯誤訊息複製下來排查。
    pause
    exit /b 1
  )
)

echo 啟動開發伺服器 ^(預設 http://localhost:3000/^) ...
call npm run dev
pause
