<#
.SYNOPSIS
    Run every Skald gate against a PRISTINE checkout of a git ref, so you can
    tell "I broke this" apart from "this was already broken".

.DESCRIPTION
    Three separate times during roadmap Wave B, an agent hit a red gate and had
    to stop and work out whether it was responsible. Twice the answer was no:
    `odin test tests\unit` had not compiled for some time, and
    run_corpus_golden.bat had a batch-parsing bug that made its failure counter
    increment for every fixture that PASSED. A third time an agent concluded the
    UI test baseline was 684 tests when it was 573, because it counted another
    agent's untracked files as pre-existing and then reported a fabricated
    regression-free delta against its own wrong number.

    Every one of those cost real time, and every one is answered by the same
    move: run the gates somewhere your changes are not.

    This script exports `-Ref` with `git archive` into a temp directory (so it
    is exactly what is committed — no untracked files, no working-tree edits),
    junctions in skald-ui/node_modules so the UI suite can run without a fresh
    npm install, runs every gate, and prints the numbers.

    It never writes to your working tree and never runs any gate's `update` mode.

.PARAMETER Ref
    Git ref to test. Defaults to HEAD.

.PARAMETER Keep
    Keep the exported tree and print its path (for poking at a failure).

.PARAMETER SkipUi
    Skip the UI gates (vitest/tsc/lint). The backend gates alone take ~1 minute;
    the UI suite adds a few more.

.EXAMPLE
    .\scripts\verify-baseline.ps1
    What do the gates say about what is committed right now?

.EXAMPLE
    .\scripts\verify-baseline.ps1 -Ref HEAD~1
    Was this gate already red before my commit?

.EXAMPLE
    .\scripts\verify-baseline.ps1 -Ref 35a1654 -SkipUi
    Was it already red before this whole line of work started?
#>
[CmdletBinding()]
param(
    [string]$Ref = 'HEAD',
    [switch]$Keep,
    [switch]$SkipUi
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sha = (& git -C $repo rev-parse --short $Ref).Trim()
if ($LASTEXITCODE -ne 0) { throw "Not a git ref: $Ref" }
$subject = (& git -C $repo log -1 --format=%s $Ref).Trim()

$work = Join-Path ([System.IO.Path]::GetTempPath()) "skald-baseline-$sha-$PID"
if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Path $work | Out-Null

Write-Host ''
Write-Host "Skald baseline verification" -ForegroundColor Cyan
Write-Host "  ref     : $Ref -> $sha" -ForegroundColor Cyan
Write-Host "  subject : $subject" -ForegroundColor Cyan
Write-Host "  tree    : $work (pristine `git archive` export, no working-tree files)" -ForegroundColor Cyan
Write-Host ''

# `git archive` gives exactly the committed tree. A plain file copy would drag
# in the working tree's edits and untracked files, which is the mistake that
# produced the fabricated 684-test baseline.
#
# Via a file, not a pipe: PowerShell pipes are text streams and re-encode the
# bytes, so `git archive | tar -x` hands tar a corrupted archive.
$tarball = Join-Path ([System.IO.Path]::GetTempPath()) "skald-baseline-$sha-$PID.tar"
& git -C $repo archive --format=tar -o $tarball $Ref
if ($LASTEXITCODE -ne 0) { throw "git archive failed for $Ref" }
# Full path to the Windows tar, deliberately. If this script is launched from a
# Git Bash shell, `tar` resolves to Git's MSYS tar, which reads the `C:` in
# `-C C:\...` as a remote hostname and fails with "Cannot connect to C".
$tarExe = Join-Path $env:SystemRoot 'System32\tar.exe'
if (-not (Test-Path $tarExe)) { $tarExe = 'tar' }
& $tarExe -x -f $tarball -C $work
if ($LASTEXITCODE -ne 0) { throw "tar extract failed for $Ref" }
Remove-Item -Force $tarball -ErrorAction SilentlyContinue

# Past this point every failure is reported in the table, not thrown: a red
# gate is the expected output of this script, not an error in it.
$ErrorActionPreference = 'Continue'

$results = [System.Collections.Generic.List[object]]::new()
function Add-Result($gate, $expected, $actual, $ok) {
    $results.Add([pscustomobject]@{ Gate = $gate; Result = $actual; Status = (@('RED', 'green')[[int][bool]$ok]) })
}

# --- Backend -------------------------------------------------------------
$be = Join-Path $work 'skald-backend'

function Invoke-Bat($dir, $bat) {
    # The `.\` prefix is required: `cmd /c "run_acceptance.bat"` fails to find it.
    # Redirect INSIDE cmd: these harnesses print warnings to stderr, and a
    # PowerShell-level `2>&1` surfaces those as NativeCommandError.
    Push-Location $dir
    try { return @((& cmd /c ".\$bat 2>&1") | ForEach-Object { [string]$_ }) } finally { Pop-Location }
}

Write-Host '[1/5] acceptance (FFT behaviour)...' -NoNewline
$o = Invoke-Bat $be 'run_acceptance.bat'
$m = $o | Select-String -Pattern 'All (\d+) fixtures passed' | Select-Object -First 1
if ($m) { $r = "$($m.Matches[0].Groups[1].Value)/$($m.Matches[0].Groups[1].Value) passed"; $ok = $true }
else { $r = (($o | Select-String -Pattern 'FAIL|failed' | Select-Object -First 1) -replace '\s+', ' '); if (-not $r) { $r = 'no summary line' }; $ok = $false }
Add-Result 'acceptance' '' $r $ok
Write-Host " $r"

Write-Host '[2/5] goldens + determinism double-run...' -NoNewline
$o = Invoke-Bat $be 'run_golden.bat'
$m = $o | Select-String -Pattern 'All (\d+) goldens match, and all (\d+) emit identically' | Select-Object -First 1
if ($m) { $r = "$($m.Matches[0].Groups[1].Value) match, $($m.Matches[0].Groups[2].Value) deterministic"; $ok = $true }
else { $r = (($o | Select-String -Pattern 'differ|MISSING' | Select-Object -First 1) -replace '\s+', ' '); if (-not $r) { $r = 'no summary line' }; $ok = $false }
Add-Result 'goldens' '' $r $ok
Write-Host " $r"

Write-Host '[3/5] backend unit (odin test)...' -NoNewline
Push-Location $be
try {
    # Exit code, not text matching. `odin test` draws a live progress bar with
    # carriage returns and prints a wall of tracking-allocator leak reports, and
    # every attempt to pattern-match its verdict line produced a FALSE RED here
    # -- the one failure mode this script must never have. The count below is
    # best-effort display only; the verdict is the exit code.
    $o = @((& cmd /c 'odin test tests\unit 2>&1') | ForEach-Object { [string]$_ })
    $code = $LASTEXITCODE
}
finally { Pop-Location }
$joined = $o -join "`n"
$count = if ($joined -match 'Finished\s+(\d+)\s+tests') { $Matches[1] } else { '?' }
$errs = ([regex]::Matches($joined, '\bError:')).Count
if ($code -eq 0) { $r = "$count/$count passed"; $ok = $true }
elseif ($errs -gt 0) { $r = "DID NOT COMPILE ($errs errors)"; $ok = $false }
else { $r = "exit $code - last line: " + ((($o | Where-Object { $_ -match '\S' } | Select-Object -Last 1) -replace '\s+', ' ')); $ok = $false }
Add-Result 'backend unit' '' $r $ok
Write-Host " $r"

# --- UI ------------------------------------------------------------------
if ($SkipUi) {
    Write-Host '[4/5] UI gates... skipped (-SkipUi)'
}
else {
    $ui = Join-Path $work 'skald-ui'
    $nm = Join-Path $ui 'node_modules'
    $srcNm = Join-Path $repo 'skald-ui\node_modules'
    if (-not (Test-Path $srcNm)) { throw "No skald-ui/node_modules to junction from. Run npm install in the real tree first." }
    # A junction, not a copy: node_modules is not tracked, so the exported tree
    # has none, and copying it would take minutes.
    & cmd /c "mklink /J `"$nm`" `"$srcNm`"" | Out-Null

    Write-Host '[4/5] UI tests (vitest)...' -NoNewline
    Push-Location $ui
    try { $o = & cmd /c 'npx vitest run --reporter=dot 2>&1' } finally { Pop-Location }
    $tf = $o | Select-String -Pattern 'Test Files\s+(\d+) passed \((\d+)\)' | Select-Object -First 1
    $tt = $o | Select-String -Pattern 'Tests\s+(\d+) passed \((\d+)\)' | Select-Object -First 1
    if ($tf -and $tt) {
        $r = "$($tt.Matches[0].Groups[1].Value)/$($tt.Matches[0].Groups[2].Value) tests, $($tf.Matches[0].Groups[1].Value) files"
        $ok = ($tt.Matches[0].Groups[1].Value -eq $tt.Matches[0].Groups[2].Value)
    }
    else { $r = 'no summary line'; $ok = $false }
    Add-Result 'UI tests' '' $r $ok
    Write-Host " $r"

    Write-Host '[5/5] typecheck + lint...' -NoNewline
    Push-Location $ui
    try {
        $ts = & cmd /c 'npx tsc --noEmit 2>&1'
        $lt = & cmd /c 'npm run lint 2>&1'
    }
    finally { Pop-Location }
    $tsN = ($ts | Select-String -Pattern 'error TS' | Measure-Object).Count
    $ltM = $lt | Select-String -Pattern '(\d+) problems? \((\d+) errors?' | Select-Object -First 1
    $ltN = if ($ltM) { [int]$ltM.Matches[0].Groups[2].Value } else { 0 }
    # 1 tsc + 2 lint is the long-standing forge.env baseline; see TESTING.md.
    $ok = ($tsN -le 1 -and $ltN -le 2)
    $r = "tsc $tsN error(s), lint $ltN error(s)"
    Add-Result 'typecheck/lint' '' $r $ok
    Write-Host " $r"
}

# --- Report --------------------------------------------------------------
Write-Host ''
Write-Host "Gates at $sha ($Ref)" -ForegroundColor Cyan
$results | Format-Table -AutoSize | Out-String | Write-Host
Write-Host 'Compare these numbers against your working tree BEFORE concluding you'
Write-Host 'caused a failure -- and before concluding you did not.'
Write-Host 'Known-red-at-baseline gates are listed in TESTING.md.'
Write-Host ''

if ($Keep) { Write-Host "Tree kept at: $work" -ForegroundColor Yellow }
else { Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue }

if ($results.Where({ $_.Status -eq 'RED' }).Count -gt 0) { exit 1 }
exit 0
