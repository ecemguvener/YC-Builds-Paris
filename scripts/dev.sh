#!/usr/bin/env bash
set -euo pipefail

source_path="${BASH_SOURCE[0]}"
while [ -L "$source_path" ]; do
  source_dir="$(cd -P "$(dirname "$source_path")" && pwd)"
  link_target="$(readlink "$source_path")"
  if [[ "$link_target" == /* ]]; then
    source_path="$link_target"
  else
    source_path="$source_dir/$link_target"
  fi
done

script_dir="$(cd -P "$(dirname "$source_path")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

cd "$repo_root"

export API_PORT="${BARKAN_DEV_API_PORT:-4001}"
export PUBLIC_APP_URL="${BARKAN_DEV_PUBLIC_APP_URL:-http://100.81.152.74:4001}"
export PUBLIC_API_URL="${BARKAN_DEV_PUBLIC_API_URL:-http://100.81.152.74:${API_PORT}}"
export API_PROXY_TARGET="${BARKAN_DEV_API_PROXY_TARGET:-http://127.0.0.1:${API_PORT}}"
export VITE_API_URL="$PUBLIC_API_URL"
export VITE_API_PORT="$API_PORT"

pids=()

cleanup() {
  if [ "${#pids[@]}" -eq 0 ]; then
    return
  fi

  kill "${pids[@]}" 2>/dev/null || true
  wait "${pids[@]}" 2>/dev/null || true
}

stop() {
  trap - EXIT
  cleanup
  exit 130
}

start() {
  printf '== Starting %s ==\n' "$1"
  shift
  "$@" &
  pids+=("$!")
}

trap cleanup EXIT
trap stop INT TERM

start "API dev" npm --workspace @barkan/api run dev
start "web dev" npm --workspace @barkan/web run dev
start "widget dev" npm --workspace @barkan/widget run dev
start "extension widget sync" node packages/widget/scripts/sync-extension-widget.cjs

wait -n "${pids[@]}"
