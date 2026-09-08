@echo off
chcp 65001 >nul
setlocal
title MMV Warehouse - Quan Ly Kho
set "DIR=%~dp0"
set "PORT=5173"

rem ----- Tim Node.js -----
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo.
  echo   LOI: Chua cai Node.js!
  echo   Hay chay lenh: winget install OpenJS.NodeJS.LTS
  echo.
  pause
  exit /b 1
)

rem ----- Lan dau: cai thu vien + mo firewall -----
if not exist "%DIR%mmv-warehouse\node_modules" (
  echo.
  echo   Dang cai dat thu vien lan dau...
  echo.
  cd /d "%DIR%mmv-warehouse"
  call npm install
)

if not exist "%DIR%.mmv-warehouse-setup-ok" (
  echo.
  echo   Mo cong firewall de dien thoai truy cap...
  echo   Hay bam YES khi Windows hoi quyen Admin.
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try{ Start-Process -Verb RunAs -Wait -FilePath 'netsh.exe' -ArgumentList 'advfirewall','firewall','add','rule','name=MMV Warehouse Dev','dir=in','action=allow','protocol=tcp','localport=%PORT%' }catch{}"
  echo OK > "%DIR%.mmv-warehouse-setup-ok"
)

rem ----- Tim IP LAN -----
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "IP=%%a"
)
set "IP=%IP: =%"

echo.
echo   ===================================================
echo    MMV WAREHOUSE - Quan Ly Kho Hang Hai
echo   ===================================================
echo.
echo    PC:          http://localhost:%PORT%
echo    Dien thoai:  http://%IP%:%PORT%
echo.
echo    Nhan Ctrl+C de dung server.
echo   ===================================================
echo.

rem ----- Mo trinh duyet tren PC -----
start "" "http://localhost:%PORT%"

rem ----- Chay Vite dev server -----
cd /d "%DIR%mmv-warehouse"
call npx vite --host

endlocal
