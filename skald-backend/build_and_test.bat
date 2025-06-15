@echo off
setlocal

echo [SKALD] NOTE: This script is for local testing of the audio harness.
echo [SKALD] It uses the 'tester\generated_audio\audio.odin' file.
echo [SKALD] To generate that file, use the Skald UI and copy the code into that location.
echo.

echo [SKALD] Building test harness...

:: Build the 'tester' directory. Odin will find the manually placed audio.odin file.
odin build tester -file -out:test_harness.exe
set BUILD_ERROR=%errorlevel%

if %BUILD_ERROR% neq 0 (
    echo [SKALD] Test harness build FAILED. Exiting.
    exit /b 1
)
echo [SKALD] Test harness build successful.

echo.
echo [SKALD] Running test harness...
echo ----------------------------------------------------
.\test_harness.exe
