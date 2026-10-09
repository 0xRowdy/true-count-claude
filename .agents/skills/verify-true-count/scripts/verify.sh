#!/usr/bin/env bash
# verify-true-count harness. Run from anywhere inside the repo (any worktree). Linux and macOS.
#   verify.sh launch [--tailnet] [--no-build]   build web export, serve it, print URL
#   verify.sh doctor                             is the instance we launched worth driving?
#   verify.sh drive <flow> [<flow>...]           run flows/*.mjs headless, collect evidence
#   verify.sh stop                               stop the instance this worktree launched
set -euo pipefail
export PATH="$HOME/.local/share/mise/shims:$PATH"
ROOT="$(git rev-parse --show-toplevel)"
SKILL="$(cd "$(dirname "$0")/.." && pwd -P)"
RUN="$ROOT/.verify/run"; EVID="$ROOT/.verify/evidence"
mkdir -p "$RUN" "$EVID"
state() { if [ -f "$RUN/instance" ]; then . "$RUN/instance"; fi; }   # PID TOKEN URL BUILT_FROM

# Where Playwright lives: $PLAYWRIGHT_ROOT (a dir holding node_modules/playwright, as CI sets it)
# or else the fleet toolchain (mise npm:playwright). drive.mjs gets it through the same variable.
pw_root() { if [ -n "${PLAYWRIGHT_ROOT:-}" ]; then echo "$PLAYWRIGHT_ROOT"; else mise where npm:playwright 2>/dev/null; fi; }

# Content fingerprint of the working tree (tracked + untracked, minus ignored like dist/ and .verify/).
# Changes on every edit, staged or not, unlike "HEAD+dirty".
fingerprint() {
  (cd "$ROOT"
   files="$(git ls-files -co --exclude-standard | while IFS= read -r f; do if [ -f "$f" ]; then printf '%s\n' "$f"; fi; done)"
   # Hash "<content-hash> <path>" pairs so renames count as changes too.
   printf '%s\n' "$files" | git hash-object --stdin-paths | paste -d' ' - <(printf '%s\n' "$files") \
     | git hash-object --stdin | cut -c1-12)
}

# Is $1 the server this worktree started? Alive AND carrying our token (portable: ps, no /proc).
ours() { [ -n "${1:-}" ] && [ -n "${TOKEN:-}" ] && ps -o command= -p "$1" 2>/dev/null | grep -qF -- "$TOKEN"; }

cmd_launch() {
  local host=127.0.0.1 build=1
  for a in "$@"; do case "$a" in --tailnet) host="$(tailscale ip -4)";; --no-build) build=0;; esac; done
  state; if ours "${PID:-}"; then echo "already running: $URL (pid $PID)"; return; fi
  if [ "$build" = 1 ] || [ ! -f "$ROOT/dist/index.html" ]; then
    echo "building web export…"; (cd "$ROOT" && pnpm -s build:web >"$RUN/build.log" 2>&1) || { tail -20 "$RUN/build.log"; exit 1; }
    fingerprint > "$ROOT/dist/.verify-built-from"
  fi
  local built; built="$(cat "$ROOT/dist/.verify-built-from" 2>/dev/null || echo unknown)"
  local token; token="verify-true-count-$(date +%s)-$$-$RANDOM"
  nohup node "$SKILL/scripts/serve.mjs" "$ROOT/dist" "$host" "$token" >"$RUN/serve.log" 2>&1 &
  local pid=$! url=""
  for _ in $(seq 1 100); do
    url="$(sed -n 's/^verify-serve ready //p' "$RUN/serve.log" 2>/dev/null | head -1)"
    [ -n "$url" ] && break
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done
  if [ -z "$url" ]; then
    kill "$pid" 2>/dev/null || true
    echo "FAIL server did not start:" >&2; tail -5 "$RUN/serve.log" >&2; exit 1
  fi
  # Plain HTTP is intended: the server binds localhost or the tailnet IP (WireGuard-encrypted) only.
  printf 'PID=%s\nTOKEN=%s\nURL=%s\nBUILT_FROM=%s\n' "$pid" "$token" "$url" "$built" > "$RUN/instance"
  echo "ready: $url (pid $pid, build of tree $built)"
}

cmd_doctor() {
  state; local ok=1
  if ours "${PID:-}"; then echo "ok   server pid $PID is ours"; else echo "FAIL no live instance launched by this worktree (run: verify.sh launch)"; ok=0; fi
  if [ "$ok" = 1 ]; then
    local body; body="$(curl -fsS "$URL/" 2>/dev/null || true)"
    grep -q "_expo/static" <<<"$body" && echo "ok   $URL serves the Expo web export" || { echo "FAIL $URL does not serve the app"; ok=0; }
    local now; now="$(fingerprint)"
    if [ "$now" = "$BUILT_FROM" ]; then echo "ok   build matches working tree ($now)"
    else echo "WARN build is of tree $BUILT_FROM, working tree is now $now — relaunch to rebuild"; fi
  fi
  local pw; pw="$(pw_root)" && [ -d "$pw/node_modules/playwright" ] \
    && echo "ok   playwright at $pw" || { echo "FAIL playwright missing (fleet: mise npm:playwright, or set PLAYWRIGHT_ROOT)"; ok=0; }
  [ "$ok" = 1 ]
}

cmd_drive() {
  state; [ -n "${URL:-}" ] || { echo "no instance; run: verify.sh launch" >&2; exit 1; }
  local rc=0 f name dir
  PLAYWRIGHT_ROOT="$(pw_root)" || true; export PLAYWRIGHT_ROOT
  for f in "$@"; do
    [ -f "$f" ] || f="$SKILL/flows/${f%.mjs}.mjs"
    name="$(basename "$f" .mjs)"; dir="$EVID/$(date +%Y%m%d-%H%M%S)-$name"
    node "$SKILL/scripts/drive.mjs" "$f" "$URL" "$dir" || rc=1
  done
  return $rc
}

cmd_stop() {
  state
  if ours "${PID:-}"; then kill "$PID"; echo "stopped pid $PID ($URL)"
  elif [ -n "${PID:-}" ]; then echo "pid $PID is no longer our server (exited or reused); not killing it"
  else echo "nothing to stop"; fi
  rm -f "$RUN/instance"; echo "evidence kept in $EVID"
}

c="${1:-}"; [ $# -gt 0 ] && shift
case "$c" in launch) cmd_launch "$@";; doctor) cmd_doctor;; drive) cmd_drive "$@";; stop) cmd_stop;;
  *) sed -n '2,7p' "$0"; exit 2;; esac
