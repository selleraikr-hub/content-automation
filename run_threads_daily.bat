@echo off
cd /d "%~dp0"
node threads_weekly.js >> threads_daily_log.txt 2>&1
