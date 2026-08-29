param(
    [string]$Server = "192.168.0.144",
    [string]$RemoteUser = "IMPRESACINGOLI\administrator"
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $workspace "remote-update.log"
$resultPath = Join-Path $workspace "remote-update-result.json"
Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue

$remoteScript = @'
$ErrorActionPreference = "Stop"

function Assert-LastExitCode([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step non riuscito (codice $LASTEXITCODE)"
    }
}

$appContainer = docker ps --filter "label=com.docker.compose.service=app" --format "{{.ID}}" | Select-Object -First 1
Assert-LastExitCode "Ricerca container applicativo"
if (-not $appContainer) {
    throw "Container applicativo Candidature Hub non trovato"
}

$projectDir = (docker inspect $appContainer --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}').Trim()
Assert-LastExitCode "Lettura cartella progetto"
if (-not $projectDir -or -not (Test-Path -LiteralPath $projectDir)) {
    throw "Cartella del progetto Docker non trovata: $projectDir"
}

Set-Location -LiteralPath $projectDir
$remoteUrl = (git remote get-url origin).Trim()
Assert-LastExitCode "Verifica repository"
if ($remoteUrl -notmatch "Dis-Astro/Candidature-Hub") {
    throw "Repository remoto inatteso: $remoteUrl"
}

$dirty = git status --porcelain
Assert-LastExitCode "Controllo modifiche locali"
if ($dirty) {
    throw "Il server contiene modifiche locali non pubblicate; aggiornamento interrotto per non sovrascriverle"
}

Write-Host "[1/5] Creo il backup completo di database e documenti..." -ForegroundColor Cyan
$backup = docker compose exec -T app sh /opt/candidature-hub/scripts/backup.sh /data/backups
Assert-LastExitCode "Backup"
$backupPath = ($backup | Select-Object -Last 1).Trim()

Write-Host "[2/5] Sincronizzo il repository con GitHub..." -ForegroundColor Cyan
git fetch --prune origin
Assert-LastExitCode "Git fetch"
git merge --ff-only origin/main
Assert-LastExitCode "Aggiornamento Git"
$commit = (git rev-parse HEAD).Trim()

Write-Host "[3/5] Ricostruisco le immagini Docker..." -ForegroundColor Cyan
docker compose build
Assert-LastExitCode "Build Docker"

Write-Host "[4/5] Aggiorno i servizi preservando i volumi..." -ForegroundColor Cyan
docker compose up -d --remove-orphans
Assert-LastExitCode "Avvio Docker"

Write-Host "[5/5] Attendo il controllo di salute..." -ForegroundColor Cyan
$healthy = $false
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    $appContainer = docker ps --filter "label=com.docker.compose.service=app" --format "{{.ID}}" | Select-Object -First 1
    if ($appContainer) {
        $status = (docker inspect $appContainer --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}').Trim()
        if ($status -eq "healthy") {
            $healthy = $true
            break
        }
    }
    Start-Sleep -Seconds 2
}
if (-not $healthy) {
    docker compose ps
    docker compose logs --tail=100 app parser mail-worker
    throw "La webapp non ha raggiunto lo stato healthy"
}

$health = Invoke-RestMethod -Uri "http://127.0.0.1:3031/health" -TimeoutSec 15
if (-not $health.ok -or $health.database -ne "ok") {
    throw "Controllo applicativo non riuscito"
}

docker compose ps
Write-Host "AGGIORNAMENTO COMPLETATO" -ForegroundColor Green
Write-Host "Commit: $commit"
Write-Host "Backup: $backupPath"
'@

$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remoteScript))
$startedAt = Get-Date

Start-Transcript -LiteralPath $logPath -Force | Out-Null
try {
    Write-Host "Connessione a $Server come $RemoteUser" -ForegroundColor Cyan
    Write-Host "Inserisci la password del server quando richiesta." -ForegroundColor Yellow
    & ssh -tt -o StrictHostKeyChecking=yes -l $RemoteUser $Server "powershell.exe -NoProfile -EncodedCommand $encoded"
    $exitCode = $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    $exitCode = 1
} finally {
    Stop-Transcript | Out-Null
    [ordered]@{
        server = $Server
        user = $RemoteUser
        startedAt = $startedAt.ToString("o")
        completedAt = (Get-Date).ToString("o")
        exitCode = $exitCode
        log = $logPath
    } | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
}

if ($exitCode -eq 0) {
    Write-Host "La finestra può essere chiusa." -ForegroundColor Green
} else {
    Write-Host "Aggiornamento non completato. Lascia aperta questa finestra per leggere l'errore." -ForegroundColor Red
}
exit $exitCode
