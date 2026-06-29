#!/usr/bin/env bash
# Token-efficient test runner for Codex integration.
# Runs Playwright tests, captures results as JSON, and outputs a concise summary.
# Codex reads this summary instead of raw Playwright output — saves Claude Code tokens.
#
# Usage:
#   ./scripts/run-tests.sh              # Run all tests
#   ./scripts/run-tests.sh navigation   # Run specific test file
#   ./scripts/run-tests.sh --update     # Update screenshot baselines

set -euo pipefail
cd "$(dirname "$0")/.."

RESULTS_FILE="e2e/results.json"

# Build first (required for preview server)
echo "Building frontend..."
npm run build 2>&1 | tail -3

# Determine test args
TEST_ARGS=""
if [[ "${1:-}" == "--update" ]]; then
  TEST_ARGS="--update-snapshots"
  shift
elif [[ -n "${1:-}" ]]; then
  TEST_ARGS="e2e/${1}.spec.js"
fi

# Run tests, capture exit code
echo "Running Playwright tests..."
npx playwright test $TEST_ARGS --reporter=json 2>/dev/null > "$RESULTS_FILE" || true

# Parse results into a concise summary
node -e "
const fs = require('fs');
const results = JSON.parse(fs.readFileSync('$RESULTS_FILE', 'utf8'));

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
    console.log('  ✗ [' + f.suite + '] ' + f.test);
    console.log('    ' + f.error);
  });
}
if (failed === 0) {
  console.log('');
  console.log('All tests passed.');
}
console.log('===================');
"

# Exit with appropriate code
node -e "
const r = JSON.parse(require('fs').readFileSync('$RESULTS_FILE', 'utf8'));
let failed = 0;
function walk(s) {
  for (const sp of (s.specs||[])) for (const t of (sp.tests||[])) for (const res of (t.results||[])) if (res.status !== 'passed' && res.status !== 'skipped') failed++;
  for (const c of (s.suites||[])) walk(c);
}
(r.suites||[]).forEach(walk);
process.exit(failed > 0 ? 1 : 0);
"
