<#
.SYNOPSIS
    Self-check for the Windows installer's config-writing helpers.
.DESCRIPTION
    Run from the repository root:
        powershell -ExecutionPolicy Bypass -File scripts\najva-selftest.ps1

    Loads the helper functions out of install\install-windows.ps1 without
    executing the installer, then runs them against the repository's real
    .env.example and turn\turnserver.conf.

    The bug this guards against is silent no-ops: the original installer
    replaced placeholder strings that no longer existed in .env.example, so it
    reported success while leaving every published default in place. Asserting
    "the value changed" is the point — a passing syntax check would not have
    caught it.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo      = Split-Path -Parent $PSScriptRoot
$installer = Join-Path $repo 'install\install-windows.ps1'

# Pull just the function definitions out of the installer via its own parser, so
# the checks run against the shipped code rather than a copy that can drift.
$ast = [System.Management.Automation.Language.Parser]::ParseFile($installer, [ref]$null, [ref]$null)
$wanted = @('New-RandomSecret', 'Get-EnvValue', 'Set-EnvValue', 'Write-EnvFile', 'Set-TurnConfig')
foreach ($fn in $ast.FindAll({ param($n)
        $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
    if ($wanted -contains $fn.Name) { . ([scriptblock]::Create($fn.Extent.Text)) }
}

$script:fail = 0
function Check {
    param([string]$What, [bool]$Ok)
    if ($Ok) { Write-Host "  ok    $What" }
    else     { Write-Host "  FAIL  $What"; $script:fail = 1 }
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("najva-selftest-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'turn') | Out-Null
$InstallDir = $tmp   # Get-EnvValue and Set-TurnConfig resolve paths from this.

try {
    # --- Write-EnvFile against the real template ------------------------------

    $template = Join-Path $repo '.env.example'
    $envPath  = Join-Path $tmp '.env'
    $dbPass   = New-RandomSecret 24

    # Mirrors the key set the installer writes. Every key holding a published
    # default in .env.example has to be here, or a real default ships.
    Write-EnvFile -Template $template -Path $envPath -Values @{
        'POSTGRES_PASSWORD'  = $dbPass
        'DATABASE_URL'       = "postgresql://najva:$dbPass@postgres:5432/najva"
        'JWT_SECRET'         = 'jwt-test-value'
        'JWT_REFRESH_SECRET' = 'jwt-refresh-test-value'
        'SERVER_SECRET'      = 'server-test-value'
        'MEDIA_JWT_SECRET'   = 'media-test-value'
        'TURN_SECRET'        = 'turn-test-value'
        'TURN_PASSWORD'      = 'turn-password-test-value'
        'ADMIN_PASSWORD'     = 'admin-test-value'
    }

    Check "POSTGRES_PASSWORD is replaced"  ((Get-EnvValue 'POSTGRES_PASSWORD' $envPath) -eq $dbPass)
    Check "JWT_SECRET is replaced"         ((Get-EnvValue 'JWT_SECRET' $envPath) -eq 'jwt-test-value')
    Check "ADMIN_PASSWORD is replaced"     ((Get-EnvValue 'ADMIN_PASSWORD' $envPath) -eq 'admin-test-value')
    Check "DATABASE_URL carries the password" `
        ((Get-EnvValue 'DATABASE_URL' $envPath) -eq "postgresql://najva:$dbPass@postgres:5432/najva")

    # SERVER_SECRET is absent from .env.example; without the append it would
    # never be written and the server would use its hardcoded default.
    Check "SERVER_SECRET is appended"      ((Get-EnvValue 'SERVER_SECRET' $envPath) -eq 'server-test-value')

    # The actual regression: published defaults must not survive.
    $body = Get-Content $envPath -Raw
    Check "no 'change_me_in_production' left"  (-not ($body -match 'change_me_in_production'))
    Check "no 'your-super-secret' left"        (-not ($body -match 'your-super-secret'))
    Check "no 'change-me-' default left"       (-not ($body -match 'change-me-'))
    Check "no 'najva_turn_password' left"      (-not ($body -match 'najva_turn_password'))

    # Untouched keys must be carried through verbatim.
    Check "unlisted keys are preserved"    ((Get-EnvValue 'POSTGRES_DB' $envPath) -eq 'najva')

    # A BOM ahead of the first line breaks dotenv parsing.
    $firstBytes = [System.IO.File]::ReadAllBytes($envPath)[0..2]
    Check "written without a BOM" `
        (-not ($firstBytes[0] -eq 0xEF -and $firstBytes[1] -eq 0xBB -and $firstBytes[2] -eq 0xBF))

    # --- Set-EnvValue ---------------------------------------------------------

    # .env.example ships VAPID_PUBLIC_KEY= empty. Writing the generated key must
    # replace that line, not add a second one — dotenv takes the first match, so
    # a duplicate would leave push silently disabled.
    Check "VAPID_PUBLIC_KEY starts empty" ([string]::IsNullOrEmpty((Get-EnvValue 'VAPID_PUBLIC_KEY' $envPath)))

    Set-EnvValue 'VAPID_PUBLIC_KEY' 'vapid-public-test' $envPath
    Check "VAPID_PUBLIC_KEY is set" ((Get-EnvValue 'VAPID_PUBLIC_KEY' $envPath) -eq 'vapid-public-test')
    Check "no duplicate VAPID_PUBLIC_KEY line" `
        (@(Get-Content $envPath | Where-Object { $_ -match '^VAPID_PUBLIC_KEY=' }).Count -eq 1)

    # A key absent from the file has to be appended rather than dropped.
    Set-EnvValue 'A_BRAND_NEW_KEY' 'appended' $envPath
    Check "absent key is appended" ((Get-EnvValue 'A_BRAND_NEW_KEY' $envPath) -eq 'appended')

    # Overwriting twice must not accumulate lines.
    Set-EnvValue 'A_BRAND_NEW_KEY' 'second' $envPath
    Check "overwrite is idempotent" `
        (@(Get-Content $envPath | Where-Object { $_ -match '^A_BRAND_NEW_KEY=' }).Count -eq 1)
    Check "overwrite takes the new value" ((Get-EnvValue 'A_BRAND_NEW_KEY' $envPath) -eq 'second')

    # --- Set-TurnConfig against the real coturn config ------------------------

    $turnSrc = Join-Path $repo 'turn\turnserver.conf'
    $turnDst = Join-Path $tmp 'turn\turnserver.conf'

    # The committed file must not pin external-ip: coturn advertises it in relay
    # candidates, so any value here points every install at one dev machine.
    Check "committed turnserver.conf pins no external-ip" `
        (@(Get-Content $turnSrc | Where-Object { $_ -match '^external-ip=' }).Count -eq 0)

    Copy-Item $turnSrc $turnDst -Force

    Set-TurnConfig -Secret 'turn-test-secret' | Out-Null
    $turn = Get-Content $turnDst

    Check "static-auth-secret is stamped" `
        (@($turn | Where-Object { $_ -eq 'static-auth-secret=turn-test-secret' }).Count -eq 1)
    Check "checked-in TURN default is gone" `
        (@($turn -match 'dev-turn-static-auth-secret-change-in-prod').Count -eq 0)
    Check "realm is set" `
        (@($turn | Where-Object { $_ -eq 'realm=localhost' }).Count -eq 1)
    Check "dev external-ip is disabled" `
        (@($turn | Where-Object { $_ -match '^external-ip=' }).Count -eq 0)

    # An empty secret must leave the file alone rather than blanking the field.
    Copy-Item $turnSrc $turnDst -Force
    Set-TurnConfig -Secret '' | Out-Null
    Check "empty secret is a no-op" `
        ((Get-Content $turnDst -Raw) -eq (Get-Content $turnSrc -Raw))
}
finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
if ($script:fail -eq 0) { Write-Host "all checks passed" } else { Write-Host "FAILURES" }
exit $script:fail
