@echo off
cd /d "%~dp0"
node threads_info_daily.js >> threads_info_log.txt 2>&1
