# Deferred Work

## Deferred from: code review of story 1-2-server-spawn-and-no-orphan-supervision (2026-06-03)

- Unbounded `stdout_buf` (Lua) / `LineBuffer` (TS) growth on a newline-less huge line. Trusted local channel; add a max-line cap that drops + diagnoses an over-long unterminated buffer. [lua/interactive-graphviz/server.lua:206, server/stdio.ts]
- Orphan integration test relies on raw `kill -0 <pid>` liveness, which is vulnerable to PID reuse. Harden with a process identity check (start-time or cmdline) rather than bare PID existence. [tests/integration/orphan_spec.lua]
