#!/usr/bin/env bash

invoke_guarded_deploy() {
  if [[ "$#" -ne 2 ]]; then
    printf 'ERROR: invoke_guarded_deploy requires script and manifest paths\n' >&2
    return 2
  fi
  local deploy_script="$1"
  local manifest="$2"
  [[ -f "$deploy_script" && ! -L "$deploy_script" ]] || {
    printf 'ERROR: guarded deploy script is missing or not regular\n' >&2
    return 2
  }
  bash "$deploy_script" --manifest="$manifest"
}
