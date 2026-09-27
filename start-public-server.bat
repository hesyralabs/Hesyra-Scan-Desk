@echo off
title Hesyra Scan Desk - Online Server & Cloudflare Tunnel
echo =====================================================================
echo  HESYRA DENTAL LABS - 48-HOUR FIELD SCAN DESK
echo  Connected to Google Drive: G:\My Drive\Hesyra Invoices
echo =====================================================================
echo.
echo [1/2] Starting Node.js backend server on http://localhost:3005...
start "Hesyra Backend Server" cmd /k "node server.js"

echo [2/2] Connecting Cloudflare Free Secure Tunnel...
timeout /t 3 /nobreak > nul
echo.
echo Scan technicians can open the generated HTTPS URL on their phones from anywhere!
echo =====================================================================
echo.
cloudflared.exe tunnel --url http://localhost:3005
pause
