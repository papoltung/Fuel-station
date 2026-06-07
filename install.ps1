# Fuel Station - Auto Installer
# Run as Administrator

Write-Host "=== Fuel Station Installer ===" -ForegroundColor Cyan

# 1. Check Node.js
Write-Host "`n[1/4] Checking Node.js..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Node.js..." -ForegroundColor Yellow
    $nodeUrl = "https://nodejs.org/dist/v22.15.0/node-v22.15.0-x64.msi"
    $nodeMsi = "$env:TEMP\node-installer.msi"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi
    Start-Process msiexec -ArgumentList "/i $nodeMsi /quiet /norestart" -Wait
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    Write-Host "Node.js installed." -ForegroundColor Green
} else {
    Write-Host "Node.js already installed: $(node -v)" -ForegroundColor Green
}

# 2. Check cloudflared
Write-Host "`n[2/4] Checking cloudflared..." -ForegroundColor Yellow
if (-not (Test-Path "C:\Program Files (x86)\cloudflared\cloudflared.exe")) {
    Write-Host "Installing cloudflared..." -ForegroundColor Yellow
    $cfUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi"
    $cfMsi = "$env:TEMP\cloudflared-installer.msi"
    Invoke-WebRequest -Uri $cfUrl -OutFile $cfMsi
    Start-Process msiexec -ArgumentList "/i $cfMsi /quiet /norestart" -Wait
    Write-Host "cloudflared installed." -ForegroundColor Green
} else {
    Write-Host "cloudflared already installed." -ForegroundColor Green
}

# 3. npm install + prisma
Write-Host "`n[3/4] Installing dependencies..." -ForegroundColor Yellow
Set-Location $PSScriptRoot
npm install
npx prisma generate
npx prisma db push
Write-Host "Dependencies ready." -ForegroundColor Green

# 4. Register startup task
Write-Host "`n[4/4] Registering startup task..." -ForegroundColor Yellow
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSScriptRoot\start-tunnel.ps1`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "FuelStationTunnel" -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null
Write-Host "Startup task registered." -ForegroundColor Green

Write-Host "`n=== Done! ===" -ForegroundColor Cyan
Write-Host "Restart your computer to start automatically." -ForegroundColor White
Write-Host "Or run start-tunnel.ps1 manually now." -ForegroundColor White
pause
