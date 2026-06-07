#!/usr/bin/env bash
# Standalone no-orphan verification: spawn a headless Neovim that starts the
# server, kill -9 the Neovim, and assert the server is reaped within the window.
# Mirrors tests/integration/orphan_spec.lua for environments without busted.
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 2

PIDFILE="$(mktemp)"
rm -f "$PIDFILE"
export IG_PID_FILE="$PIDFILE"
# Set the server heartbeat timeout far above the reap window below so this gate
# can ONLY pass via the load-bearing stdin-EOF path, never the heartbeat backstop.
export IG_HEARTBEAT_TIMEOUT_MS="30000"

nvim --headless -u tests/minimal_init.lua -l tests/integration/orphan_child.lua >/tmp/ig_orphan_child.log 2>&1 &
CHILD=$!

SERVER_PID=""
for _ in $(seq 1 150); do
  if [ -s "$PIDFILE" ]; then SERVER_PID="$(cat "$PIDFILE")"; break; fi
  sleep 0.1
done

if [ -z "$SERVER_PID" ] || [ "$SERVER_PID" = "ERROR_NOT_READY" ]; then
  echo "FAIL: server never became ready (got '$SERVER_PID')"
  [ -f "$PIDFILE.diag" ] && { echo "--- child diag ---"; cat "$PIDFILE.diag"; }
  cat /tmp/ig_orphan_child.log
  kill -9 "$CHILD" 2>/dev/null
  rm -f "$PIDFILE"
  exit 1
fi

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "FAIL: server pid=$SERVER_PID not alive before kill"
  kill -9 "$CHILD" 2>/dev/null
  rm -f "$PIDFILE"
  exit 1
fi
echo "server pid=$SERVER_PID alive; killing parent nvim pid=$CHILD with -9"
kill -9 "$CHILD"

REAPED="no"
for i in $(seq 1 60); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then REAPED="yes"; echo "reaped within ~${i}00ms"; break; fi
  sleep 0.1
done

rm -f "$PIDFILE"
if [ "$REAPED" = "yes" ]; then
  echo "PASS: no-orphan gate green"
  exit 0
fi
echo "FAIL: server pid=$SERVER_PID orphaned after parent kill -9"
kill -9 "$SERVER_PID" 2>/dev/null
exit 1
