# DHU Ops - local regression runner
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\run_regression.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\run_regression.ps1 -WithUi
# All tests use temp databases and temp ports; they never touch data\dhu_ops.db.

param(
    [switch]$WithUi
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$venvPy = Join-Path $root '.build-venv\Scripts\python.exe'
$python = if (Test-Path $venvPy) { $venvPy } else { 'python' }

Write-Host "Project : $root"
Write-Host "Python  : $python"
Write-Host ""

$tests = @(
    'tests\test_state_rev.py',
    'tests\test_state_perm.py',
    'tests\test_save_atomic.py',
    'tests\test_password_policy.py',
    'tests\test_report_patrol_link.py'
)
if ($WithUi) { $tests += 'tests\ui_selftest.py' }

$failed = @()
foreach ($t in $tests) {
    Write-Host "=== $t ==="
    Push-Location $root
    & $python $t
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) {
        Write-Host "FAILED ($code): $t" -ForegroundColor Red
        $failed += $t
    } else {
        Write-Host "OK: $t" -ForegroundColor Green
    }
    Write-Host ""
}

if ($failed.Count -gt 0) {
    Write-Host "Regression FAILED: $($failed.Count)/$($tests.Count)" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" }
    exit 1
}
Write-Host "Regression PASSED: $($tests.Count)/$($tests.Count)" -ForegroundColor Green
exit 0
