@echo off
setlocal enabledelayedexpansion
set MODE=%1
if "%MODE%"=="" set MODE=check

if not exist ..\examples (
    echo [CORPUS] No ..\examples directory.
    exit /b 1
)

echo [CORPUS] Building codegen.exe...
odin build main.odin -file -out:codegen.exe
if errorlevel 1 exit /b 1

if not exist tests\golden mkdir tests\golden
if not exist tests\golden\examples_corpus mkdir tests\golden\examples_corpus
if not exist tests\golden\examples_corpus\.gen mkdir tests\golden\examples_corpus\.gen

set FAILED=0
set NONDET=0
set TOTAL=0

pushd ..\examples
set "EXAMPLES_DIR=%CD%"
popd

for /R "%EXAMPLES_DIR%" %%f in (*.json) do (
    set "ABS_PATH=%%~ff"
    set "REL_PATH=!ABS_PATH:%EXAMPLES_DIR%\=!"
    set "SAFE_NAME=!REL_PATH:\=_!"
    set /a TOTAL+=1
    call :check_one "%%~ff" "!SAFE_NAME!"
)

echo.
if !TOTAL! equ 0 (
    echo [CORPUS] No fixtures found.
    exit /b 1
)
if !NONDET! gtr 0 (
    echo [CORPUS] !NONDET!/!TOTAL! non-deterministic.
    exit /b 1
)
if !FAILED! gtr 0 (
    echo [CORPUS] !FAILED!/!TOTAL! failed.
    exit /b 1
)
if /I "%MODE%"=="update" (
    echo [CORPUS] Regenerated !TOTAL! goldens.
) else (
    echo [CORPUS] All !TOTAL! goldens match.
)
exit /b 0

:check_one
set "NAME=%~2"
set "GEN=tests\golden\examples_corpus\.gen\%NAME%.odin"
set "RERUN=tests\golden\examples_corpus\.gen\%NAME%.rerun.odin"
set "SHIM=tests\golden\examples_corpus\.gen\%NAME%.shim.odin"
set "SHIM2=tests\golden\examples_corpus\.gen\%NAME%.shim.rerun.odin"
set "GOLD=tests\golden\examples_corpus\%NAME%.odin.golden"

.\codegen.exe -in:%1 -out:"%GEN%" -wasm-shim:"%SHIM%" -package:generated_audio >nul
if errorlevel 1 (
    echo CODEGEN FAILED for %NAME%
    set /a FAILED+=1
    goto :eof
)

.\codegen.exe -in:%1 -out:"%RERUN%" -wasm-shim:"%SHIM2%" -package:generated_audio >nul
if errorlevel 1 (
    echo CODEGEN FAILED for %NAME% on re-run
    set /a FAILED+=1
    goto :eof
)

fc /B "%GEN%" "%RERUN%" >nul
if errorlevel 1 (
    echo NON-DETERMINISTIC %NAME%
    set /a FAILED+=1
    set /a NONDET+=1
    goto :eof
)

fc /B "%SHIM%" "%SHIM2%" >nul
if errorlevel 1 (
    echo NON-DETERMINISTIC %NAME% ^(shim^)
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
    echo MISSING GOLDEN for %NAME%
    set /a FAILED+=1
    goto :eof
)

fc "%GOLD%" "%GEN%" >nul
if errorlevel 1 (
    echo DIFF %NAME%
    set /a FAILED+=1
    goto :eof
)
echo OK %NAME%
goto :eof
