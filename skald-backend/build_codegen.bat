@echo off
setlocal

echo [SKALD] Building skald_codegen CLI for UI...

set "ODIN_BIN="
if defined SKALD_ODIN set "ODIN_BIN=%SKALD_ODIN%"
if not defined ODIN_BIN if exist "..\.tools\odin-dev-2025-02\odin-windows-amd64-dev-2025-02\odin.exe" set "ODIN_BIN=..\.tools\odin-dev-2025-02\odin-windows-amd64-dev-2025-02\odin.exe"
if not defined ODIN_BIN set "ODIN_BIN=odin"

:: Build the Odin executable and output it directly into the skald-ui project folder.
:: The ..\skald-ui\ path assumes this script is run from the skald-backend directory.
echo [SKALD] Using Odin: %ODIN_BIN%
"%ODIN_BIN%" build . -file -out:..\skald-ui\skald_codegen.exe
if errorlevel 1 (
    echo [SKALD] CLI build FAILED. Exiting.
    exit /b 1
)

echo [SKALD] CLI build successful. Output to ..\skald-ui\skald_codegen.exe
