@echo off
setlocal enabledelayedexpansion

REM =====================================================================
REM Freshness gate for the CHECKED-IN generated_audio.odin copies.
REM (roadmap packet A2 / BUGS.md SKB-020, root cause SKB-001.)
REM
REM Some generated Odin is committed on purpose: it is what a game developer
REM copies (examples\integration_demo\) and what the local audio harnesses
REM compile against (tester\, tester\fixture_player\). Committed generated code
REM drifts, and this lot did: every copy was emitted by the stale
REM skald-ui\skald_codegen.exe, so `grep -c attack_start` returned 0 in all of
REM them while the goldens had 3-6 - i.e. they re-introduced the voice-steal
REM click that source had already fixed, into the very files a new user copies.
REM
REM This script regenerates each copy from its SOURCE with the compiler built
REM from the current tree, and fails when the committed file differs. Same
REM contract as run_golden.bat, and for the same reason: generated text that
REM nobody diffs is a lie waiting to happen.
REM
REM Usage (run from skald-backend\):
REM   regen_generated.bat          Fail if any committed copy is out of date.
REM   regen_generated.bat check    Same (explicit).
REM   regen_generated.bat update   Rewrite the committed copies from source.
REM                                Run run_acceptance.bat, run_golden.bat check
REM                                and examples\integration_demo\build_and_run.bat
REM                                after: three harnesses compile against these.
REM
REM WHY THESE SOURCES:
REM   examples\integration_demo\  <- _demo_project.json. Already the documented
REM                                  pairing (build_and_run.bat regenerates it).
REM   tester\fixture_player\      <- tests\fixtures\filter_sweep.json. The player
REM                                  hardcodes the `Asset` instrument name, which
REM                                  every seed fixture uses, and filter_sweep is
REM                                  the last Music Layer fixture play_fixtures.bat
REM                                  runs - i.e. what the committed copy was.
REM   tester\                     <- tests\fixtures\graph\multi_instrument_dup_names.json.
REM                                  SUBSTITUTED, deliberately: the committed copy
REM                                  was a one-off editor export ("sadfsadf",
REM                                  "WUBBLE") whose input JSON is not in the repo,
REM                                  so it could not be regenerated OR gated - only
REM                                  left to rot. test_harness.odin uses just the
REM                                  project_* API, so any project works, and this
REM                                  fixture is the 5-instrument duplicate-name one
REM                                  packet A3 added for the determinism bug.
REM
REM DELIBERATELY NOT GATED: skald-backend\tests\generated_audio.odin. Nothing
REM compiles it, its input JSON is likewise absent - and it is CITED BY LINE
REM NUMBER as evidence in two manual chapters (docs\manual-source\nodes\lfo.md
REM :90 and nodes\noise.md :63,:82,:112,:126,:221 point at :121, :505, :643-645,
REM :647, :861, :1984, :2090, and all of them still resolve). Regenerating it from
REM any tracked source destroys that evidence: the passages turn on a node named
REM "growl vibrato" that no fixture has. Re-pointing manual citations belongs to
REM packet A9 / Wave D, not here, so it is reported as an open remnant of SKB-020
REM rather than silently broken.
REM =====================================================================

set MODE=%1
if "%MODE%"=="" set MODE=check

if not exist tests\fixtures (
    echo [REGEN] No tests\fixtures directory. Run from skald-backend\.
    exit /b 1
)

echo [REGEN] Building codegen.exe from the current tree...
odin build main.odin -file -out:codegen.exe
if errorlevel 1 (
    echo [REGEN] CODEGEN BUILD FAILED.
    exit /b 1
)

set GENDIR=.regen
if not exist %GENDIR% mkdir %GENDIR%

set FAILED=0
set TOTAL=0

call :one demo         "..\examples\integration_demo\_demo_project.json"                 "..\examples\integration_demo\generated_audio\generated_audio.odin"
call :one fixture_player "tests\fixtures\filter_sweep.json"                              "tester\fixture_player\generated_audio\generated_audio.odin"
call :one tester       "tests\fixtures\graph\multi_instrument_dup_names.json"            "tester\generated_audio\generated_audio.odin"

echo.
echo [REGEN] Not gated: tests\generated_audio.odin ^(no source JSON in the repo,
echo         nothing compiles it, and 9 manual citations point into it - see the
echo         header of this script^).
echo.
if !FAILED! gtr 0 (
    if /I "%MODE%"=="update" (
        echo [REGEN] !FAILED!/!TOTAL! copies failed to regenerate.
    ) else (
        echo [REGEN] !FAILED!/!TOTAL! checked-in generated files are STALE. They were
        echo         emitted by an older compiler and re-introduce fixed bugs into
        echo         anything built against them ^(SKB-020^). Regenerate with:
        echo             regen_generated.bat update
        echo         then re-run run_acceptance.bat, run_golden.bat check and
        echo         examples\integration_demo\build_and_run.bat.
    )
    exit /b 1
)
if /I "%MODE%"=="update" (
    echo [REGEN] Regenerated !TOTAL! checked-in generated files.
) else (
    echo [REGEN] All !TOTAL! checked-in generated files match the current compiler.
)
exit /b 0

:one
REM args: %1 = label, %2 = source json (quoted), %3 = committed target (quoted)
set LABEL=%~1
set SRC=%~2
set DST=%~3
set GEN=%GENDIR%\%LABEL%.odin
set /a TOTAL+=1

if not exist "%SRC%" (
    echo MISSING SOURCE for %LABEL%: %SRC%
    set /a FAILED+=1
    goto :eof
)

.\codegen.exe -in:"%SRC%" -out:"%GEN%" -package:generated_audio >nul
if errorlevel 1 (
    echo CODEGEN FAILED for %LABEL% ^(%SRC%^)
    set /a FAILED+=1
    goto :eof
)

if /I "%MODE%"=="update" (
    copy /Y "%GEN%" "%DST%" >nul
    if errorlevel 1 (
        echo COPY FAILED for %LABEL% -^> %DST%
        set /a FAILED+=1
        goto :eof
    )
    echo UPDATED %LABEL%  ^(%DST%^)
    goto :eof
)

if not exist "%DST%" (
    echo MISSING %LABEL%  ^(%DST% - run: regen_generated.bat update^)
    set /a FAILED+=1
    goto :eof
)
REM Text compare, normalizing CRLF/LF the way run_golden.bat does: contributor
REM machines and GitHub's Windows checkout disagree about line endings and that
REM is not drift.
fc "%DST%" "%GEN%" >nul
if errorlevel 1 (
    echo STALE %LABEL%  ^(%DST% differs from current emission^)
    set /a FAILED+=1
    goto :eof
)
echo OK %LABEL%
goto :eof
