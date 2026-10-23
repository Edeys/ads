@echo off
cd /d "D:\ADS MCP APP"
"C:\Program Files\nodejs\node.exe" "D:\ADS MCP APP\node_modules\next\dist\bin\next" start > "D:\ADS MCP APP\server.log" 2>&1
