@echo off
setlocal

echo [1/4] Generating Oscillator Test Graph...
odin run tools\gen_osc_test.odin -file
if %errorlevel% neq 0 exit /b 1

echo [2/4] Building Test Harness...
odin build tester -out:tester.exe
if %errorlevel% neq 0 exit /b 1

echo [3/4] Running Audio Generation (Headless)...
tester.exe -out:osc_440.csv -dur:1.0
if %errorlevel% neq 0 exit /b 1

echo [4/4] Verifying DSP Physics...
odin run tests\dsp -out:verifier.exe -- osc osc_440.csv
if %errorlevel% neq 0 exit /b 1

echo.
echo =======================================
echo    SCIENTIFIC VERIFICATION PASSED
echo =======================================
exit /b 0
