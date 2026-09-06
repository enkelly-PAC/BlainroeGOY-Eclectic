<#
.SYNOPSIS
    Step 1 of the Sunday workflow: ingest the new CSV scorecards into the
    live app's data file and deploy.

.DESCRIPTION
    What this does:
      1. Validates that the Results folder is reachable.
      2. Runs append-preload.js to load any new CSVs into js\preloaded-data.js
         and bump the version.
      3. Commits and pushes so GitHub Pages redeploys.
      4. Saves a tiny state file (tools\.last-ingest.json) recording how many
         CSVs were added; Step 2 reads this for the headline figure.

    After this finishes the live app has the new scores baked in. Open it,
    export the 5 leaderboard PDFs into PublishResults\, then run Step 2.

.PARAMETER NoPush
    If set, skip git commit/push (still updates files locally).

.EXAMPLE
    .\Step1-IngestCsvs.ps1

.EXAMPLE
    .\Step1-IngestCsvs.ps1 -NoPush
#>
[CmdletBinding()]
param(
    [switch]$NoPush
)

$ErrorActionPreference = 'Stop'

$RepoRoot   = Split-Path -Parent $PSScriptRoot
$ToolsDir   = $PSScriptRoot
$DesktopRoot = 'C:\Users\enkelly\OneDrive - Microsoft\Desktop\GoY_Ecclectic'
$ResultsDir = Join-Path $DesktopRoot 'Results'
$StateFile  = Join-Path $ToolsDir '.last-ingest.json'

function Write-Section {
    param([string]$Title)
    Write-Host ''
    Write-Host ('=== {0} ===' -f $Title) -ForegroundColor Cyan
}

# --- 1. Sanity check -----------------------------------------------------
Write-Section 'Step 1: Validating Results folder'

if (-not (Test-Path $ResultsDir)) {
    throw "Results folder not found: $ResultsDir"
}
$csvCount = (Get-ChildItem $ResultsDir -Filter *.csv -ErrorAction SilentlyContinue).Count
Write-Host ("  CSVs visible in Results folder: {0}" -f $csvCount)

# --- 2. Append new CSVs into preloaded-data.js ---------------------------
Write-Section 'Step 1: Appending new CSVs to preloaded-data.js'

Push-Location $RepoRoot
try {
    $preloadOutput = & node 'append-preload.js' 2>&1
    $preloadOutput | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) {
        throw "append-preload.js failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

# How many CSVs were appended this run?
$appendedCount = 0
$appendedFiles = @()
$match = $preloadOutput | Select-String -Pattern 'Successfully (?:appended|updated preloaded data:)\s*(\d+)(?: new CSV files| added)' | Select-Object -First 1
if ($match) {
    $appendedCount = [int]$match.Matches[0].Groups[1].Value
    $capture = $false
    foreach ($line in $preloadOutput) {
        $text = $line.ToString()
        if ($text -match '^New files to add') { $capture = $true; continue }
        if ($capture) {
            if ($text -match '^\s*-\s*(.+\.csv)') { $appendedFiles += $matches[1].Trim() }
            elseif ($text.Trim() -eq '') { $capture = $false }
        }
    }
}

# Persist state for Step 2 to read.
$state = [pscustomobject]@{
    timestamp       = (Get-Date).ToString('o')
    appended_count  = $appendedCount
    appended_files  = $appendedFiles
}
$state | ConvertTo-Json | Set-Content -Path $StateFile -Encoding UTF8
Write-Host ("  Wrote state file: {0}" -f $StateFile)

# --- 3. Git deploy -------------------------------------------------------
Write-Section 'Step 1: Git deploy'

if ($NoPush) {
    Write-Host '  -NoPush set; skipping git commit/push.'
} else {
    Push-Location $RepoRoot
    try {
        $status = & git status --porcelain
        if (-not $status) {
            Write-Host '  Nothing to commit.'
        } else {
            & git add -A | Out-Null
            $msg = "Weekly CSV ingest: $appendedCount new scorecards"
            & git commit -m $msg | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "git commit returned $LASTEXITCODE"
            } else {
                & git push
                if ($LASTEXITCODE -ne 0) {
                    Write-Warning "git push returned $LASTEXITCODE"
                } else {
                    Write-Host '  Pushed to origin; GitHub Pages will redeploy in ~1 to 2 minutes.'
                }
            }
        }
    } finally {
        Pop-Location
    }
}

# --- 4. Tell the user what to do next -----------------------------------
Write-Section 'Done with Step 1'
Write-Host ("  CSVs appended this run:  {0}" -f $appendedCount)
if ($appendedCount -gt 0) {
    Write-Host '  Files:'
    foreach ($f in $appendedFiles) { Write-Host "    - $f" }
}
Write-Host ''
Write-Host 'NEXT (Step 2):' -ForegroundColor Yellow
Write-Host '  1. Wait ~1 to 2 minutes for GitHub Pages to redeploy.'
Write-Host '  2. Open https://enkelly-pac.github.io/BlainroeGOY-Eclectic/'
Write-Host '  3. Export the 5 PDFs (Captain''s Gross, Captain''s Nett, GoY,'
Write-Host '     Gross Insights, Nett Insights) and save them into:'
Write-Host '       C:\Users\enkelly\OneDrive - Microsoft\Desktop\GoY_Ecclectic\PublishResults\'
Write-Host '  4. Then run:'
Write-Host "       .\tools\Step2-PublishNewsletter.ps1 -EventName 'July Medal'" -ForegroundColor Green
