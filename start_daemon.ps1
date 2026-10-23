$action = New-ScheduledTaskAction -Execute "C:\Program Files\nodejs\node.exe" -Argument '"D:\ADS MCP APP\node_modules\next\dist\bin\next" start' -WorkingDirectory "D:\ADS MCP APP"
Register-ScheduledTask -TaskName "AdsSyncServer" -Action $action -Force
Start-ScheduledTask -TaskName "AdsSyncServer"
Write-Host "AdsSyncServer task registered and started successfully!"
