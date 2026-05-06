@echo off
setlocal enabledelayedexpansion

echo [SKALD] Running acceptance suite...

if not exist tests\fixtures (
    echo [SKALD] No tests\fixtures directory. Run from skald-backend\.
    exit /b 1
)

REM ---- Reset generated_audio.odin from the stub template so a previous ----
REM ---- run's broken codegen output can't permanently brick the harness. ----
copy /Y acceptance\generated_audio\_stub.odin.template acceptance\generated_audio\generated_audio.odin >nul
if errorlevel 1 (
    echo [SKALD] Failed to reset generated_audio stub.
    exit /b 1
)

odin build . -file -out:codegen.exe
if errorlevel 1 (
    echo [SKALD] CODEGEN BUILD FAILED.
    exit /b 1
)

REM ---- FFT self-test (independent of fixtures) ----
echo --- Self-test: __fft_self_test__ ---
odin build acceptance -out:acceptance.exe
if errorlevel 1 (
    echo [SKALD] ACCEPTANCE BUILD FAILED on stub generated_audio.
    exit /b 1
)
.\acceptance.exe __fft_self_test__
if errorlevel 1 (
    echo [SKALD] FFT SELF-TEST FAILED. Halting.
    exit /b 1
)

set FAILED=0
set TOTAL=0
set HAS_FIXTURES=0

for %%f in (tests\fixtures\*.json) do (
    set HAS_FIXTURES=1
    set /a TOTAL+=1
    call :run_fixture "%%~ff" "%%~nf"
)

if !HAS_FIXTURES! equ 0 (
    echo.
    echo [SKALD] No fixtures found in tests\fixtures\*.json.
    echo [SKALD] FFT self-test passed. Add seed fixtures per
    echo         tests\fixtures\SEED_FIXTURE_INSTRUCTIONS.md.
    exit /b 0
)

echo.
if !FAILED! gtr 0 (
    echo [SKALD] !FAILED!/!TOTAL! fixtures failed.
    exit /b 1
)
echo [SKALD] All !TOTAL! fixtures passed.
exit /b 0

:run_fixture
REM args: %1 = full path to .json (quoted), %2 = bare fixture name (quoted)
echo.
echo --- Fixture: %~2 ---
.\codegen.exe -in:%1 -out:acceptance\generated_audio\generated_audio.odin -package:generated_audio
if errorlevel 1 (
    echo CODEGEN FAILED FOR %~2
    set /a FAILED+=1
    goto :eof
)
odin build acceptance -out:acceptance.exe
if errorlevel 1 (
    echo ACCEPTANCE BUILD FAILED FOR %~2
    set /a FAILED+=1
    goto :eof
)
.\acceptance.exe %~2
if errorlevel 1 (
    echo ASSERTIONS FAILED FOR %~2
    set /a FAILED+=1
    goto :eof
)
goto :eof
