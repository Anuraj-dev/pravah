#!/usr/bin/env bash
# Run the Pravah Omarchy widget QML contract tests against fake-pravah.
# Requires quickshell and a Wayland (or X11) display. Skips with exit 0
# when those are missing so a machine without the shell kit stays green.
set -euo pipefail

TESTS="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$TESTS/.." && pwd)"

if ! command -v quickshell >/dev/null 2>&1; then
  echo "skip: quickshell is not installed"
  exit 0
fi
if [[ -z "${WAYLAND_DISPLAY:-}" && -z "${DISPLAY:-}" ]]; then
  echo "skip: no display (WAYLAND_DISPLAY/DISPLAY unset)"
  exit 0
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "skip: python3 is not installed (needed by tests/fake-pravah)"
  exit 0
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/pravah-qtest.XXXXXX")"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

ln -s "$ROOT/omarchy-plugin/widget/PravahData.qml" "$WORKDIR/PravahData.qml"
cp "$TESTS/Test.qml" "$WORKDIR/Test.qml"
cp "$TESTS/fake-pravah" "$WORKDIR/pravah"
chmod +x "$WORKDIR/pravah"

export PRAVAH_FAKE_LOG="$WORKDIR/cli.log"
export PRAVAH_TEST_RESULT="$WORKDIR/result.txt"
export PRAVAH_FAKE_SNAPSHOT="$WORKDIR/snapshot.json"
: >"$PRAVAH_FAKE_LOG"

# A stand-in for the file `pravah watch` maintains, so the watch-transport
# tests read a real file through the widget's FileView. generatedAt is stamped
# at setup so the freshness check sees a live daemon, not a stale file.
cat >"$PRAVAH_FAKE_SNAPSHOT" <<JSON
{
  "version": 1,
  "generatedAt": $(date +%s%3N),
  "day": "2026-05-04",
  "convexUrl": "https://test.invalid.convex.cloud",
  "counts": { "active": 2, "inbox": 1, "timeline": 1, "overdue": 1, "completedToday": 2, "goals": 1 },
  "tasks": [
    { "id": "w_overdue", "title": "Watch overdue", "status": "timeline", "deadline": "2026-05-01", "goalId": "g1" },
    { "id": "w_inbox", "title": "Watch inbox", "status": "inbox" }
  ],
  "goals": [
    { "id": "g1", "text": "Watch goal", "linkedTasks": 1, "completedTasks": 2 }
  ]
}
JSON

unset QS_CONFIG_PATH QS_CONFIG_NAME QS_MANIFEST || true

set +e
timeout 25s quickshell -p "$WORKDIR/Test.qml" --no-duplicate \
  >"$WORKDIR/qs.out" 2>"$WORKDIR/qs.err"
qs_status=$?
set -e

result=""
if [[ -s "$PRAVAH_TEST_RESULT" ]]; then
  result="$(cat "$PRAVAH_TEST_RESULT")"
elif grep -q '^PRAVAH_QTEST ' "$WORKDIR/qs.out" 2>/dev/null; then
  result="$(grep '^PRAVAH_QTEST ' "$WORKDIR/qs.out")"
fi

if [[ -z "$result" ]]; then
  echo "FAIL: quickshell produced no PRAVAH_QTEST result (exit $qs_status)"
  echo "----- stdout -----"
  cat "$WORKDIR/qs.out" || true
  echo "----- stderr -----"
  cat "$WORKDIR/qs.err" || true
  exit 1
fi

echo "$result"
if echo "$result" | grep -q '^PRAVAH_QTEST passed=' && echo "$result" | grep -q ' failed=0'; then
  exit 0
fi
echo "----- stdout -----"
cat "$WORKDIR/qs.out" || true
echo "----- stderr -----"
cat "$WORKDIR/qs.err" || true
exit 1
