#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '🚀 [deploy-barkan-widget] %s\n' "$*"
}

section() {
  printf '\n✨ [deploy-barkan-widget] == %s ==\n' "$*"
}

run_quiet() {
  local output_file
  output_file="$(mktemp)"

  if "$@" >"$output_file" 2>&1; then
    rm -f "$output_file"
    return
  fi

  local status=$?
  log "❌ Command failed: $*"
  sed 's/^/    /' "$output_file" >&2
  rm -f "$output_file"
  exit "$status"
}

restart_pm2_app() {
  local app_name="$1"

  if ! command -v pm2 >/dev/null 2>&1; then
    log "❌ pm2 command not found."
    exit 1
  fi

  if pm2 describe "$app_name" >/dev/null 2>&1; then
    run_quiet pm2 restart "$app_name" --update-env
  else
    run_quiet pm2 start "$repo_root/ecosystem.config.cjs" --only "$app_name"
  fi
  run_quiet pm2 save
}

check_widget() {
  local widget_url="$1"
  local retries="$2"
  local output_file
  output_file="$(mktemp)"

  for attempt in $(seq 1 "$retries"); do
    if curl -fsSI --max-time 5 "$widget_url" >"$output_file" 2>&1; then
      rm -f "$output_file"
      return
    fi
    sleep 1
  done

  log "❌ Widget check failed: $widget_url"
  sed 's/^/    /' "$output_file" >&2
  rm -f "$output_file"
  exit 1
}

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
widget_dist_file="$repo_root/packages/widget/dist/widget.js"
prod_pm2_api_name="${BARKAN_PROD_PM2_API_NAME:-prod-barkan-api}"
widget_health_url="${BARKAN_WIDGET_HEALTH_URL:-http://127.0.0.1:4000/widget.js}"
widget_health_retries="${BARKAN_WIDGET_HEALTH_RETRIES:-20}"
export NODE_ENV="${NODE_ENV:-production}"

section "Starting deploy"

section "Building API"
run_quiet npm --prefix "$repo_root" --workspace @barkan/api run build

section "Building widget"
run_quiet npm --prefix "$repo_root" --workspace @barkan/widget run build

if [ ! -f "$widget_dist_file" ]; then
  echo "Widget build output not found: $widget_dist_file" >&2
  exit 1
fi

section "Restarting API"
restart_pm2_app "$prod_pm2_api_name"

section "Checking widget"
check_widget "$widget_health_url" "$widget_health_retries"

section "Deploy complete"
