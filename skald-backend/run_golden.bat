@echo off
setlocal enabledelayedexpansion

REM =====================================================================
REM Golden-file snapshot harness for the Skald codegen.
REM
REM Runs codegen.exe over every tests\fixtures\*.json and compares the
REM emitted Odin against a checked-in snapshot in tests\golden\. This makes
REM generator refactors provably output-preserving: the FFT acceptance suite
REM proves *behaviour* is unchanged, and the goldens prove the emitted *text*
REM is unchanged (or shows exactly what changed).
REM
REM Usage (run from skald-backend\):
REM   run_golden.bat            Check current emission against the goldens.
REM                             Exits non-zero on any diff or missing golden.
REM   run_golden.bat check      Same as above (explicit).
REM   run_golden.bat update     Regenerate the goldens from current emission.
REM                             Run this intentionally after a codegen change
REM                             you have verified with run_acceptance.bat.
REM
REM The .gen\ scratch dir holds fresh emission during a check; it is transient
REM and safe to delete. Golden files are tests\golden\<fixture>.odin.golden.
REM =====================================================================

set MODE=%1
if "%MODE%"=="" set MODE=check

if not exist tests\fixtures (
    echo [GOLDEN] No tests\fixtures directory. Run from skald-backend\.
    exit /b 1
)

echo [GOLDEN] Building codegen.exe...
odin build . -file -out:codegen.exe
if errorlevel 1 (
    echo [GOLDEN] CODEGEN BUILD FAILED.
    exit /b 1
)

if not exist tests\golden mkdir tests\golden
if not exist tests\golden\.gen mkdir tests\golden\.gen

set FAILED=0
set TOTAL=0

for %%f in (tests\fixtures\*.json) do (
    set /a TOTAL+=1
    set NAME=%%~nf
    set GEN=tests\golden\.gen\!NAME!.odin
    set GOLD=tests\golden\!NAME!.odin.golden

    .\codegen.exe -in:"%%~ff" -out:"!GEN!" -package:generated_audio >nul
    if errorlevel 1 (
        echo CODEGEN FAILED for !NAME!
        set /a FAILED+=1
    ) else (
        if /I "%MODE%"=="update" (
            copy /Y "!GEN!" "!GOLD!" >nul
            echo UPDATED !NAME!
        ) else (
            if not exist "!GOLD!" (
                echo MISSING GOLDEN for !NAME!  ^(run: run_golden.bat update^)
                set /a FAILED+=1
            ) else (
                fc /b "!GOLD!" "!GEN!" >nul
                if errorlevel 1 (
                    echo DIFF !NAME!  ^(current emission differs from golden^)
                    set /a FAILED+=1
                ) else (
                    echo OK !NAME!
                )
            )
        )
    )
)

echo.
if !TOTAL! equ 0 (
    echo [GOLDEN] No fixtures found in tests\fixtures\*.json.
    exit /b 1
)
if !FAILED! gtr 0 (
    if /I "%MODE%"=="update" (
        echo [GOLDEN] !FAILED!/!TOTAL! fixtures failed to generate.
    ) else (
        echo [GOLDEN] !FAILED!/!TOTAL! goldens differ. If intentional, run: run_golden.bat update
    )
    exit /b 1
)
if /I "%MODE%"=="update" (
    echo [GOLDEN] Regenerated !TOTAL! goldens.
) else (
    echo [GOLDEN] All !TOTAL! goldens match.
)
exit /b 0
