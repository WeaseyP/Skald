[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$AllowDirty
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT') {
    throw 'The v0.1.0 release pipeline currently supports Windows only.'
}

$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$UiRoot = Join-Path $RepoRoot 'skald-ui'
$BackendRoot = Join-Path $RepoRoot 'skald-backend'
$Package = Get-Content -LiteralPath (Join-Path $UiRoot 'package.json') -Raw | ConvertFrom-Json
$Version = [string]$Package.version
$ReleaseRoot = Join-Path $RepoRoot 'release'
$ReleaseDir = Join-Path $ReleaseRoot "v$Version\windows-x64"
$MakeRoot = Join-Path $UiRoot 'out\make'

function Assert-SafeChildPath {
    param([string]$Parent, [string]$Child)
    $parentFull = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
    $childFull = [IO.Path]::GetFullPath($Child)
    if (-not $childFull.StartsWith($parentFull, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing filesystem operation outside parent '$Parent': $Child"
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

if (-not $AllowDirty) {
    $dirty = & git -C $RepoRoot status --porcelain
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the Git worktree.' }
    if ($dirty) {
        throw 'Release builds require a clean worktree. Commit or stash changes, or pass -AllowDirty for local verification.'
    }
}

$nodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -ne 22) {
    throw "Skald v$Version is pinned to Node 22; found $(& node --version)."
}

$odinExe = $null
if ($env:SKALD_ODIN -and (Test-Path -LiteralPath $env:SKALD_ODIN)) {
    $odinExe = Get-Item -LiteralPath $env:SKALD_ODIN
}
if (-not $odinExe) {
    $odinCommand = Get-Command odin.exe -ErrorAction SilentlyContinue
    if ($odinCommand) { $odinExe = Get-Item -LiteralPath $odinCommand.Source }
}
if (-not $odinExe) {
    $odinExe = Get-ChildItem -LiteralPath (Join-Path $RepoRoot '.tools') -Recurse -Filter odin.exe -File -ErrorAction SilentlyContinue | Select-Object -First 1
}
if (-not $odinExe) {
    throw 'Odin was not found. Run .\scripts\setup-dev.ps1 first.'
}

$env:SKALD_ODIN = $odinExe.FullName
$env:PATH = "$($odinExe.DirectoryName);$env:PATH"
Invoke-Checked 'Odin version' { & $env:SKALD_ODIN version }

Push-Location $UiRoot
try {
    if (-not $SkipInstall) {
        Invoke-Checked 'Install exact npm dependencies' { & npm.cmd ci }
    }
    Invoke-Checked 'Production dependency audit' { & npm.cmd audit --omit=dev }
    Invoke-Checked 'Build the Odin code generator' { & npm.cmd run build:codegen }
}
finally { Pop-Location }

Push-Location $BackendRoot
try {
    Invoke-Checked 'Backend acceptance suite' { & cmd.exe /d /c run_acceptance.bat }
    Invoke-Checked 'Backend golden snapshots' { & cmd.exe /d /c run_golden.bat check }
}
finally { Pop-Location }

Push-Location $UiRoot
try {
    Invoke-Checked 'UI lint' { & npm.cmd run lint }
    Invoke-Checked 'UI typecheck' { & npm.cmd run typecheck }
    Invoke-Checked 'UI tests' { & npm.cmd test }
    Invoke-Checked 'Windows installer and ZIP' { & npm.cmd run make:win }
}
finally { Pop-Location }

Assert-SafeChildPath -Parent $ReleaseRoot -Child $ReleaseDir
if (Test-Path -LiteralPath $ReleaseDir) {
    Remove-Item -LiteralPath $ReleaseDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

$assets = Get-ChildItem -LiteralPath $MakeRoot -Recurse -File | Where-Object {
    $_.Extension -in '.exe', '.nupkg', '.zip' -or $_.Name -eq 'RELEASES'
}
if (-not $assets) {
    throw "No release artifacts were found beneath $MakeRoot."
}
foreach ($asset in $assets) {
    Copy-Item -LiteralPath $asset.FullName -Destination (Join-Path $ReleaseDir $asset.Name)
}

$hashLines = Get-ChildItem -LiteralPath $ReleaseDir -File | Sort-Object Name | ForEach-Object {
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $($_.Name)"
}
Set-Content -LiteralPath (Join-Path $ReleaseDir 'SHA256SUMS.txt') -Value $hashLines -Encoding ascii

Write-Host ''
Write-Host "Skald v$Version release artifacts:" -ForegroundColor Green
Get-ChildItem -LiteralPath $ReleaseDir -File | Sort-Object Name | Format-Table Name, Length
Write-Host "Output: $ReleaseDir"
