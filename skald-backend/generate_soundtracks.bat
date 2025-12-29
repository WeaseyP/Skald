@echo off
echo Building Codegen...
odin build . -out:codegen.exe
if %errorlevel% neq 0 exit /b %errorlevel%

echo Generating Enemy 1...
codegen.exe -in:enemies\enemy1.json -name:Enemy1 -out:tester\generated_audio\enemy1.odin

echo Generating Enemy 2...
codegen.exe -in:enemies\enemy2.json -name:Enemy2 -out:tester\generated_audio\enemy2.odin

echo Generating Enemy 3...
codegen.exe -in:enemies\enemy3.json -name:Enemy3 -out:tester\generated_audio\enemy3.odin

echo Generating Enemy 4...
codegen.exe -in:enemies\enemy4.json -name:Enemy4 -out:tester\generated_audio\enemy4.odin

echo Generating Ambient...
codegen.exe -in:enemies\ambient.json -name:Ambient -out:tester\generated_audio\ambient.odin

echo Done.
