@echo off
rem Chạy AdsSync production trên máy local. Build trước: npm run build
cd /d "%~dp0.."
"C:\Program Files\nodejs\node.exe" scripts\serve.mjs
