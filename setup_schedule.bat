@echo off
chcp 65001 >nul
schtasks /Create /SC DAILY /ST 07:00 /TN "ContentAutomation_Daily" /TR "\"%~dp0run_daily.bat\"" /F
echo.
echo [완료] 매일 오전 7시 자동 실행 등록됨 (작업 이름: ContentAutomation_Daily)
echo 확인:
schtasks /Query /TN "ContentAutomation_Daily"
echo.
echo 해제하려면:  schtasks /Delete /TN "ContentAutomation_Daily" /F
pause
