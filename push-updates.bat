@echo off
set PATH=C:\Program Files\Git\cmd;C:\Program Files\Git\mingw64\bin;%PATH%
title Push Updates to GitHub & Auto-Deploy on Render
echo =====================================================================
echo  HESYRA SCAN DESK - 1-CLICK CLOUD AUTO-DEPLOY
echo =====================================================================
echo.
echo [1/3] Staging modified files...
git add .

echo [2/3] Committing changes...
set /p commit_msg="Enter update note (press Enter for 'update: latest improvements'): "
if "%commit_msg%"=="" set commit_msg=update: latest improvements
git commit -m "%commit_msg%"

echo [3/3] Pushing to GitHub (origin main)...
git push -u origin main

echo.
echo =====================================================================
echo  SUCCESS! Pushed to GitHub.
echo  Render.com has received the update and is auto-deploying your live site!
echo =====================================================================
pause
