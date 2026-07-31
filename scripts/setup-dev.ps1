[CmdletBinding()]
param(
    [switch]$Start,
    [switch]$ForceOdinDownload
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT') {
    throw 'Skald development setup currently supports Windows only.'
}

$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$UiRoot = Join-Path $RepoRoot 'skald-ui'
$ToolsRoot = Join-Path $RepoRoot '.tools'
$OdinVersion = 'dev-2025-02'
$OdinRoot = Join-Path $ToolsRoot "odin-$OdinVersion"
$DownloadRoot = Join-Path $ToolsRoot 'downloads'
$OdinArchive = Join-Path $DownloadRoot "odin-windows-amd64-$OdinVersion.zip"
$OdinUrl = "https://github.com/odin-lang/Odin/releases/download/$OdinVersion/odin-windows-amd64-$OdinVersion.zip"

function Assert-SafeChildPath {
    param([string]$Parent, [string]$Child)
    $parentFull = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
    $childFull = [IO.Path]::GetFullPath($Child)
    if (-not $childFull.StartsWith($parentFull, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing filesystem operation outside parent '$Parent': $Child"
    }
}

# Does this path actually run as an Odin compiler? Used before deciding whether
# an existing user-scope SKALD_ODIN is worth keeping - "the file exists" is not
# the same question, and a stale value pointing at a moved toolchain is exactly
# what we want to replace.
function Test-OdinExecutable {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    # Probing a broken compiler must not leave a non-zero $LASTEXITCODE behind:
    # this script's exit code is what `npm run setup:dev` reports, and a failed
    # probe is a normal, expected answer here - not a failed setup.
    $previousExit = if (Test-Path variable:LASTEXITCODE) { $LASTEXITCODE } else { 0 }
    try {
        & $Path version *> $null
        return ($LASTEXITCODE -eq 0)
    }
    catch {
        return $false
    }
    finally {
        $global:LASTEXITCODE = $previousExit
    }
}

function Invoke-Checked {
    param([string]$Label, [scriptblock]$Command)
    Write-Host ''
    Write-Host "==> $Label" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE."
    }
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $nodeCommand -or -not $npmCommand) {
    throw 'Node.js 22 and npm are required. Install Node 22, then run this script again.'
}

$nodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -ne 22) {
    throw "Skald v0.1.0 is pinned to Node 22; found $(& node --version)."
}

New-Item -ItemType Directory -Force -Path $ToolsRoot, $DownloadRoot | Out-Null
$odinExe = Get-ChildItem -LiteralPath $OdinRoot -Recurse -Filter odin.exe -File -ErrorAction SilentlyContinue | Select-Object -First 1

if ($ForceOdinDownload -or -not $odinExe) {
    Assert-SafeChildPath -Parent $ToolsRoot -Child $OdinRoot
    Assert-SafeChildPath -Parent $ToolsRoot -Child $OdinArchive
    if (Test-Path -LiteralPath $OdinRoot) {
        Remove-Item -LiteralPath $OdinRoot -Recurse -Force
    }
    if ($ForceOdinDownload -and (Test-Path -LiteralPath $OdinArchive)) {
        Remove-Item -LiteralPath $OdinArchive -Force
    }
    if (-not (Test-Path -LiteralPath $OdinArchive)) {
        Write-Host "Downloading Odin $OdinVersion..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri $OdinUrl -OutFile $OdinArchive
    }
    New-Item -ItemType Directory -Force -Path $OdinRoot | Out-Null
    Expand-Archive -LiteralPath $OdinArchive -DestinationPath $OdinRoot -Force
    $odinExe = Get-ChildItem -LiteralPath $OdinRoot -Recurse -Filter odin.exe -File | Select-Object -First 1
}

if (-not $odinExe) {
    throw "odin.exe was not found beneath $OdinRoot."
}

# Process scope keeps THIS shell working (npm start below inherits it).
$env:SKALD_ODIN = $odinExe.FullName
$env:PATH = "$($odinExe.DirectoryName);$env:PATH"
Invoke-Checked 'Odin version' { & $env:SKALD_ODIN version }

# ...and User scope keeps the NEXT shell working. Process scope alone
# evaporated the moment this shell closed - which is the very shell the closing
# message tells you to replace - so a developer who followed the documented
# setup opened a fresh terminal and got an editor whose preview could not find
# a compiler (SKB-057 / roadmap 3.12). Skald's resolver now also finds the
# vendored .tools copy on its own, so this is belt and braces rather than the
# only thing holding preview up.
Write-Host ''
Write-Host '==> Persist SKALD_ODIN for your user account' -ForegroundColor Cyan
$existingUserOdin = [Environment]::GetEnvironmentVariable('SKALD_ODIN', 'User')
if ($existingUserOdin -eq $odinExe.FullName) {
    Write-Host "SKALD_ODIN is already persisted for your user account: $existingUserOdin"
}
elseif (Test-OdinExecutable -Path $existingUserOdin) {
    # Someone else's working compiler is not ours to overwrite - but silence
    # here would be its own bug report ("why is preview using that Odin?").
    Write-Host 'LEAVING YOUR EXISTING SKALD_ODIN ALONE.' -ForegroundColor Yellow
    Write-Host "  Your user account already has SKALD_ODIN set to a working compiler:" -ForegroundColor Yellow
    Write-Host "    $existingUserOdin" -ForegroundColor Yellow
    Write-Host "  New shells will keep using that one, not the vendored toolchain at:" -ForegroundColor Yellow
    Write-Host "    $($odinExe.FullName)" -ForegroundColor Yellow
    Write-Host '  To switch, run:' -ForegroundColor Yellow
    Write-Host "    [Environment]::SetEnvironmentVariable('SKALD_ODIN', '$($odinExe.FullName)', 'User')" -ForegroundColor Yellow
}
else {
    if ($existingUserOdin) {
        Write-Host "Replacing a stale user-scope SKALD_ODIN that does not run: $existingUserOdin" -ForegroundColor Yellow
    }
    [Environment]::SetEnvironmentVariable('SKALD_ODIN', $odinExe.FullName, 'User')
    Write-Host "SKALD_ODIN persisted for your user account -> $($odinExe.FullName)" -ForegroundColor Green
    Write-Host 'Already-open shells will not see it; new ones will.'
}

Push-Location $UiRoot
try {
    Invoke-Checked 'Install exact npm dependencies' { & npm.cmd ci }
    Invoke-Checked 'Build the Odin code generator' { & npm.cmd run build:codegen }
    Write-Host ''
    Write-Host 'Skald development setup is ready.' -ForegroundColor Green
    Write-Host 'Run: cd skald-ui; npm start'
    Write-Host 'Use npm run start:rebuild after changing the Odin backend.'
    Write-Host "Odin in use: $env:SKALD_ODIN"
    Write-Host 'A new terminal works too: SKALD_ODIN is persisted for your user account, and'
    Write-Host 'Skald also resolves the vendored .tools toolchain on its own.'
    if ($Start) {
        Invoke-Checked 'Start Skald' { & npm.cmd start }
    }
}
finally {
    Pop-Location
}
