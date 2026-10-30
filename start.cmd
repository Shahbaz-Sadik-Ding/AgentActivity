@echo off
pushd "%~dp0"
call env.cmd
if not exist out\main\index.js call npm run build
.\node_modules\electron\dist\electron.exe .
popd
