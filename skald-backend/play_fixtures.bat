@echo off
setlocal enabledelayedexpansion

REM Iterates every fixture in tests\fixtures\, regenerates the
REM fixture_player's generated_audio package against it, builds, and
REM plays for ~5 seconds. SFX vs Music Layer mode is hardcoded per
REM fixture name. Pass an optional fixture name as %1 to play only that one.

if not exist tests\fixtures (
    echo [SKALD] No tests\fixtures directory. Run from skald-backend\.
    exit /b 1
)

REM Build codegen first.
odin build . -file -out:codegen.exe
if errorlevel 1 (
    echo [SKALD] CODEGEN BUILD FAILED.
    exit /b 1
)

set ONE_FIXTURE=%~1

REM Order: simplest SFX first, then Music Layer last.
call :play_one sine_440         sfx
call :play_one sine_220         sfx
call :play_one adsr_sine        sfx
call :play_one sfx_oneshot      sfx
call :play_one sine_220_pan_left sfx
call :play_one param_modulation sfx
call :play_one kick_loop_120bpm layer
call :play_one filter_sweep     layer

echo.
echo [SKALD] Done.
exit /b 0

:play_one
REM args: %1 = fixture name (no extension), %2 = mode (sfx|layer)
if not "%ONE_FIXTURE%"=="" if /I not "%ONE_FIXTURE%"=="%~1" goto :eof

if not exist tests\fixtures\%~1.json (
    echo [SKALD] tests\fixtures\%~1.json not found, skipping.
    goto :eof
)

echo.
echo ============================================================
echo  %~1   ^(%~2^)
echo ============================================================

.\codegen.exe -in:tests\fixtures\%~1.json -out:tester\fixture_player\generated_audio\generated_audio.odin -package:generated_audio
if errorlevel 1 (
    echo [SKALD] CODEGEN FAILED FOR %~1
    goto :eof
)

odin build tester\fixture_player -out:fixture_player.exe
if errorlevel 1 (
    echo [SKALD] BUILD FAILED FOR %~1
    goto :eof
)

.\fixture_player.exe -mode:%~2 -dur:5 -name:%~1
goto :eof
