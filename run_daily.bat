@echo off
cd /d "%~dp0"
node daily_auto.js --tiktok >> daily_run_log.txt 2>&1
