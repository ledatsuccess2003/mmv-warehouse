@echo off
chcp 65001 >nul
setlocal
title App Kho Vat Tu MMV
set "DIR=%~dp0"
set "PORT=8080"

rem ----- Lan dau: xin quyen Admin de mo cong mang cho dien thoai truy cap -----
if not exist "%DIR%.mmv-setup-ok" (
  echo.
  echo   Lan dau chay: can quyen Admin 1 lan de cho dien thoai truy cap.
  echo   Hay bam YES khi Windows hoi. Nhung lan sau se KHONG hoi nua.
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try{ Start-Process -Verb RunAs -Wait -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%DIR%server.ps1','-Setup','-Port','%PORT%' }catch{}"
)

rem ----- Chay may chu (mo trinh duyet tren PC va giu cua so nay) -----
powershell -NoProfile -ExecutionPolicy Bypass -File "%DIR%server.ps1" -Port %PORT%

endlocal
