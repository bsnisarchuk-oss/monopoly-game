# Runs at Claude Code session start.
# Stdout is injected into Claude's context — keep it short and useful.

$ErrorActionPreference = "SilentlyContinue"
$root = "U:\Monopoly"
Set-Location $root

Write-Host "=== Monopoly session context ==="

# Current branch + short status
$branch = (& git -C $root rev-parse --abbrev-ref HEAD) 2>$null
if ($branch) { Write-Host "Branch: $branch" }

$status = (& git -C $root status --porcelain=v1) 2>$null
if ($status) {
    Write-Host "Working tree has changes:"
    $status | Select-Object -First 15 | ForEach-Object { Write-Host "  $_" }
} else {
    Write-Host "Working tree clean"
}

# Last 3 commits
Write-Host "`nRecent commits:"
& git -C $root log --oneline -3 2>$null | ForEach-Object { Write-Host "  $_" }

# IN_PROGRESS block from AI_HANDOFF.md
$handoff = Join-Path $root "AI_HANDOFF.md"
if (Test-Path $handoff) {
    $ageDays = [int]((Get-Date) - (Get-Item $handoff).LastWriteTime).TotalDays
    Write-Host "`nAI_HANDOFF.md age: $ageDays days"
    if ($ageDays -gt 3) {
        Write-Host "  WARNING: handoff older than 3 days — verify it reflects reality before trusting it."
    }

    $text = Get-Content $handoff -Raw
    if ($text -match '(?s)##\s*IN_PROGRESS.*?(?=\r?\n##\s|\Z)') {
        Write-Host "`nActive handoff (IN_PROGRESS):"
        ($Matches[0] -split "`n") | Select-Object -First 15 | ForEach-Object { Write-Host "  $_" }
    }
}

Write-Host "`nReminder: verify code before claiming it works. Update AI_HANDOFF.md before you leave."
