#!/usr/bin/env bash
set -euo pipefail

pids=()

cleanup() {
  trap - EXIT INT TERM
  for pid in "${pids[@]:-}"; do
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  done
  wait "${pids[@]:-}" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

setsid bash -c 'cd /srv/codex-shared/unknown-test-app && PORT="${DEMO_CRM_PORT:-4890}" exec npm --workspace backend run dev' &
pids+=("$!")

setsid bash -c 'cd /srv/codex-shared/Alumet && exec npm run dev' &
pids+=("$!")

wait -n "${pids[@]}"
status=$?
cleanup
exit "$status"
