#!/usr/bin/env bash
set -euo pipefail
trap '' HUP

: "${UPDATE_PARENT_PID:?Missing parent PID}"
: "${UPDATE_SOURCE:?Missing update path}" # path to the updated executable
: "${UPDATE_EXECUTABLE:?Missing executable path}" # corresponds to the current executable path
: "${UPDATE_WORKING_DIR:?Missing working directory}"

[[ "$UPDATE_PARENT_PID" =~ ^[1-9][0-9]*$ ]]
[[ -s "$UPDATE_SOURCE" && -f "$UPDATE_EXECUTABLE" ]]
[[ "$UPDATE_SOURCE" != "$UPDATE_EXECUTABLE" ]]
[[ -w "$(dirname -- "$UPDATE_EXECUTABLE")" ]]
kill -0 "$UPDATE_PARENT_PID"
chmod +x -- "$UPDATE_SOURCE"
cd -- "$UPDATE_WORKING_DIR"

# stdout is only the readiness channel; subsequent output goes to the log
printf 'UPDATE_READY\n'
exec 1>&2
while kill -0 "$UPDATE_PARENT_PID" 2>/dev/null; do
    sleep 0.2
done

mv -f -- "$UPDATE_SOURCE" "$UPDATE_EXECUTABLE" # the pool is shutdown, so we can override it's executable
