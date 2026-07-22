@echo off
setlocal

echo [SKALD] NOTE: This script is for local testing of the audio harness.
echo [SKALD] It plays the code in 'tester\generated_audio\generated_audio.odin'.
echo [SKALD] In the Skald UI, set the Generate output file to that path.
echo.

:: --- Self-heal: a generated file at tester\ root breaks the package. ---
:: (Odin allows one package per directory; the tester root is 'package main'.)
if exist tester\generated_audio.odin (
    echo [SKALD] Found generated code at tester\generated_audio.odin - wrong level.
    echo [SKALD] Moving it to tester\generated_audio\generated_audio.odin.
    move /Y tester\generated_audio.odin tester\generated_audio\generated_audio.odin >nul
)
if exist tester\generated_audio.json (
    move /Y tester\generated_audio.json tester\generated_audio\generated_audio.json >nul
)

:: --- Self-heal: the harness is hand-written; restore it if missing/clobbered. ---
if not exist tester\test_harness.odin (
    echo [SKALD] tester\test_harness.odin is missing. It is hand-written, not
    echo [SKALD] generated - restoring it from git.
    git checkout -- tester/test_harness.odin
    if errorlevel 1 (
        echo [SKALD] Could not restore tester\test_harness.odin from git. Exiting.
        exit /b 1
    )
)
findstr /B /C:"package main" tester\test_harness.odin >nul
if errorlevel 1 (
    echo [SKALD] tester\test_harness.odin does not declare 'package main' - it
    echo [SKALD] looks like generated code was written over it. Salvaging that
    echo [SKALD] export to tester\generated_audio\generated_audio.odin and
    echo [SKALD] restoring the harness from git.
    move /Y tester\test_harness.odin tester\generated_audio\generated_audio.odin >nul
    git checkout -- tester/test_harness.odin
    if errorlevel 1 (
        echo [SKALD] Could not restore tester\test_harness.odin from git. Exiting.
        exit /b 1
    )
)

echo [SKALD] Building test harness...

:: Build the 'tester' package. It imports the 'generated_audio' subpackage.
odin build tester -out:test_harness.exe
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
