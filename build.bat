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
echo [SKALD] Generating audio code...

:: Step 1: Create a dedicated directory for the generated package.
if not exist "tester\generated_audio" mkdir "tester\generated_audio"

:: Step 2: Define the path for the output file.
set "GENERATED_FILE=tester\generated_audio\audio.odin"

:: Step 3: Generate the code and place it inside its package directory.
type graph.json | .\skald_codegen.exe > %GENERATED_FILE%
if errorlevel 1 (
    echo [SKALD] Code generation FAILED. The 'skald_codegen.exe' process returned an error.
    exit /b 1
)

:: Step 4: Sanity check to ensure the generated file was actually created.
if not exist "%GENERATED_FILE%" (
    echo [SKALD] Code generation FAILED. The output file '%GENERATED_FILE%' was not created.
    exit /b 1
)
echo [SKALD] Code generation successful.

echo.
echo [SKALD] Building test harness...

:: Step 5: Build the 'tester' directory. The compiler will find 'package main'
:: and resolve the 'import "generated_audio"' by looking in the sub-directory.
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