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

$env:SKALD_ODIN = $odinExe.FullName
$env:PATH = "$($odinExe.DirectoryName);$env:PATH"
Invoke-Checked 'Odin version' { & $env:SKALD_ODIN version }

Push-Location $UiRoot
try {
    Invoke-Checked 'Install exact npm dependencies' { & npm.cmd ci }
    Invoke-Checked 'Build the Odin code generator' { & npm.cmd run build:codegen }
    Write-Host ''
    Write-Host 'Skald development setup is ready.' -ForegroundColor Green
    Write-Host 'Run: cd skald-ui; npm start'
    Write-Host 'Use npm run start:rebuild after changing the Odin backend.'
    if ($Start) {
        Invoke-Checked 'Start Skald' { & npm.cmd start }
    }
}
finally {
    Pop-Location
}
