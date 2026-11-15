@echo off
chcp 936 >nul
setlocal
set PORT=%~1
if "%PORT%"=="" set PORT=8430
set DHU_OPS_PORT=%PORT%
set DHU_OPS_DB=%TEMP%\dhu_dev.db
title DHU 运维系统 - 调试模式 (端口 %PORT%)
where python >nul 2>nul
if errorlevel 1 goto NOPY
echo.
echo   调试地址：http://127.0.0.1:%PORT%/      账号 admin / admin123
echo   自检地址：http://127.0.0.1:%PORT%/api/health
echo   改前端（assets 下 js/css/html）：保存后直接刷新页面
echo   改后端（server.py）：关闭本窗口重新运行本脚本
echo.
start "" http://127.0.0.1:%PORT%/
python server.py
echo.
echo 服务已停止。若上方有报错，通常是端口 %PORT% 被占用，
echo 改用其他端口运行：调试启动.bat 8440
pause
exit /b 0

:NOPY
echo [错误] 未找到 python 命令，请先安装 Python 3.8+ 并勾选 "Add python.exe to PATH"
pause
exit /b 1