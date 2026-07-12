@echo off
cd /d "%~dp0"
start "" http://localhost:3800
node threads_dashboard.js
