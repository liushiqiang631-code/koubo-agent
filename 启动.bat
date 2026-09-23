@echo off
title 口播智能体
cd /d "%~dp0"

rem 以 __waitopen 参数自调用时：后台等待服务就绪并自动打开浏览器
if "%~1"=="__waitopen" goto waitopen

echo ==============================================
echo    口播智能体 · 本地启动器
echo ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18 或更高版本：
    echo        https://nodejs.org/
    echo.
    pause
    exit /b 1
)

rem 已在运行则直接打开浏览器，避免重复启动导致端口占用
powershell -NoProfile -Command "try{ $r=Invoke-WebRequest -Uri 'http://localhost:7788/api/meta' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -eq 200){ exit 0 } }catch{ exit 1 }"
if not errorlevel 1 (
    echo 检测到服务已在运行，直接打开浏览器...
    start "" http://localhost:7788
    exit /b 0
)

if not exist "node_modules" (
    echo 首次运行：正在安装依赖，请保持网络畅通，可能需要几分钟...
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo npm install 失败，改用本地修复工具 rescue-deps.js ...
        call node rescue-deps.js --force
    )
    echo.
)

if not exist "frontend\dist\index.html" (
    echo 正在构建前端，请稍候...
    echo.
    call npm run build
    echo.
)

rem 后台起一个等待进程：服务一就绪立刻打开浏览器
start "" /min cmd /c ""%~f0" __waitopen"

echo 正在启动服务，浏览器将自动打开：http://localhost:7788
echo 【关闭本窗口即可停止服务】
echo.
node server\index.js

echo.
echo 服务已停止。
pause
exit /b 0

:waitopen
powershell -NoProfile -Command "for($i=0; $i -lt 240; $i++){ try{ $r=Invoke-WebRequest -Uri 'http://localhost:7788/api/meta' -UseBasicParsing -TimeoutSec 1; if($r.StatusCode -eq 200){ Start-Process 'http://localhost:7788'; exit } }catch{ Start-Sleep -Milliseconds 500 } }"
exit
