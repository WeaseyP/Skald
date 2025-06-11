@echo off
setlocal

echo [SKALD] Building skald_codegen CLI...
odin build . -file -out:skald_codegen.exe
if errorlevel 1 (
    echo [SKALD] CLI build FAILED. Exiting.
    exit /b 1
)
echo [SKALD] CLI build successful.

echo.
echo [SKALD] Generating audio code from graph.json...

:: THE FIX (Part 1): Create a dedicated directory for the generated package.
if not exist "tester\generated_audio" mkdir "tester\generated_audio"

:: THE FIX (Part 2): Place the generated code inside its package directory.
type graph.json | .\skald_codegen.exe > tester\generated_audio\audio.odin

echo.
echo [SKALD] Building test harness...

:: THE FIX (Part 3): Build the 'tester' directory. Odin will now correctly
:: find package 'main' and see the 'generated_audio' subdirectory to import.
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