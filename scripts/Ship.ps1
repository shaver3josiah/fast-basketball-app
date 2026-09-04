<#
.SYNOPSIS
    Commit, push, tag, and release Fast Basketball.

.DESCRIPTION
    Pushing a v* tag is what fires the two release workflows: android-apk.yml
    (downloadable .apk) and ios-testflight.yml (TestFlight build). This script
    does the git part so you never have to remember it.

.EXAMPLE
    .\scripts\Ship.ps1
    Commits everything, pushes, and tags the next patch version.

.EXAMPLE
    .\scripts\Ship.ps1 -Version 1.2.0 -Message "New drill screen"

.NOTES
    Windows PowerShell 5.1 has no '&&' or '||' operators. They are PARSER errors,
    not style problems, so every command here is a separate statement whose exit
    code is checked with $LASTEXITCODE.
#>

[CmdletBinding()]
param(
    # Version to tag, with or without the leading 'v'. Omit to bump the patch number.
    [string] $Version,

    # Commit message for whatever is currently uncommitted.
    [string] $Message = "Ship"
)

$ErrorActionPreference = 'Stop'

# Run from the repo root no matter where the script was invoked from.
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Invoke-Step {
    param(
        [string] $What,
        [scriptblock] $Command
    )
    Write-Host ""
    Write-Host "==> $What" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "FAILED: $What (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
}

# Nothing below works without a remote, and the failure messages if one is missing
# are confusing, so say it plainly up front.
$remotes = git remote
if ([string]::IsNullOrWhiteSpace($remotes)) {
    Write-Host "No git remote is configured." -ForegroundColor Red
    Write-Host "Create the GitHub repo, then run:" -ForegroundColor Yellow
    Write-Host "    git remote add origin https://github.com/<you>/fast-basketball-app.git"
    exit 1
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()

Invoke-Step "Staging all changes" { git add -A }

# 'git commit' exits non-zero when there is nothing staged. That is a normal state
# (for example re-tagging an unchanged tree), not a failure, so check first.
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    Invoke-Step "Committing" { git commit -m $Message }
} else {
    Write-Host ""
    Write-Host "==> Nothing to commit, tree is clean" -ForegroundColor Yellow
}

Invoke-Step "Pushing branch '$branch'" { git push origin $branch }

# Work out the tag. Tags on the remote count too, so fetch them first.
Invoke-Step "Fetching existing tags" { git fetch --tags --quiet }

if ([string]::IsNullOrWhiteSpace($Version)) {
    $latest = git tag --list 'v*' --sort=-v:refname | Select-Object -First 1
    if ($latest -match '^v(\d+)\.(\d+)\.(\d+)$') {
        $Version = "v{0}.{1}.{2}" -f $Matches[1], $Matches[2], ([int]$Matches[3] + 1)
    } else {
        $Version = 'v1.0.0'
    }
    Write-Host ""
    Write-Host "==> No -Version given, using $Version" -ForegroundColor Yellow
}

if ($Version -notmatch '^v') {
    $Version = "v$Version"
}

# Re-pushing an existing tag does not re-trigger the workflows and just looks like a
# silent no-op, so refuse early and say which tag is in the way.
$existing = git tag --list $Version
if (-not [string]::IsNullOrWhiteSpace($existing)) {
    Write-Host ""
    Write-Host "Tag $Version already exists. Pick a different -Version." -ForegroundColor Red
    exit 1
}

Invoke-Step "Tagging $Version" { git tag $Version }
Invoke-Step "Pushing tag $Version" { git push origin $Version }

$url = (git remote get-url origin).Trim() -replace '\.git$', ''

Write-Host ""
Write-Host "Shipped $Version." -ForegroundColor Green
Write-Host "Both release builds are now running. Watch them here:" -ForegroundColor Green
Write-Host "    $url/actions"
Write-Host ""
Write-Host "When they finish:"
Write-Host "  Android .apk  ->  $url/releases/tag/$Version"
Write-Host "  iOS build     ->  App Store Connect > TestFlight (takes ~10 min to appear)"
