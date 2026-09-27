@echo off
title Push Updates to GitHub & Auto-Deploy on Render
echo =====================================================================
echo  HESYRA SCAN DESK - 1-CLICK CLOUD AUTO-DEPLOY
echo =====================================================================
echo.
echo [1/3] Staging modified files...
"C:\Program Files\Git\cmd\git.exe" add .

echo [2/3] Committing changes...
set /p commit_msg="Enter update note (press Enter for 'update: latest improvements'): "
if "%commit_msg%"=="" set commit_msg=update: latest improvements
"C:\Program Files\Git\cmd\git.exe" commit -m "%commit_msg%"

echo [3/3] Pushing to GitHub (origin main)...
"C:\Program Files\Git\cmd\git.exe" push origin main

echo.
echo =====================================================================
echo  SUCCESS! Pushed to GitHub.
echo  Render.com has received the update and is auto-deploying your live site!
echo =====================================================================
pause
