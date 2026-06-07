# Wait for network
$net = $false
for ($i = 0; $i -lt 30; $i++) {
    try { $null = Invoke-WebRequest -Uri "https://discord.com" -UseBasicParsing -TimeoutSec 3; $net = $true; break } catch {}
    Start-Sleep -Seconds 5
}
if (-not $net) { exit 1 }

# Start Next.js dev server
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory "c:\Users\USER\Documents\fuel-station" -WindowStyle Minimized

# Start Discord bot
Start-Process -FilePath "node" -ArgumentList "discord-bot.js" -WorkingDirectory "c:\Users\USER\Documents\fuel-station" -WindowStyle Minimized

Start-Sleep -Seconds 8

$webhookUrl = "https://discord.com/api/webhooks/1506490972689662104/qqvfcnbT8nDFd3hyryTIsF_pU6rL2KCtTRo9XaZbdmmsVjI-PsOVDkVS2PK8L-LgUOmH"
$cfExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe"

function Start-Tunnel {
    $logFile = "$env:TEMP\cf-tunnel-url.log"
    if (Test-Path $logFile) { Remove-Item $logFile }

    $proc = Start-Process -FilePath $cfExe -ArgumentList "tunnel --url http://localhost:3000" -RedirectStandardError $logFile -WindowStyle Hidden -PassThru

    # Wait for URL
    $url = $null
    $tries = 0
    while (-not $url -and $tries -lt 30) {
        Start-Sleep -Seconds 2
        $tries++
        if (Test-Path $logFile) {
            $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
            if ($content -match "https://[a-z0-9\-]+\.trycloudflare\.com") {
                $url = $Matches[0]
            }
        }
    }

    if ($url) {
        $body = "{`"content`": `"pump online: $url/dashboard`"}"
        Invoke-RestMethod -Uri $webhookUrl -Method Post -Body $body -ContentType "application/json"
    }

    return $proc
}

# Loop: restart tunnel — rate-limit guard
while ($true) {
    $t0 = Get-Date
    $proc = Start-Tunnel
    if ($proc) { $proc.WaitForExit() }
    $alive = ((Get-Date) - $t0).TotalSeconds
    $delay = if ($alive -lt 30) { 180 } else { 10 }
    Start-Sleep -Seconds $delay
}
