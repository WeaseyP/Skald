@echo off
setlocal

echo [SKALD] Building skald_codegen CLI for UI...

:: Build the Odin executable and output it directly into the skald-ui project folder.
:: The ..\skald-ui\ path assumes this script is run from the skald-backend directory.
odin build . -file -out:..\skald-ui\skald_codegen.exe
if errorlevel 1 (
    echo [SKALD] CLI build FAILED. Exiting.
    exit /b 1
)

echo [SKALD] CLI build successful. Output to ..\skald-ui\skald_codegen.exe
