@echo off
REM WebNovel Forge — Single-File Runner (Windows)
REM Path: C:\Users\rushi\OneDrive\Desktop\web\RUN_SINGLE_FILE.bat
REM Double-click this file to start the app

set PROJECT_ROOT=%~dp0
echo === WebNovel Forge Single-File Runner ===
echo Project: %PROJECT_ROOT%

where node >nul 2>nul || (echo Node.js not found. Install from https://nodejs.org && pause && exit /b 1)
where ffmpeg >nul 2>nul || echo WARNING: FFmpeg not found. Run: winget install FFmpeg

if not exist "%PROJECT_ROOT%node_modules\electron" (
  echo Installing dependencies...
  call npm install
)

if not exist "%PROJECT_ROOT%dist\main\main.js" (
  echo Building single program file...
  call npm run build
)

echo Starting WebNovel Forge...
if exist "%PROJECT_ROOT%dist\WebNovel Forge 1.0.0.exe" (
  start "" "%PROJECT_ROOT%dist\WebNovel Forge 1.0.0.exe"
) else if exist "%PROJECT_ROOT%dist\win-unpacked\WebNovel Forge.exe" (
  start "" "%PROJECT_ROOT%dist\win-unpacked\WebNovel Forge.exe"
) else (
  call npx electron .
)
pause
