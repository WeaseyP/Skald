@echo off
setlocal enabledelayedexpansion

REM =====================================================================
REM Golden-file snapshot harness for the Skald codegen.
REM
REM Runs codegen.exe over every fixture and compares the emitted Odin
REM against a checked-in snapshot in tests\golden\. This makes generator
REM refactors provably output-preserving: the FFT acceptance suite proves
REM *behaviour* is unchanged, and the goldens prove the emitted *text* is
REM unchanged (or shows exactly what changed).
REM
REM Fixture directories scanned:
REM   tests\fixtures\*.json         Project-shape fixtures. Also eaten by
REM                                 run_acceptance.bat, which requires the
REM                                 single instrument to be named `Asset`.
REM   tests\fixtures\graph\*.json   Graph-shape (React Flow save) fixtures.
REM                                 Golden-only: these have many instruments
REM                                 with arbitrary names, so the Asset_*
REM                                 acceptance harness cannot build against
REM                                 them. run_acceptance.bat's glob is
REM                                 non-recursive and so does not see them.
REM   tests\fixtures\codegen_only\  Project-shape fixtures that pin EMITTED TEXT
REM     *.json                      only - a range-table default, a warning, an
REM                                 identifier edge case. Same non-recursive
REM                                 escape as graph\.
REM
REM   READ THIS BEFORE ADDING A FIXTURE. A .json dropped in the FLAT
REM   tests\fixtures\ directory is automatically an ACCEPTANCE fixture too, and
REM   run_acceptance.bat switches on its base name to pick FFT assertions -
REM   an unknown name is a hard failure ("unknown fixture"), so a golden-only
REM   fixture added there turns the acceptance suite (and CI's backend job) red.
REM   That is exactly what happened to noise_exposed_amplitude in 08d5875.
REM   Adding a fixture: does it need audio assertions?
REM     yes -> flat tests\fixtures\, name the single instrument `Asset`, and add
REM            its case to acceptance\main.odin
REM     no  -> codegen_only\ (project shape) or graph\ (React Flow shape)
REM   Fixture base names must be unique ACROSS all three directories - the
REM   golden file name is derived from the base name alone.
REM
REM DETERMINISM GATE (roadmap packet A3 / BUGS.md SKB-003): every fixture is
REM generated TWICE and the two emissions are compared with `fc /B`. Byte
REM equality of two runs over identical input is an invariant, not a
REM convention: build_project_from_graph used to iterate an Odin map (whose
REM order is unspecified and varies run-to-run), so the same input file
REM produced six distinct outputs across 14 runs and the wasm shim's integer
REM asset index permuted with them - skald_note_on(asset, ...) addressed a
REM different instrument on each regeneration. A golden diff cannot catch
REM that on its own (it only ever compares one run), so the double-run check
REM is a separate gate and it runs in `update` mode too: never record a
REM golden from a generator that is not reproducible.
REM
REM Usage (run from skald-backend\):
REM   run_golden.bat            Check current emission against the goldens.
REM                             Exits non-zero on any diff, missing golden,
REM                             or non-deterministic emission.
REM   run_golden.bat check      Same as above (explicit).
REM   run_golden.bat update     Regenerate the goldens from current emission.
REM                             Run this intentionally after a codegen change
REM                             you have verified with run_acceptance.bat.
REM
REM The .gen\ scratch dir holds fresh emission during a check (plus the
REM .rerun.odin second emission used by the determinism gate); it is
REM transient and safe to delete. Golden files are
REM tests\golden\<fixture>.odin.golden.
REM =====================================================================

set MODE=%1
if "%MODE%"=="" set MODE=check

if not exist tests\fixtures (
    echo [GOLDEN] No tests\fixtures directory. Run from skald-backend\.
    exit /b 1
)

echo [GOLDEN] Building codegen.exe...
odin build main.odin -file -out:codegen.exe
if errorlevel 1 (
    echo [GOLDEN] CODEGEN BUILD FAILED.
    exit /b 1
)

if not exist tests\golden mkdir tests\golden
if not exist tests\golden\.gen mkdir tests\golden\.gen

set FAILED=0
set NONDET=0
set TOTAL=0

for %%f in (tests\fixtures\*.json) do (
    set /a TOTAL+=1
    call :check_one "%%~ff" "%%~nf"
)

if exist tests\fixtures\graph (
    for %%f in (tests\fixtures\graph\*.json) do (
        set /a TOTAL+=1
        call :check_one "%%~ff" "%%~nf"
    )
)

if exist tests\fixtures\codegen_only (
    for %%f in (tests\fixtures\codegen_only\*.json) do (
        set /a TOTAL+=1
        call :check_one "%%~ff" "%%~nf"
    )
)

echo.
if !TOTAL! equ 0 (
    echo [GOLDEN] No fixtures found in tests\fixtures\*.json.
    exit /b 1
)
if !NONDET! gtr 0 (
    echo [GOLDEN] !NONDET!/!TOTAL! fixtures emit different bytes on two runs of
    echo          the same input. This is SKB-003 or a regression of it - find
    echo          the unsorted map iteration ^(see core\graph_utils.odin's
    echo          nodes_sorted_by_id^). Do NOT run `run_golden.bat update`: a
    echo          golden recorded from a permuted run bakes the permutation in
    echo          and destroys the only evidence that the generator is broken.
    exit /b 1
)
if !FAILED! gtr 0 (
    if /I "%MODE%"=="update" (
        echo [GOLDEN] !FAILED!/!TOTAL! fixtures failed to generate deterministically.
    ) else (
        echo [GOLDEN] !FAILED!/!TOTAL! goldens differ. If intentional, run: run_golden.bat update
    )
    exit /b 1
)
if /I "%MODE%"=="update" (
    echo [GOLDEN] Regenerated !TOTAL! goldens.
) else (
    echo [GOLDEN] All !TOTAL! goldens match, and all !TOTAL! emit identically on a re-run.
)
exit /b 0

:check_one
REM args: %1 = full path to fixture .json (quoted), %2 = bare fixture name
set NAME=%~2
set GEN=tests\golden\.gen\%NAME%.odin
set RERUN=tests\golden\.gen\%NAME%.rerun.odin
set SHIM=tests\golden\.gen\%NAME%.shim.odin
set SHIM2=tests\golden\.gen\%NAME%.shim.rerun.odin
set GOLD=tests\golden\%NAME%.odin.golden

REM The wasm shim is emitted alongside the main file on both runs. It is not
REM goldened (only the editor preview consumes it), but it is where the
REM non-determinism actually bit: the shim's `switch asset` dispatch is the
REM integer index a host addresses instruments by, so it must be pinned too.
.\codegen.exe -in:%1 -out:"%GEN%" -wasm-shim:"%SHIM%" -package:generated_audio >nul
if errorlevel 1 (
    echo CODEGEN FAILED for %NAME%
    set /a FAILED+=1
    goto :eof
)

REM --- Determinism gate: same input, second run, byte-exact compare. ---
.\codegen.exe -in:%1 -out:"%RERUN%" -wasm-shim:"%SHIM2%" -package:generated_audio >nul
if errorlevel 1 (
    echo CODEGEN FAILED for %NAME% on the determinism re-run
    set /a FAILED+=1
    goto :eof
)
REM /B is a BINARY compare - deliberately stricter than the golden compare
REM below, which normalizes line endings. Both emissions come from the same
REM binary on the same machine, so any byte difference at all is the
REM generator being non-deterministic.
fc /B "%GEN%" "%RERUN%" >nul
if errorlevel 1 (
    echo NON-DETERMINISTIC %NAME%  ^(two runs of the same input differ byte-for-byte^)
    set /a FAILED+=1
    set /a NONDET+=1
    goto :eof
)
fc /B "%SHIM%" "%SHIM2%" >nul
if errorlevel 1 (
    echo NON-DETERMINISTIC %NAME%  ^(wasm shim asset dispatch differs between two runs^)
    set /a FAILED+=1
    set /a NONDET+=1
    goto :eof
)

if /I "%MODE%"=="update" (
    copy /Y "%GEN%" "%GOLD%" >nul
    echo UPDATED %NAME%
    goto :eof
)

if not exist "%GOLD%" (
    echo MISSING GOLDEN for %NAME%  ^(run: run_golden.bat update^)
    set /a FAILED+=1
    goto :eof
)
REM Text comparison deliberately normalizes CRLF/LF across contributor
REM machines and GitHub's Windows checkout.
fc "%GOLD%" "%GEN%" >nul
if errorlevel 1 (
    echo DIFF %NAME%  ^(current emission differs from golden^)
    set /a FAILED+=1
    goto :eof
)
echo OK %NAME%
goto :eof
