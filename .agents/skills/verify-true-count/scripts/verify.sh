#!/usr/bin/env bash
# verify-true-count harness. Run from anywhere inside the repo (any worktree).
#   verify.sh launch [--tailnet] [--no-build]   build web export, serve it, print URL
#   verify.sh doctor                             is the instance we launched worth driving?
#   verify.sh drive <flow> [<flow>...]           run flows/*.mjs headless, collect evidence
#   verify.sh stop                               stop the instance this worktree launched
set -euo pipefail
export PATH="$HOME/.local/share/mise/shims:$PATH"
ROOT="$(git rev-parse --show-toplevel)"
SKILL="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
RUN="$ROOT/.verify/run"; EVID="$ROOT/.verify/evidence"
mkdir -p "$RUN" "$EVID"
state() { if [ -f "$RUN/instance" ]; then . "$RUN/instance"; fi; }   # PID PORT HOST URL BUILT_AT

free_port() { local p; for p in $(seq 4310 4399); do (exec 3<>/dev/tcp/127.0.0.1/$p) 2>/dev/null || { echo $p; return; }; done; return 1; }

cmd_launch() {
  local host=127.0.0.1 build=1
  for a in "$@"; do case "$a" in --tailnet) host="$(tailscale ip -4)";; --no-build) build=0;; esac; done
  state; if [ -n "${PID:-}" ] && kill -0 "$PID" 2>/dev/null; then echo "already running: $URL (pid $PID)"; return; fi
  if [ "$build" = 1 ] || [ ! -f "$ROOT/dist/index.html" ]; then
    echo "building web export…"; (cd "$ROOT" && pnpm -s build:web >"$RUN/build.log" 2>&1) || { tail -20 "$RUN/build.log"; exit 1; }
  fi
  local port; port="$(free_port)"
  nohup node "$SKILL/scripts/serve.mjs" "$ROOT/dist" "$port" "$host" >"$RUN/serve.log" 2>&1 &
  local pid=$!
  for _ in $(seq 1 50); do grep -q "verify-serve ready" "$RUN/serve.log" 2>/dev/null && break; sleep 0.1; done
  # Plain HTTP is intended: the server binds localhost or the tailnet IP (WireGuard-encrypted) only.
  local url="http://$host:$port"  # NOSONAR
  local built; built="$(git -C "$ROOT" rev-parse --short HEAD)$(git -C "$ROOT" diff --quiet || echo +dirty)"
  printf 'PID=%s\nPORT=%s\nHOST=%s\nURL=%s\nBUILT_AT=%s\n' "$pid" "$port" "$host" "$url" "$built" > "$RUN/instance"
  state; echo "ready: $URL (pid $PID, build of $BUILT_AT)"
}

cmd_doctor() {
  state; local ok=1
  [ -n "${PID:-}" ] && kill -0 "$PID" 2>/dev/null && grep -q serve.mjs "/proc/$PID/cmdline" 2>/dev/null \
    && echo "ok   server pid $PID is ours" || { echo "FAIL no instance launched by this worktree (run: verify.sh launch)"; ok=0; }
  if [ "$ok" = 1 ]; then
    local body; body="$(curl -fsS "$URL/" 2>/dev/null || true)"
    grep -q "_expo/static" <<<"$body" && echo "ok   $URL serves the Expo web export" || { echo "FAIL $URL does not serve the app"; ok=0; }
    local now; now="$(git -C "$ROOT" rev-parse --short HEAD)$(git -C "$ROOT" diff --quiet || echo +dirty)"
    [ "$now" = "$BUILT_AT" ] && echo "ok   build matches working tree ($now)" || echo "WARN build is $BUILT_AT, tree is $now — relaunch to rebuild"
  fi
  local pw; pw="$(mise where npm:playwright 2>/dev/null)" && [ -d "$pw/node_modules/playwright" ] \
    && echo "ok   playwright at $pw" || { echo "FAIL playwright missing (fleet: mise npm:playwright)"; ok=0; }
  [ "$ok" = 1 ]
}

cmd_drive() {
  state; [ -n "${URL:-}" ] || { echo "no instance; run: verify.sh launch" >&2; exit 1; }
  local rc=0 f name dir
  for f in "$@"; do
    [ -f "$f" ] || f="$SKILL/flows/${f%.mjs}.mjs"
    name="$(basename "$f" .mjs)"; dir="$EVID/$(date +%Y%m%d-%H%M%S)-$name"
    node "$SKILL/scripts/drive.mjs" "$f" "$URL" "$dir" || rc=1
  done
  return $rc
}

cmd_stop() {
  state; if [ -n "${PID:-}" ] && kill -0 "$PID" 2>/dev/null && grep -q serve.mjs "/proc/$PID/cmdline" 2>/dev/null; then
    kill "$PID"; echo "stopped pid $PID ($URL)"; else echo "nothing to stop"; fi
  rm -f "$RUN/instance"; echo "evidence kept in $EVID"
}

c="${1:-}"; [ $# -gt 0 ] && shift
case "$c" in launch) cmd_launch "$@";; doctor) cmd_doctor;; drive) cmd_drive "$@";; stop) cmd_stop;;
  *) sed -n '2,7p' "$0"; exit 2;; esac
