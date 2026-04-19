# Runs after Edit/Write/MultiEdit.
# Reads hook JSON from stdin, extracts file_path, runs the matching linter.
# Exit 0: continue silently. Exit 2: surface stderr to Claude as error.

$ErrorActionPreference = "SilentlyContinue"
$input_json = [Console]::In.ReadToEnd()
if (-not $input_json) { exit 0 }

try { $data = $input_json | ConvertFrom-Json } catch { exit 0 }

$filePath = $data.tool_input.file_path
if (-not $filePath) { exit 0 }

$root = "U:\Monopoly"
$ext  = [IO.Path]::GetExtension($filePath).ToLower()

# ----- Python -----
if ($ext -eq ".py") {
    $ruff = Join-Path $root "backend\.venv\Scripts\ruff.exe"
    if (Test-Path $ruff) {
        $out = & $ruff check --quiet $filePath 2>&1
        if ($LASTEXITCODE -ne 0) {
            [Console]::Error.WriteLine("ruff found issues in $filePath :")
            [Console]::Error.WriteLine($out)
            exit 2
        }
    }
    # Syntax check as a minimal fallback if ruff is not installed.
    $py = Join-Path $root "backend\.venv\Scripts\python.exe"
    if (Test-Path $py) {
        $out = & $py -m py_compile $filePath 2>&1
        if ($LASTEXITCODE -ne 0) {
            [Console]::Error.WriteLine("Python syntax error in $filePath :")
            [Console]::Error.WriteLine($out)
            exit 2
        }
    }
    exit 0
}

# ----- JS / JSX -----
if ($ext -in ".js", ".jsx", ".ts", ".tsx") {
    # Only lint files inside frontend/ to avoid surprises.
    if ($filePath -notmatch "frontend[\\/]") { exit 0 }
    Push-Location (Join-Path $root "frontend")
    try {
        $out = & npx.cmd --no-install eslint $filePath 2>&1
        if ($LASTEXITCODE -ne 0) {
            [Console]::Error.WriteLine("eslint issues in $filePath :")
            [Console]::Error.WriteLine($out)
            Pop-Location
            exit 2
        }
    } finally { Pop-Location }
    exit 0
}

exit 0
