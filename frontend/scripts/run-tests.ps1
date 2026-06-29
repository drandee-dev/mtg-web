# Token-efficient test runner for Codex integration (Windows).
# Runs Playwright tests, captures results as JSON, and outputs a concise summary.
#
# Usage:
#   .\scripts\run-tests.ps1              # Run all tests
#   .\scripts\run-tests.ps1 navigation   # Run specific test file
#   .\scripts\run-tests.ps1 --update     # Update screenshot baselines

param(
    [string]$TestFile = "",
    [switch]$Update
)

$ErrorActionPreference = "Continue"
Push-Location "$PSScriptRoot\.."

$ResultsFile = "e2e\results.json"

Write-Host "Building frontend..."
npm run build 2>&1 | Select-Object -Last 3

$testArgs = @()
if ($Update) {
    $testArgs += "--update-snapshots"
}
if ($TestFile -and $TestFile -ne "--update") {
    $testArgs += "e2e\$TestFile.spec.js"
}

Write-Host "Running Playwright tests..."
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = $ResultsFile
npx playwright test @testArgs --reporter=json 2>$null | Out-Null

node -e @"
const fs = require('fs');
const results = JSON.parse(fs.readFileSync('$ResultsFile', 'utf8'));
const suites = results.suites || [];
let passed = 0, failed = 0, skipped = 0;
const failures = [];
function walk(suite) {
  for (const spec of (suite.specs || [])) {
    for (const test of (spec.tests || [])) {
      for (const result of (test.results || [])) {
        if (result.status === 'passed') passed++;
        else if (result.status === 'failed' || result.status === 'timedOut') {
          failed++;
          failures.push({
            test: spec.title,
            suite: suite.title,
            error: (result.errors || []).map(e => e.message?.split('\n')[0] || 'Unknown error').join('; ')
          });
        }
        else skipped++;
      }
    }
  }
  for (const child of (suite.suites || [])) walk(child);
}
suites.forEach(walk);
console.log('');
console.log('=== TEST SUMMARY ===');
console.log('Passed: ' + passed + ' | Failed: ' + failed + ' | Skipped: ' + skipped);
if (failures.length > 0) {
  console.log('');
  console.log('FAILURES:');
  failures.forEach(f => {
    console.log('  X [' + f.suite + '] ' + f.test);
    console.log('    ' + f.error);
  });
}
if (failed === 0) { console.log(''); console.log('All tests passed.'); }
console.log('===================');
"@

Pop-Location
