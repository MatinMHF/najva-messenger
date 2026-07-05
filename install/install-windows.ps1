#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Najva Messenger — One-click installer for Windows
.DESCRIPTION
    Installs Docker Desktop if needed, generates secure .env secrets,
    builds and starts all Najva services via Docker Compose.
.NOTES
    Run as Administrator:
        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
        .\install\install-windows.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---- Colours ----
function Write-Step  { param([string]$msg) Write-Host "`n[>>] $msg" -ForegroundColor Cyan }
function Write-OK    { param([string]$msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "[!!] $msg" -ForegroundColor Yellow }
function Write-Fatal { param([string]$msg) Write-Host "[XX] $msg" -ForegroundColor Red; exit 1 }

# ---- Banner ----
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

# ---- Helpers ----
function New-RandomSecret {
    param([int]$bytes = 32)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $buf = New-Object byte[] $bytes
    $rng.GetBytes($buf)
    return [System.BitConverter]::ToString($buf).Replace('-', '').ToLower()
}

function Test-CommandExists {
    param([string]$cmd)
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

# ---- Root check ----
$currentPrincipal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Fatal "Please run this script as Administrator."
}

# ---- Step 1: Docker ----
Write-Step "Checking Docker..."

if (Test-CommandExists 'docker') {
    $dockerVersion = (docker version --format '{{.Server.Version}}' 2>$null)
    Write-OK "Docker found: v$dockerVersion"
} else {
    Write-Warn "Docker not found. Installing Docker Desktop..."

    if (Test-CommandExists 'winget') {
        winget install --id Docker.DockerDesktop --silent --accept-package-agreements --accept-source-agreements
    } else {
        # Fallback: download installer
        $installerUrl = 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe'
        $installerPath = "$env:TEMP\DockerDesktopInstaller.exe"
        Write-Host "    Downloading Docker Desktop..."
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
        Start-Process -FilePath $installerPath -ArgumentList 'install', '--quiet', '--accept-license' -Wait
        Remove-Item $installerPath -Force
    }

    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('PATH', 'User')

    if (-not (Test-CommandExists 'docker')) {
        Write-Warn "Docker Desktop was installed. Please restart your computer, then run this script again."
        exit 0
    }
    Write-OK "Docker Desktop installed."
}

# Ensure Docker daemon is running
try {
    docker info 2>&1 | Out-Null
    Write-OK "Docker daemon is running."
} catch {
    Write-Warn "Docker Desktop doesn't seem to be running. Attempting to start it..."
    $dockerPath = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerPath) {
        Start-Process $dockerPath
        Write-Host "    Waiting 30 s for Docker to start..."
        Start-Sleep -Seconds 30
    } else {
        Write-Fatal "Please start Docker Desktop manually and re-run this script."
    }
}

# ---- Step 2: Move to repo root ----
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
Write-OK "Working directory: $repoRoot"

# ---- Step 3: .env ----
Write-Step "Configuring environment..."

if (Test-Path '.env') {
    Write-Warn ".env already exists — skipping secret generation to avoid overwriting."
    Write-Warn "Delete .env and re-run if you want fresh secrets."
} else {
    if (-not (Test-Path '.env.example')) {
        Write-Fatal ".env.example not found. Are you running from the repo root?"
    }

    $jwtSecret     = New-RandomSecret 32
    $jwtRefresh    = New-RandomSecret 32
    $dbPassword    = New-RandomSecret 24
    $turnSecret    = New-RandomSecret 24

    (Get-Content '.env.example') `
        -replace 'change_me_strong_password', $dbPassword `
        -replace 'change_me_32_random_bytes_minimum', $jwtSecret `
        -replace 'change_me_another_32_random_bytes', $jwtRefresh `
        -replace 'change_me_turn_secret', $turnSecret `
        | Set-Content '.env'

    # Update DATABASE_URL too
    (Get-Content '.env') `
        -replace 'postgresql://najva:change_me_strong_password@', "postgresql://najva:${dbPassword}@" `
        | Set-Content '.env'

    Write-OK ".env created with generated secrets."
    Write-Warn "Back up your .env file! Losing it means losing access to encrypted data."
}

# ---- Step 4: Build & Start ----
Write-Step "Building and starting Najva services (this may take a few minutes)..."
docker compose up --build -d

if ($LASTEXITCODE -ne 0) {
    Write-Fatal "docker compose failed. Check the output above for errors."
}

# ---- Step 5: Health check ----
Write-Step "Waiting for services to be healthy..."
$maxWait = 60
$waited  = 0
do {
    Start-Sleep -Seconds 5
    $waited += 5
    $health = docker compose ps --format json 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
} while ($waited -lt $maxWait -and -not ($health | Where-Object { $_.Name -like '*server*' -and $_.Status -like '*healthy*' }))

# ---- Done ----
Write-Host ""
Write-OK "====================================="
Write-OK "  Najva is running!  "
Write-OK "  Open: http://localhost            "
Write-OK "====================================="
Write-Host ""

try {
    Start-Process 'http://localhost'
} catch {}
