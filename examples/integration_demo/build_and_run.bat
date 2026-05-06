@echo off
setlocal enabledelayedexpansion

echo [Skald demo] Regenerating generated_audio package from _demo_project.json...
pushd ..\..\skald-backend
.\codegen.exe -in:..\examples\integration_demo\_demo_project.json -out:..\examples\integration_demo\generated_audio\generated_audio.odin -package:generated_audio
if errorlevel 1 (
    echo [Skald demo] CODEGEN FAILED.
    popd
    exit /b 1
)
popd

echo [Skald demo] Compiling integration demo...
odin build . -out:integration_demo.exe
if errorlevel 1 (
    echo [Skald demo] BUILD FAILED.
    exit /b 1
)

echo [Skald demo] Running... ^(default mode = full-demo, ~8s timeline^)
echo [Skald demo] Override with: build_and_run.bat -mode:sfx-once ^| -mode:layer ^| -mode:silent-test ^| -mode:sfx-loop
.\integration_demo.exe %*
