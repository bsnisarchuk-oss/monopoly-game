# Runs before every Bash tool call.
# Reads hook JSON from stdin, inspects the command, blocks anything dangerous.
# Exit 2 surfaces stderr to Claude and blocks the call.

$ErrorActionPreference = "SilentlyContinue"
$input_json = [Console]::In.ReadToEnd()
if (-not $input_json) { exit 0 }

try { $data = $input_json | ConvertFrom-Json } catch { exit 0 }

$cmd = $data.tool_input.command
if (-not $cmd) { exit 0 }

# Patterns that must always go through a human, not a hook allowlist.
$blocked = @(
    'git\s+push\s+(--force|-f)\b',
    'git\s+reset\s+--hard',
    'git\s+clean\s+-fd',
    'git\s+branch\s+-D',
    'rm\s+-rf\s+/',
    'rm\s+-rf\s+U:',
    'rmdir\s+/s',
    'del\s+/s',
    'Remove-Item\s+.*-Recurse\s+.*-Force'
)

foreach ($pat in $blocked) {
    if ($cmd -match $pat) {
        [Console]::Error.WriteLine("pre-bash hook blocked: command matches `$pat`")
        [Console]::Error.WriteLine("If this is intentional, ask the user to run it manually.")
        exit 2
    }
}

exit 0
