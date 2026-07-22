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
function Write-Warn  { param([string]$m) Write-Host "[!] $m" -ForegroundColor Yellow }
function Write-Fatal { param([string]$m) Write-Host "[XX] $m" -ForegroundColor Red; exit 1 }

Write-Host @"

  _   _        _
 | \ | |      (_)
 |  \| | __ _  ___   ____ _
 | . ` |/ _` |/ \ \ / / _` |
 | |\  | (_| | | \ V / (_| |
 |_| \_|\__,_|_|  \_/ \__,_|
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

$files = @{
    'docker-compose.yml'   = 'docker-compose.yml'
    '.env.example'         = '.env.example'
    'nginx/nginx.conf'     = 'nginx\nginx.conf'
    'turn/turnserver.conf' = 'turn\turnserver.conf'
    'VERSION'              = 'VERSION'
}

function Get-InstalledVersion {
    $f = Join-Path $InstallDir 'VERSION'
    if (Test-Path $f) { return (Get-Content $f -Raw).Trim() } else { return '0.0.0' }
}

function Get-LatestVersion {
    try { return (Invoke-WebRequest "$RAW/VERSION" -UseBasicParsing).Content.Trim() }
    catch { return $null }
}

function Test-VersionGreater {
    param([string]$New, [string]$Old)
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

function Get-EnvValue {
    param([string]$Key, [string]$Path = (Join-Path $InstallDir '.env'))
    if (-not (Test-Path $Path)) { return $null }
    foreach ($line in (Get-Content $Path)) {
        if ($line -match "^\s*$([regex]::Escape($Key))=(.*)$") { return $Matches[1] }
    }
    return $null
}

function Set-EnvValue {
    param([string]$Key, [string]$Value, [string]$Path = (Join-Path $InstallDir '.env'))
    $out   = New-Object System.Collections.Generic.List[string]
    $found = $false
    foreach ($line in (Get-Content $Path)) {
        if ($line -match "^\s*$([regex]::Escape($Key))=") {
            $out.Add("$Key=$Value"); $found = $true
        } else {
            $out.Add($line)
        }
    }
    if (-not $found) { $out.Add("$Key=$Value") }
    [System.IO.File]::WriteAllLines($Path, $out, (New-Object System.Text.UTF8Encoding($false)))
}

function Write-EnvFile {
    param([string]$Template, [string]$Path, [hashtable]$Values)
    $out  = New-Object System.Collections.Generic.List[string]
    $seen = @{}
    foreach ($line in (Get-Content $Template)) {
        $m = [regex]::Match($line, '^\s*([A-Za-z_][A-Za-z0-9_]*)=')
        if ($m.Success -and $Values.ContainsKey($m.Groups[1].Value)) {
            $key = $m.Groups[1].Value
            $out.Add("$key=$($Values[$key])")
            $seen[$key] = $true
        } else {
            $out.Add($line)
        }
    }
    foreach ($key in $Values.Keys) {
        if (-not $seen.ContainsKey($key)) { $out.Add("$key=$($Values[$key])") }
    }
    [System.IO.File]::WriteAllLines($Path, $out, (New-Object System.Text.UTF8Encoding($false)))
}

function Set-TurnConfig {
    param([string]$Secret)
    $conf = Join-Path $InstallDir 'turn\turnserver.conf'
    if (-not (Test-Path $conf) -or [string]::IsNullOrWhiteSpace($Secret)) { return }
    $lines = Get-Content $conf
    $lines = $lines -replace '^static-auth-secret=.*', "static-auth-secret=$Secret"
    $lines = $lines -replace '^realm=.*', 'realm=localhost'
    $lines = $lines -replace '^external-ip=.*', '# external-ip unset by the installer (checked-in value was a dev address)'
    [System.IO.File]::WriteAllLines($conf, $lines, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "    Stamped TURN secret into turn\turnserver.conf"
}

function Update-Najva {
    param([string]$To)
    Write-Step "Updating Najva to $To..."
    Set-Location $InstallDir
    Get-ConfigFiles
    Set-TurnConfig -Secret (Get-EnvValue 'TURN_SECRET')
    docker compose pull
    docker compose up -d
    if ($LASTEXITCODE -ne 0) { Write-Fatal "docker compose failed. See output above." }
    Write-OK "Updated to $To."
    Write-OK "Open: http://localhost"
    Write-OK "Admin Panel: http://localhost/admin"
}

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
    Write-Warn ".env already exists — keeping the existing secrets."
} else {
    $adminUser = Read-Host "  Admin username [admin]"
    if ([string]::IsNullOrWhiteSpace($adminUser)) { $adminUser = 'admin' }

    while ($true) {
        $secure1 = Read-Host "  Admin password (min 8 chars)" -AsSecureString
        $secure2 = Read-Host "  Confirm password" -AsSecureString
        $adminPass  = [System.Net.NetworkCredential]::new('', $secure1).Password
        $adminPass2 = [System.Net.NetworkCredential]::new('', $secure2).Password
        if ($adminPass -ne $adminPass2) { Write-Warn "Passwords do not match."; continue }
        if ($adminPass.Length -lt 8)    { Write-Warn "Password too short."; continue }
        break
    }

    $dbPassword = New-RandomSecret 24

    Write-EnvFile -Template '.env.example' -Path '.env' -Values @{
        'NODE_ENV'           = 'production'
        'POSTGRES_PASSWORD'  = $dbPassword
        'DATABASE_URL'       = "postgresql://najva:$dbPassword@postgres:5432/najva"
        'JWT_SECRET'         = New-RandomSecret 32
        'JWT_REFRESH_SECRET' = New-RandomSecret 32
        'SERVER_SECRET'      = New-RandomSecret 32
        'MEDIA_JWT_SECRET'   = New-RandomSecret 32
        'TURN_SECRET'        = New-RandomSecret 24
        'TURN_PASSWORD'      = New-RandomSecret 16
        'ADMIN_USERNAME'     = $adminUser
        'ADMIN_PASSWORD'     = $adminPass
    }

    Write-OK ".env created with generated secrets."
    Write-Warn "Back up $InstallDir\.env — losing it means losing access to encrypted data."
}

Set-TurnConfig -Secret (Get-EnvValue 'TURN_SECRET')

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

# ---- Step 7: Push notification keys -----------------------------------------
if ([string]::IsNullOrWhiteSpace((Get-EnvValue 'VAPID_PUBLIC_KEY'))) {
    Write-Step "Generating push notification keys..."
    $keys = docker compose exec -T server node -e "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey+' '+k.privateKey)" 2>$null
    $parts = if ($keys) { (($keys | Out-String).Trim() -split '\s+') } else { @() }
    if ($parts.Count -eq 2) {
        Set-EnvValue 'VAPID_PUBLIC_KEY'  $parts[0]
        Set-EnvValue 'VAPID_PRIVATE_KEY' $parts[1]
        docker compose up -d server | Out-Null
        Write-OK "Push keys generated."
    } else {
        Write-Warn "Could not generate VAPID keys; push notifications stay disabled."
    }
}

# ---- Step 8: Admin account --------------------------------------------------
Write-Step "Creating the admin account..."
docker compose exec -T server npx prisma db seed 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-OK "Admin account created."
} else {
    Write-Warn "Seeding failed. Check 'docker compose logs server', then re-run:"
    Write-Warn "    docker compose exec -T server npx prisma db seed"
}

# ---- Done -------------------------------------------------------------------
Write-Host ""
Write-OK "======================================"
Write-OK "  Najva is running!"
Write-OK "  Version: $(Get-InstalledVersion)"
Write-OK "  App URL: http://localhost"
Write-OK "  Admin Panel: http://localhost/admin"
Write-OK "  Install dir: $InstallDir"
Write-OK "======================================"
Write-Host ""

try { Start-Process 'http://localhost' } catch {}
