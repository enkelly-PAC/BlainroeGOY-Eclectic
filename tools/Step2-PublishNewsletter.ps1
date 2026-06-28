<#
.SYNOPSIS
    Step 2 of the Sunday workflow: turn the 5 freshly exported PDFs into a
    newsletter draft and deploy.

.DESCRIPTION
    What this does:
      1. Validates the 5 required leaderboard PDFs are present in
         PublishResults\ (or already staged in After<EventName>\).
      2. Stages the new PDFs into PublishResults\After<EventName>\.
      3. Extracts JSON from both the prior snapshot and the new snapshot.
      4. Generates a draft newsletter using the score-anchored delta logic.
      5. Saves the draft to OneDrive\AI Strategy\.
      6. Commits + pushes (so the snapshot PDFs are archived in the repo).

    The "scorecards added" headline figure is read from the state file Step 1
    wrote (tools\.last-ingest.json). Override with -ScorecardsAdded if needed.

.PARAMETER EventName
    Short label for this week's event (e.g. 'July Medal', 'WH Scott Trophy').
    Becomes the snapshot folder name (non-alphanumerics stripped) and is used
    in the newsletter intro. Quote it if it contains spaces.

.PARAMETER ScorecardsAdded
    Optional override for the scorecards-added headline figure. If omitted,
    Step 1's state file (tools\.last-ingest.json) is used.

.PARAMETER NoPush
    If set, skip git commit/push (still updates files locally).

.EXAMPLE
    .\Step2-PublishNewsletter.ps1 -EventName 'July Medal'

.EXAMPLE
    .\Step2-PublishNewsletter.ps1 -EventName 'WH Scott' -ScorecardsAdded 187 -NoPush
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$EventName,

    [Nullable[int]]$ScorecardsAdded = $null,

    [switch]$NoPush
)

$ErrorActionPreference = 'Stop'

$RepoRoot     = Split-Path -Parent $PSScriptRoot
$ToolsDir     = $PSScriptRoot
$DesktopRoot  = 'C:\Users\enkelly\OneDrive - Microsoft\Desktop\GoY_Ecclectic'
$PublishDir   = Join-Path $DesktopRoot 'PublishResults'
$DraftOutDir  = 'C:\Users\enkelly\OneDrive - Microsoft\AI Strategy'
$StateFile    = Join-Path $ToolsDir '.last-ingest.json'

$RequiredPdfs = @(
    "Captain's Eclectic Cup (Gross)",
    "Captain's Eclectic Cup (Nett)",
    'Golfer of the Year',
    'Gross Eclectic Insights',
    'Nett Eclectic Insights'
)

function Convert-EventSlug {
    param([string]$Name)
    $slug = ($Name -replace "[^A-Za-z0-9]", '')
    if ([string]::IsNullOrWhiteSpace($slug)) { $slug = 'Event' }
    return $slug
}

function Find-Pdf {
    param([string]$Folder, [string]$Pattern)
    Get-ChildItem -Path $Folder -Filter '*.pdf' -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "*$Pattern*" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

function Write-Section {
    param([string]$Title)
    Write-Host ''
    Write-Host ('=== {0} ===' -f $Title) -ForegroundColor Cyan
}

# --- 1. Validate PDFs ---------------------------------------------------
Write-Section 'Step 2: Validating PDFs'

if (-not (Test-Path $PublishDir)) {
    throw "PublishResults folder not found: $PublishDir"
}

$NewSnapshotName = "After$(Convert-EventSlug $EventName)"
$NewSnapshotDir  = Join-Path $PublishDir $NewSnapshotName

# Search the new snapshot folder first (idempotent re-run), then root.
$searchFolders = @()
if (Test-Path $NewSnapshotDir) { $searchFolders += $NewSnapshotDir }
$searchFolders += $PublishDir

$foundPdfs = [ordered]@{}
foreach ($pattern in $RequiredPdfs) {
    $hit = $null
    foreach ($folder in $searchFolders) {
        $hit = Find-Pdf -Folder $folder -Pattern $pattern
        if ($hit) { break }
    }
    if (-not $hit) {
        throw @"
Missing PDF matching '$pattern'.

Did you run Step 1 first, wait for the live app to redeploy, and then export
all 5 PDFs from https://enkelly-pac.github.io/BlainroeGOY-Eclectic/ into
'$PublishDir'?
"@
    }
    $foundPdfs[$pattern] = $hit
    Write-Host ("  OK  {0}  ->  {1}" -f $pattern, $hit.FullName)
}

# Warn if any of the new PDFs are older than the Step 1 state file (means
# they were exported from a still-stale app, so the deltas will be wrong).
$state = $null
if (Test-Path $StateFile) {
    $state = Get-Content $StateFile -Raw | ConvertFrom-Json
    $stateTime = [datetime]$state.timestamp
    foreach ($pdf in $foundPdfs.Values) {
        if ($pdf.LastWriteTime -lt $stateTime) {
            Write-Warning ("PDF '{0}' is OLDER than Step 1's CSV ingest at {1}. The newsletter will reflect stale data. Re-export this PDF from the live app and re-run." -f $pdf.Name, $stateTime)
        }
    }
}

# --- 2. Snapshot staging ------------------------------------------------
Write-Section 'Step 2: Staging snapshot'

$pdfsAreInRoot = $false
foreach ($pdf in $foundPdfs.Values) {
    if ($pdf.DirectoryName -eq $PublishDir) { $pdfsAreInRoot = $true; break }
}

if ($pdfsAreInRoot) {
    if (-not (Test-Path $NewSnapshotDir)) {
        New-Item -ItemType Directory -Path $NewSnapshotDir | Out-Null
    }
    $patterns = @($foundPdfs.Keys)
    foreach ($key in $patterns) {
        $src = $foundPdfs[$key]
        if ($src.DirectoryName -ne $PublishDir) { continue }
        $dest = Join-Path $NewSnapshotDir $src.Name
        if ($src.FullName -ne $dest) {
            if (Test-Path $dest) { Remove-Item $dest -Force }
            Move-Item -Path $src.FullName -Destination $dest
            Write-Host ("  Staged: {0}" -f $src.Name)
            $foundPdfs[$key] = Get-Item $dest
        }
    }
} else {
    Write-Host "  PDFs already in $NewSnapshotDir; skipping move."
}

# Prior snapshot is the most recently written After* folder, excluding the new one.
$priorSnapshot = Get-ChildItem -Path $PublishDir -Directory -Filter 'After*' |
    Where-Object { $_.FullName -ne $NewSnapshotDir } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $priorSnapshot) {
    throw "No prior snapshot folder found under $PublishDir. Cannot compute deltas."
}
Write-Host ("  Prior snapshot: {0}" -f $priorSnapshot.FullName)
Write-Host ("  New snapshot  : {0}" -f $NewSnapshotDir)

# --- 3. Extract ---------------------------------------------------------
Write-Section 'Step 2: Extracting leaderboard JSON'

$snapshotWork = Join-Path $env:TEMP "blainroe-weekly-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $snapshotWork | Out-Null
$priorJson = Join-Path $snapshotWork 'prior.json'
$newJson   = Join-Path $snapshotWork 'current.json'

& python (Join-Path $ToolsDir 'extract_leaderboards.py') $priorSnapshot.FullName $priorJson
if ($LASTEXITCODE -ne 0) { throw 'extract_leaderboards.py failed on prior snapshot.' }

& python (Join-Path $ToolsDir 'extract_leaderboards.py') $NewSnapshotDir $newJson
if ($LASTEXITCODE -ne 0) { throw 'extract_leaderboards.py failed on new snapshot.' }

# --- 4. Newsletter ------------------------------------------------------
Write-Section 'Step 2: Generating newsletter draft'

$timestamp = Get-Date -Format 'yyyyMMdd'
$slug      = Convert-EventSlug $EventName
$draftPath = Join-Path $DraftOutDir ("{0}_Newsletter_{1}.md" -f $slug, $timestamp)
if (-not (Test-Path $DraftOutDir)) { New-Item -ItemType Directory -Path $DraftOutDir | Out-Null }

# Resolve scorecards-added: explicit param > Step 1 state > auto-detect.
$scorecardsArg = ''
if ($PSBoundParameters.ContainsKey('ScorecardsAdded') -and $null -ne $ScorecardsAdded) {
    $scorecardsArg = [string]$ScorecardsAdded
    Write-Host ("  Scorecards (from -ScorecardsAdded): {0}" -f $scorecardsArg)
} elseif ($state -and $state.appended_count -gt 0) {
    $scorecardsArg = [string]$state.appended_count
    Write-Host ("  Scorecards (from Step 1 state): {0}" -f $scorecardsArg)
} else {
    Write-Host '  Scorecards: auto-detect from GoY snapshot delta.'
}

if ($scorecardsArg) {
    & python (Join-Path $ToolsDir 'generate_newsletter.py') $priorJson $newJson $EventName $draftPath $scorecardsArg
} else {
    & python (Join-Path $ToolsDir 'generate_newsletter.py') $priorJson $newJson $EventName $draftPath
}
if ($LASTEXITCODE -ne 0) { throw 'generate_newsletter.py failed.' }

# --- 5. Git deploy ------------------------------------------------------
Write-Section 'Step 2: Git deploy'

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
            $msg = "Weekly snapshot: $EventName"
            & git commit -m $msg | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "git commit returned $LASTEXITCODE"
            } else {
                & git push
                if ($LASTEXITCODE -ne 0) {
                    Write-Warning "git push returned $LASTEXITCODE"
                } else {
                    Write-Host '  Pushed to origin.'
                }
            }
        }
    } finally {
        Pop-Location
    }
}

# --- 6. Summary ---------------------------------------------------------
Write-Section 'Done'
Write-Host ("  Snapshot:        {0}" -f $NewSnapshotDir)
Write-Host ("  Prior snapshot:  {0}" -f $priorSnapshot.FullName)
Write-Host ("  Newsletter:      {0}" -f $draftPath)
Write-Host ("  Deltas JSON:     {0}" -f ($draftPath -replace '\.md$', '.deltas.json'))
Write-Host ''
Write-Host 'Open the draft, polish the wording, then it is ready to send.' -ForegroundColor Green
