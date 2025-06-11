@echo off
echo [SKALD] Building skald_codegen...

:: Assumes odin.exe is in your PATH or in C:\Odin\
odin build main.odin -file

:: Check if the build was successful before running
if errorlevel 1 (
    echo [SKALD] Build failed. Exiting.
    exit /b 1
)

echo.
echo [SKALD] Build successful. Running with graph.json...
echo ----------------------------------------------------
type graph.json | .\main.exe
echo ----------------------------------------------------
