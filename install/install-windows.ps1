#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Najva Messenger — One-click installer for Windows
.DESCRIPTION
    Downloads config files from GitHub (no clone needed), installs Docker Desktop
    if missing, generates secure .env secrets, and starts all Najva services.
.NOTES
    Run in PowerShell as Administrator:
        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
        irm https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/install/install-windows.ps1 | iex
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RAW = 'https://raw.githubusercontent.com/MatinMHF/najva-messenger/main'

function Write-Step  { param([string]$m) Write-Host "`n[>>] $m" -ForegroundColor Cyan }
function Write-OK    { param([string]$m) Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Warn  { param([string]$m) Write-Host "[!!] $m" -ForegroundColor Yellow }
function Write-Fatal { param([string]$m) Write-Host "[XX] $m" -ForegroundColor Red; exit 1 }

Write-Host @"

  _   _        _
 | \ | |      (_)
 |  \| | __ _  ___   ____ _
 | . ` |/ _` |/ \ \ / / _` |
 | |\  | (_| | | \ V / (_| |
 \_| \_/\__,_| |  \_/ \__,_|
            _/ |
           |__/

  Najva Messenger — Windows Installer
"@ -ForegroundColor Magenta

function New-RandomSecret {
    param([int]$bytes = 32)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $buf = New-Object byte[] $bytes
    $rng.GetBytes($buf)
    return [System.BitConverter]::ToString($buf).Replace('-','').ToLower()
}

function Test-Cmd { param([string]$c) return [bool](Get-Command $c -ErrorAction SilentlyContinue) }

# ---- Administrator check ----------------------------------------------------
$p = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Fatal "Please run PowerShell as Administrator and try again."
}

# ---- Existing installation --------------------------------------------------

$InstallDir = if ($env:NAJVA_DIR) { $env:NAJVA_DIR } else { "$env:USERPROFILE\najva" }

# Files fetched from GitHub, for both a fresh install and an update. VERSION is
# among them so an install records what it is, and a later run has something to
# compare against.
$files = @{
    'docker-compose.yml'   = 'docker-compose.yml'
    '.env.example'         = '.env.example'
    'nginx/nginx.conf'     = 'nginx\nginx.conf'
    'turn/turnserver.conf' = 'turn\turnserver.conf'
    'VERSION'              = 'VERSION'
}

function Get-InstalledVersion {
    $f = Join-Path $InstallDir 'VERSION'
    # Installs made before VERSION existed have no file, and must sort below
    # every real release so an update is still offered.
    if (Test-Path $f) { return (Get-Content $f -Raw).Trim() } else { return '0.0.0' }
}

function Get-LatestVersion {
    # Returns $null when offline, so the caller can tell "already up to date"
    # apart from "could not check".
    try { return (Invoke-WebRequest "$RAW/VERSION" -UseBasicParsing).Content.Trim() }
    catch { return $null }
}

function Test-VersionGreater {
    param([string]$New, [string]$Old)
    # [version] compares numerically, so 1.10.0 really is newer than 1.9.0 —
    # a plain string compare gets that backwards.
    try { return ([version]$New) -gt ([version]$Old) }
    catch { return $New -ne $Old }
}

function Get-ConfigFiles {
    foreach ($remote in $files.Keys) {
        $local = $files[$remote]
        $dir = Split-Path -Parent $local
        if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Invoke-WebRequest "$RAW/$remote" -OutFile $local -UseBasicParsing
        Write-Host "    Downloaded $local"
    }
}

function Update-Najva {
    param([string]$To)
    Write-Step "Updating Najva to $To..."
    Set-Location $InstallDir
    # .env is deliberately not in $files: the generated secrets and the admin
    # credentials have to survive the update untouched.
    Get-ConfigFiles
    docker compose pull
    docker compose up -d
    if ($LASTEXITCODE -ne 0) { Write-Fatal "docker compose failed. See output above." }
    Write-OK "Updated to $To."
    Write-OK "Open: http://localhost"
}

# A finished install leaves .env and the compose file behind. Re-running the
# installer over that would pull fresh config down on top of a live deployment,
# so stop here and offer an update instead.
if ((Test-Path (Join-Path $InstallDir '.env')) -and
    (Test-Path (Join-Path $InstallDir 'docker-compose.yml'))) {

    $current = Get-InstalledVersion
    $latest  = Get-LatestVersion

    if ($latest -and (Test-VersionGreater $latest $current)) {
        Write-Host ""
        Write-Warn "Najva $current is installed at $InstallDir; version $latest is available."
        $answer = Read-Host "  Do you want to update? [y/N]"
        if ($answer -match '^[Yy]') {
            Update-Najva -To $latest
            exit 0
        }
        Write-OK "Left unchanged."
        exit 0
    }

    Write-Host ""
    Write-OK "You already have it installed."
    Write-Host "  Version $current at $InstallDir"
    if ($null -eq $latest) {
        Write-Warn "Could not check for a newer version. Are you online?"
    } else {
        Write-Host "  Already up to date."
    }
    exit 0
}

# ---- Step 1: Docker ---------------------------------------------------------
Write-Step "Checking Docker..."

if (Test-Cmd 'docker') {
    $v = docker version --format '{{.Server.Version}}' 2>$null
    Write-OK "Docker v$v found."
} else {
    Write-Warn "Docker not found. Installing Docker Desktop via winget..."
    if (Test-Cmd 'winget') {
        winget install --id Docker.DockerDesktop --silent --accept-package-agreements --accept-source-agreements
    } else {
        $tmp = "$env:TEMP\DockerDesktopInstaller.exe"
        Write-Host "    Downloading Docker Desktop installer..."
        Invoke-WebRequest 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe' -OutFile $tmp -UseBasicParsing
        Start-Process -FilePath $tmp -ArgumentList 'install','--quiet','--accept-license' -Wait
        Remove-Item $tmp -Force
    }
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('PATH','User')
    if (-not (Test-Cmd 'docker')) {
        Write-Warn "Docker Desktop installed. Please restart your PC then re-run this script."
        exit 0
    }
    Write-OK "Docker Desktop installed."
}

try { docker info 2>&1 | Out-Null; Write-OK "Docker daemon running." }
catch {
    $dockerExe = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) {
        Write-Warn "Starting Docker Desktop..."
        Start-Process $dockerExe
        Write-Host "    Waiting 40 s for daemon..."
        Start-Sleep 40
    } else { Write-Fatal "Start Docker Desktop manually then re-run." }
}

# ---- Step 2: Install directory ----------------------------------------------
Write-Step "Creating install directory: $InstallDir"
New-Item -ItemType Directory -Force -Path "$InstallDir\nginx" | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\turn"  | Out-Null
Set-Location $InstallDir
Write-OK "Working directory: $InstallDir"

# ---- Step 3: Download config files ------------------------------------------
Write-Step "Downloading configuration files from GitHub..."

Get-ConfigFiles
Write-OK "Config files downloaded."

# ---- Step 4: .env -----------------------------------------------------------
Write-Step "Configuring environment..."

if (Test-Path '.env') {
    Write-Warn ".env already exists — skipping secret generation."
} else {
    $jwtSecret  = New-RandomSecret 32
    $jwtRefresh = New-RandomSecret 32
    $dbPassword = New-RandomSecret 24
    $turnSecret = New-RandomSecret 24

    (Get-Content '.env.example') `
        -replace 'change_me_strong_password',          $dbPassword `
        -replace 'change_me_32_random_bytes_minimum',  $jwtSecret `
        -replace 'change_me_another_32_random_bytes',  $jwtRefresh `
        -replace 'change_me_turn_secret',              $turnSecret `
        | Set-Content '.env'

    # Fix DATABASE_URL too
    (Get-Content '.env') -replace `
        'postgresql://najva:change_me_strong_password@', `
        "postgresql://najva:${dbPassword}@" | Set-Content '.env'

    Write-OK ".env created with generated secrets."
    Write-Warn "Back up $InstallDir\.env — losing it means losing access to encrypted data."
}

# ---- Step 5: Pull & Start ---------------------------------------------------
Write-Step "Pulling images and starting Najva services (first run may take several minutes)..."
docker compose up -d --pull always

if ($LASTEXITCODE -ne 0) { Write-Fatal "docker compose failed. See output above." }

# ---- Step 6: Health check ---------------------------------------------------
Write-Step "Waiting for services to become healthy..."
$waited = 0
do {
    Start-Sleep 5; $waited += 5
    $ps = docker compose ps --format json 2>$null
} while ($waited -lt 60 -and -not ($ps -match 'healthy'))

# ---- Done -------------------------------------------------------------------
Write-Host ""
Write-OK "====================================="
Write-OK "  Najva is running!"
Write-OK "  Version: $(Get-InstalledVersion)"
Write-OK "  Open: http://localhost"
Write-OK "  Install dir: $InstallDir"
Write-OK "====================================="
Write-Host ""

try { Start-Process 'http://localhost' } catch {}
