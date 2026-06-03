---
baseline_commit: be45ef02c8cef67c020ef9ebd1c628bdb417e62f
---

# Story 1.3: Message protocol and WebSocket relay

Status: review

Created: 2026-06-03T18:05:00+0200
Story Key: 1-3-message-protocol-and-websocket-relay

## Story

As the system,
I want one JSON envelope flowing Neovim→server→browser with the return channel warm,
so that all three tiers share a single, contract-tested communication spine.

## Acceptance Criteria

1. **Given** a running server, **when** Neovim writes a newline-delimited JSON message to stdin (e.g. `render{sessionId,v,engine,dot}`), **then** the server parses it and broadcasts the corresponding `render` message **only** to the WebSocket subscribers of that `sessionId` — never across sessions, never to a session with no subscribers (no error, just no recipients).
2. **Given** a running server, **when** a browser requests `GET /` (or any static frontend asset) over HTTP, **then** the server serves the bundled static frontend via `Bun.serve` (the `index.html` + module assets); the `fetch` handler no longer returns a bare `503`.
3. **Given** a running server, **when** a browser opens a WebSocket to the server, **then** `Bun.serve` upgrades the connection (the same `fetch` handler performs `server.upgrade(req, ...)`), and the socket is held un-subscribed until a valid `hello` arrives.
4. **Given** a new WebSocket connection, **when** the browser sends `hello{sessionId,token}`, **then** the server validates the `token` against the per-start token minted in Story 1.2 and (if valid) subscribes that socket to `sessions.get(sessionId).subscribers`; a `hello` with a **missing or wrong token is rejected** (the server closes the socket and does not subscribe it).
5. **Given** a subscribed socket, **when** the browser sends `ack{v}`, **then** the server handles it (records/relays liveness for the warm channel) without error and without growing v1 feature surface.
6. **Given** the v1-dormant browser→server return channel, **when** the browser sends **any unrecognized inbound message type**, **then** the server logs it (via a `log` message / stderr per the stdout-discipline rule) and ignores it — the channel stays warm without growing v1 surface; one malformed/unknown frame never throws across the connection nor tears down other subscribers.
7. **Given** the full Lua→server→frontend spine, **when** a contract test round-trips a **no-op** message through both hops (Lua writes a JSON line → server relays over WS → a test WS client receives it), **then** the received envelope is **structurally identical** on both hops: same snake_case `type`, same camelCase field keys, single `v` key, no `{data:…}` wrapping, no `null` for absent fields, no case/shape drift.
8. **Given** the canonical contract, **when** the message set is touched, **then** `server/protocol.ts` is the single source of truth and `protocol.lua` / `frontend/protocol.ts` mirror it; no new message **types** are invented (the union already lists `render`, `error_display`, `session_closed`, `hello`, `ack`, etc. — fill behavior, not vocabulary).
9. **Scope guard:** NO real Graphviz/WASM render and NO browser open are implemented (Story 1.4); NO debounce, NO `v`-token minting/end-to-end carry semantics, NO latest-wins render-lock (Story 1.5); NO last-good/error-overlay resilience (Story 1.6). The frontend `ws.ts` connects and receives envelopes but does not render DOT; `render`/`error_display`/`session_closed` are relayed/dispatched as envelopes only.

## Tasks / Subtasks

- [x] **Server: serve the static frontend over HTTP** (AC: 2)
  - [x] In `server/server.ts`, replace the placeholder `fetch()` (currently `return new Response(null, { status: 503 })`) with a handler that serves the bundled static frontend. Reuse the existing `static.ts` seam (`staticAssetRoot()` already imports `../frontend/index.html`) — route `/` and asset paths to the bundled frontend. Confirm the chosen approach works both `bun run server.ts` (dev) and a future `--compile` binary (Epic 3) by going through `static.ts`, not by reading the filesystem ad hoc. [Source: architecture.md#Starter Template Evaluation lines 193-194; architecture.md#Transport & Message Protocol line 292]
  - [x] Keep `hostname: "127.0.0.1"`, `port: 0` exactly as-is (NFR-4 / ephemeral). Do not change the bind.

- [x] **Server: WebSocket upgrade in `fetch`** (AC: 3)
  - [x] In the same `fetch` handler, detect WS upgrade requests and call `server.upgrade(req, { data: {...} })`; return `undefined` on a successful upgrade (Bun's contract). Non-WS, non-asset paths fall through to the static handler.
  - [x] Attach per-socket state via the `data` field so the `websocket` handlers can read it (e.g. `{ sessionId?: number, subscribed: boolean }`). The socket is created **un-subscribed**; subscription happens only on a valid `hello`.

- [x] **Server: `hello`/`ack`/unknown handling + subscription** (AC: 4, 5, 6)
  - [x] Replace the stub `websocket.message()` (currently `{}`) with a handler that JSON-parses one frame per message (one JSON object per WS frame — no NDJSON inside a WS frame), dispatches on `type`:
    - `hello{sessionId,token}` → validate `token` against the server's minted start token; if valid, look up/`register` the session and add the socket to `sessions.get(sessionId).subscribers`; if invalid/missing, `ws.close()` (rejected) and log. [Source: architecture.md#Security lines 328-330]
    - `ack{v}` → handle (warm-channel liveness); no feature behavior beyond keeping the channel alive. [Source: architecture.md#Communication Patterns lines 486-488]
    - any other/unparseable type → log (via stderr/`log`) and ignore; never throw. [Source: architecture.md#Communication Patterns lines 486-488; architecture.md#Format Patterns lines 468-470]
  - [x] `websocket.close()` → remove the socket from its session's `subscribers` set (call into `sessions.ts`; do not mutate the set elsewhere). [Source: architecture.md#Process Patterns lines 497-499]
  - [x] Wrap every WS `send` so one dead socket can't throw across a broadcast loop. [Source: architecture.md#Process Patterns lines 503-505]

- [x] **Server: relay Lua→WS subscribers** (AC: 1)
  - [x] Extend the existing stdin dispatch `handleMessage()` in `server.ts`: add a `render` case that broadcasts the **same envelope** to exactly `sessions.get(message.sessionId)?.subscribers`. Iterate the set, `send` the verbatim envelope (re-encode via `encodeLine`'s JSON form / `JSON.stringify` — one JSON object per WS frame). If the session is unknown or has zero subscribers, it is a silent no-op (not an error). [Source: architecture.md#Communication Patterns lines 483-485]
  - [x] Do NOT mint or mutate `v` here — `v` is stamped only at the Neovim source and carried verbatim (Story 1.5 wires the real `v`; this story relays whatever arrives). [Source: architecture.md#Communication Patterns lines 478-482; Enforcement lines 514-515]
  - [x] Keep the existing `session_open`/`session_close`/`ping`/`shutdown` cases and the unknown-type default exactly as Story 1.2 left them.

- [x] **Server: extend `sessions.ts` with subscribers** (AC: 1, 4, 6)
  - [x] Add `subscribers: Set<WebSocket>` to `Session` and the only mutators that touch it: `subscribe(sessionId, ws)`, `unsubscribe(sessionId, ws)` (and a way to iterate a session's subscribers for broadcast). **Mutate the subscriber set ONLY in this module** — same invariant as the session map. [Source: architecture.md#State & Session Model lines 279-282; Process Patterns lines 497-499]
  - [x] Keep `register`/`unregister`/`has`/`size` from Story 1.2 intact; `register` must initialize an empty `subscribers` set. Refcount stays `sessions.size`, **never** subscriber count. [Source: architecture.md#State & Session Model lines 281; 1-2 story Dev Notes]

- [x] **Frontend: real WS client** (AC: 3, 7, 9)
  - [x] Flesh out `frontend/ws.ts`: open a `WebSocket` to the server, read `sessionId` + `token` from the page URL query (`?sessionId=…&token=…`), send `hello{sessionId,token}` on `open`, and dispatch inbound envelopes by `type` to callbacks. Keep `createWebSocketClient()` (current stub returns `{ connected: false }`) as the entry but back it with a live socket. [Source: architecture.md#Transport & Message Protocol lines 292-295; #Render Pipeline (URL/session) lines 109-112]
  - [x] In `frontend/main.ts`, wire the client: connect, send `hello`, and on a `render`/`error_display`/`session_closed` envelope **only** stash/log it (no DOM render yet — Story 1.4). Keep the existing scaffold renderer text rendering untouched or replace with a "connected, awaiting render" placeholder. Do NOT import `d3-graphviz`/`@hpcc-js/wasm-graphviz` here (Story 1.4). [Source: epics.md#Story 1.4 lines 237-254]
  - [x] Import message types from `frontend/protocol.ts` (which re-exports `../server/protocol`) — never redefine the envelope.

- [x] **Protocol: keep contract canonical** (AC: 8)
  - [x] If (and only if) a field needs a concrete shape, edit `server/protocol.ts` **first** (canonical), then mirror in `lua/interactive-graphviz/protocol.lua` and confirm `frontend/protocol.ts` re-export still covers it. The `MessageType` union already includes every type this story uses (`render`, `error_display`, `session_closed`, `hello`, `ack`, `log`, …) — do not add new types. [Source: architecture.md#Enforcement Guidelines lines 509-513; protocol.ts:1-23] — No field-shape change needed; the envelope already carries arbitrary camelCase keys via `[key: string]: unknown`. No new types added; Lua mirror already complete.

- [x] **Lua: render send seam (relay-only)** (AC: 1, 7)
  - [x] `server.lua` already has `M.send(msg)` (queues until `ready`). Confirm it can carry a `render`-shaped envelope (`{ type="render", sessionId=bufnr, v=…, engine=…, dot=… }`) with **camelCase wire keys** built via `vim.json.encode`. The contract test drives this seam directly; do NOT add debounce, `v` minting policy, or `:GraphvizPreview` wiring here (Stories 1.4/1.5). [Source: architecture.md#Pattern Examples lines 533-539; 1-2 story server.lua:136] — Confirmed: `M.send` writes `vim.json.encode(msg).."\n"` verbatim; no change required. Round-trip proven by the contract test driving the equivalent stdin write.

- [x] **Tests** (AC: 1, 4, 5, 6, 7)
  - [x] **Contract round-trip test** (the load-bearing gate): spawn the real server (mirror the `supervisor.test.ts` `Bun.spawn` + read `ready{port,token}` idiom), open a WS to `ws://127.0.0.1:<port>`, send `hello{sessionId,token}`, then write a no-op `render` JSON line to the server's **stdin**, and assert the WS client receives an **envelope structurally identical** to what Lua/stdin sent: same `type` (snake_case), same camelCase keys, single `v`, no `{data}` wrapper, no `null`s. Place in `server/relay.test.ts` (co-located Bun test). [Source: architecture.md#Enforcement lines 521-522; Decision Impact line 383]
  - [x] **Token-rejection test:** a `hello` with a wrong/missing token does NOT get subscribed and the socket is closed; a subsequent `render` is not delivered to it. [Source: architecture.md#Security lines 328-330]
  - [x] **Per-session isolation test:** two sessions/two sockets — a `render` for session A reaches only A's socket, never B's. [Source: architecture.md#Communication Patterns lines 483-484]
  - [x] **Unknown-inbound test:** sending an unknown/garbage WS frame is logged+ignored and does not break the connection or other subscribers. [Source: architecture.md#Communication Patterns lines 486-488]
  - [x] **`sessions.ts` unit test:** extend/add subscribe/unsubscribe coverage (empty-set init, idempotent unsubscribe, `size` unaffected by subscriber count). [Source: 1-2 sessions.test.ts]
  - [x] Wire the new Bun specs into CI: the existing `Bun tests` step already runs `bun test server`, so co-locating under `server/` auto-includes them. Add no new Lua integration spec (the contract is exercised Bun-side); confirm CI stays green. [Source: ci.yml lines 38-39]

## Dev Notes

### Scope Boundary (read first)

This story is the **communication spine only**: serve the static frontend over HTTP, accept WS upgrades, enforce the token in `hello`, fan `render` out to a session's subscribers, keep the dormant return channel (`hello`/`ack`/unknown) warm, and prove the envelope round-trips Lua→server→frontend identically. Do **NOT** implement:

- Real Graphviz/WASM render, `d3-graphviz`/`@hpcc-js/wasm-graphviz`, or opening a browser tab — **Story 1.4**. The frontend connects and receives envelopes but renders no DOT.
- Debounce, `v`-token minting/latest-wins/render-lock, end-to-end `v` correctness semantics — **Story 1.5**. This story relays whatever `v` arrives; it neither mints nor compares it.
- Last-good render retention or the visible error overlay — **Story 1.6**. `error_display`/`session_closed` are relayed as envelopes, not acted on.
- `:GraphvizPreview`/`Stop`/`Toggle` command wiring — **Stories 1.4/1.7**. The relay/contract is exercised via `server.lua` `M.send` and the Bun contract test directly.
- LAN exposure (`expose_to_lan`) and engine selection — **Epic 2**. Bind stays literal loopback.

> A story must leave the system working end-to-end for what it claims. Here that means: a real browser-grade WS client can connect to the real spawned server, authenticate with the token, and receive a `render` envelope that Lua emitted on stdin — verified by the contract test, not asserted in prose.

### The contract is the spine — this story touches the highest-risk surface

The wire contract is "the highest-risk surface — it is touched by all three tiers." Get it exactly right; the same envelope must survive both hops byte-shape-identical. [Source: architecture.md#Pattern Categories lines 403-406]

- **Envelope:** the message **is** the object — `{ type, v?, sessionId?, … }`. No `{data:…}` wrapping; `type` discriminates. One JSON object **per line** on stdio, one JSON object **per WS frame** (do not NDJSON-pack a WS frame). [Source: architecture.md#Transport lines 296; #Format Patterns lines 468-470]
- **Wire naming (every tier, including Lua):** `type` values are **snake_case** (`render`, `hello`, `ack`, `error_display`, `session_closed`, `log`); payload field keys are **camelCase** (`sessionId`, `token`, `engine`, `dot`, `message`, `level`); the version field is the single short key **`v`**. Absent/optional fields are **omitted, never `null`**. Booleans are JSON `true`/`false`. [Source: architecture.md#Naming Patterns lines 410-420]
- Lua builds camelCase wire keys via `vim.json.encode` even though snake_case is idiomatic internally. [Source: architecture.md#Pattern Examples lines 533-539]
- **Canonical source of truth:** `server/protocol.ts`. Mirror to `protocol.lua`; `frontend/protocol.ts` already re-exports `../server/protocol`. Change the TS first, then mirror — never edit one tier's view in isolation. **No new types this story.** [Source: architecture.md#Enforcement lines 509-513]

**Good envelope (relay this verbatim):**
```jsonc
{ "type": "render", "v": 42, "sessionId": 3, "engine": "dot", "dot": "digraph{...}" }
{ "type": "hello", "sessionId": 3, "token": "<uuid>" }
{ "type": "ack", "v": 42 }
```
**Anti-pattern (never produce):**
```jsonc
{ "type": "Render", "data": { "session_id": 3, "Version": 42 } }  // wrapped, mixed case
```
[Source: architecture.md#Pattern Examples lines 529-544]

### Messages in scope this story

- **Lua→server (stdin, NDJSON):** `render{sessionId,v,engine,dot}` is the new relay target. (`session_open`/`session_close`/`ping`/`shutdown` already handled by Story 1.2 — do not regress.) [Source: architecture.md#Transport lines 302-303]
- **server→browser (WS, one JSON/frame):** `render{v,engine,dot}` fanned to that session's subscribers; `error_display{v,message}` and `session_closed` are relayed as envelopes (not acted on — 1.6). [Source: architecture.md#Transport lines 305-306]
- **browser→server (WS, warm/dormant):** `hello{sessionId,token}` (subscribe + token gate) and `ack{v}` (liveness). Any other inbound type → logged + ignored. [Source: architecture.md#Transport lines 307; #Communication Patterns lines 486-488]
- **server→Lua:** `log{level,message}` is the diagnostic channel; stdout stays protocol-only. [Source: architecture.md#Process Patterns lines 494-496]

### State & session model (extend, don't reinvent)

- `Session` gains `subscribers: Set<WebSocket>` (architecture's full shape is `{ bufnr, version, lastGoodDot, engine, subscribers }`; this story only needs to add `subscribers` — `lastGoodDot`/`engine` arrive in 1.4/1.6). Refcount stays `sessions.size`, **never** subscriber count. [Source: architecture.md#State & Session Model lines 279-282]
- Browsers are **stateless views** that re-sync on (re)connect. The architecture says a new/reconnecting subscriber is sent the session's `lastGoodDot` at its current `v` on `hello`. **That re-sync depends on `lastGoodDot`, which does not exist until Story 1.4/1.6** — so in this story, `hello` subscribes the socket but there is no last-good render to replay yet. Leave a clear seam (a comment + the subscribe call site) where 1.4 will send the current `lastGoodDot` on subscribe; do not fabricate render state. [Source: architecture.md#Multiplexing lines 109-112; #Communication Patterns lines 485]
- Subscriber-set mutation happens in exactly one module (`sessions.ts`); no other module touches the set — same invariant as session-map mutation. [Source: architecture.md#Process Patterns lines 497-499]

### Security (the token gate goes live here)

- Bind stays the **literal `127.0.0.1`** — already correct in `server.ts`; do not touch. [Source: architecture.md#Security line 326]
- The per-start token minted in Story 1.2 (`crypto.randomUUID()`, announced in `ready`) is now **enforced**: the browser presents it in the URL and in the WS `hello`; the server **rejects** (closes the socket, no subscribe) any `hello` whose token doesn't match. This is the cheap-now/load-bearing-later move flagged in 1.2. [Source: architecture.md#Security lines 328-330; 1-2 story Dev Notes "Security"]
- `expose_to_lan` is Epic 2 — do not implement the LAN switch.

### Files being modified (current state → what changes)

Baseline is the Story 1.2 implementation (all server files real, frontend still scaffold stubs). For each:

- `server/server.ts` — **current:** `fetch()` returns `503`; `websocket` handlers are empty stubs; `handleMessage()` dispatches `session_open`/`session_close`/`ping`/`shutdown` + unknown-default. **Change:** `fetch()` serves static frontend + performs WS `server.upgrade`; `websocket.message/close` implement `hello`(token gate+subscribe)/`ack`/unknown-ignore and subscriber cleanup; add a `render` case to `handleMessage()` that broadcasts to that session's subscribers. **Preserve:** the literal `127.0.0.1:0` bind, the `ready{port,token}` announce, the stdin-EOF/heartbeat exit paths, the `pong` reply, stdout-protocol-only discipline, `async/await` (no floating promises). [server.ts:30-141]
- `server/sessions.ts` — **current:** `Session = { sessionId, version }`; `register`/`unregister`/`has`/`size`. **Change:** add `subscribers: Set<WebSocket>` to `Session`, init empty in `register`, add `subscribe`/`unsubscribe` (+ broadcast/iterate helper). **Preserve:** "mutate only in this module"; `size` = session count, not subscriber count. [sessions.ts:1-33]
- `server/static.ts` — **current:** re-exports the imported `../frontend/index.html` as `staticAssetRoot()`. **Change:** likely none, or expose what `server.ts` needs to serve assets through this seam (keep the binary-friendly import; don't read the filesystem directly). [static.ts:1-5]
- `server/stdio.ts` — **current:** `encodeLine` + `LineBuffer`. **Change:** none expected (reuse `encodeLine` for stdout; the relay re-serializes the envelope for WS). [stdio.ts:1-34]
- `frontend/ws.ts` — **current:** stub `createWebSocketClient()` returns `{ connected: false }`. **Change:** real `WebSocket` connect, read `sessionId`+`token` from URL, send `hello` on open, dispatch inbound envelopes to callbacks. [ws.ts:1-7]
- `frontend/main.ts` — **current:** scaffold renderer writes text into `#app`. **Change:** wire `ws.ts`, connect + `hello`, log/stash inbound `render`/`error_display`/`session_closed` (no DOM render — 1.4). [main.ts:1-8]
- `frontend/protocol.ts` — **current:** re-exports `../server/protocol`. **Change:** none (import types from here). [protocol.ts:1-2]
- `lua/interactive-graphviz/protocol.lua` — **current:** mirror list already includes all needed types. **Change:** none unless a field shape is added to `protocol.ts` first. [protocol.lua:1-21]
- `lua/interactive-graphviz/server.lua` — **current:** `M.send(msg)` queues-until-`ready` then writes camelCase NDJSON. **Change:** none required for the relay (it already carries arbitrary envelopes); the contract test drives `M.send`/stdin directly. Do NOT add `:GraphvizPreview`/debounce/`v`-policy here. [server.lua:136-145]
- Tests: add `server/relay.test.ts` (contract round-trip + token reject + isolation + unknown-ignore) and extend `server/sessions.test.ts` for subscribers. [Source: ci.yml line 38-39]

Do **not** wire `:GraphvizPreview`/`commands.lua` to real behavior (Stories 1.4/1.7). Do **not** touch the release pipeline (`scripts/release.ts`, `checksums.txt`) — unrelated.

### Bun.serve WebSocket idiom (current Bun, the one true pattern)

`Bun.serve` does HTTP + WS + static serving natively — **no express/socket.io/ws dependency**. The WS upgrade is performed inside `fetch` via `server.upgrade(req, { data })`; return `undefined` on success. The `websocket` handler block (`open`/`message`/`close`) receives a `ServerWebSocket` whose `.data` carries the per-socket state you passed to `upgrade`. Use `ws.send(string)` to push a frame; wrap sends so a closed socket can't throw across the broadcast loop. Subscriptions here are an explicit `Set<WebSocket>` on the session (the architecture's model) — you may use Bun's native `ws.subscribe(topic)`/`server.publish(topic, …)` pub/sub if it maps cleanly to per-`sessionId` topics, but the **authoritative** subscriber state still lives in `sessions.ts` so refcount/cleanup stay single-owner. [Source: architecture.md#Starter lines 193-194; #State & Session Model lines 279-282; https://bun.sh/docs/api/websockets]

- **Static serving:** Bun bundles HTML/TS imports; the `static.ts` `import "../frontend/index.html"` seam already exists so the same code path works under `bun run` and a `--compile` binary. Serve via that route, not via raw `fs`. [Source: architecture.md#Tier 2 lines 193-195; static.ts:1]
- **Async rule:** `async/await` only; every promise awaited or `.catch`-logged; WS sends guarded. [Source: architecture.md#Process Patterns lines 503-505]

### Anti-patterns to avoid

- Do **not** broadcast a `render` across sessions or to a session that didn't request it — fan out to exactly `sessions.get(sessionId).subscribers`. [Source: lines 483-484]
- Do **not** subscribe a socket before a valid `hello`; do **not** accept a `hello` with a missing/wrong token — close it. [Source: lines 328-330]
- Do **not** mint or mutate `v` on the server or frontend — relay it verbatim; `v` is minted only at the Neovim source (Story 1.5 owns the policy). [Source: lines 478-482, 514-515]
- Do **not** wrap the envelope (`{data:…}`), mix case, or emit `null` for absent fields. Same shape on both hops. [Source: lines 468-470, 419]
- Do **not** mutate the session map or the subscriber set outside `sessions.ts`. [Source: lines 497-499]
- Do **not** add express/socket.io/ws — use `Bun.serve` native. [Source: lines 193-194]
- Do **not** let one dead socket throw across the broadcast loop; wrap every WS send. [Source: lines 503-505]
- Do **not** print non-protocol text to server **stdout**; diagnostics go to stderr or `log`. [Source: lines 494-496]
- Do **not** implement render/WASM/browser-open (1.4), debounce/latest-wins (1.5), or error overlay/last-good (1.6).
- Do **not** assert the round-trip only in prose — the Bun contract test against the **real spawned server** is the gate.

### Testing standards

- **Bun tests, co-located** `server/*.test.ts`; the CI `Bun tests` step runs `bun test server`, so new co-located specs are picked up automatically. Mirror the `supervisor.test.ts` live-server idiom: `Bun.spawn(["bun","run", SERVER], { stdin:"pipe", stdout:"pipe", stderr:"ignore", env:{...IG_HEARTBEAT_TIMEOUT_MS} })`, read the first stdout line for `ready{port,token}`, and always `proc.kill()` in `finally` to avoid leaked processes on assertion failure. [Source: 1-2 supervisor.test.ts:30-60; architecture.md#Structure lines 460-462]
- The **contract round-trip** is the load-bearing test (architecture's "contract test asserts the same envelope round-trips Lua→server→frontend"). Drive it through a real WS client + real stdin write. [Source: architecture.md#Enforcement lines 521-522; #Decision Impact line 383]
- Use a small/shrunk `IG_HEARTBEAT_TIMEOUT_MS` so the spawned server doesn't self-terminate mid-test (Story 1.2 made it env-configurable). [Source: 1-2 story]
- No new Lua busted spec is required for this story (the spine is exercised Bun-side); keep `tests/integration/orphan_spec.lua` and `tests/session_spec.lua` green/untouched.

### Latest technical information

- **`Bun.serve` WebSockets:** upgrade via `server.upgrade(req, { data })` inside `fetch` (return `undefined` on success); the `websocket` object provides `open(ws)`, `message(ws, data)`, `close(ws, code, reason)`; `ws.send(...)`, `ws.close(...)`, `ws.data`. Native pub/sub exists (`ws.subscribe`/`server.publish`) but the authoritative subscriber state must stay in `sessions.ts`. Stable in current Bun. [Source: https://bun.sh/docs/api/websockets]
- **`Bun.serve` static/HTML:** Bun can bundle and serve HTML entrypoints and their TS/JS imports; importing `../frontend/index.html` (already done in `static.ts`) yields a servable manifest that also survives `bun build --compile`. [Source: https://bun.sh/docs/bundler/html ; architecture.md#Tier 2 lines 193-195]
- **Browser `WebSocket`:** standard `new WebSocket(url)`; `addEventListener("open"|"message"|"close")`; `ws.send(JSON.stringify(envelope))`. Read `sessionId`/`token` from `new URLSearchParams(location.search)`. The connect URL/port and token come from the URL the browser is opened with in Story 1.4 (`http://127.0.0.1:<port>/?sessionId=<bufnr>&token=<token>`); in this story the frontend just reads them from `location`. [Source: architecture.md#Multiplexing lines 109-112; epics.md#Story 1.4 line 248]

### Previous story intelligence (Story 1.2)

- Story 1.2 is **done** and green: server spawns, binds literal `127.0.0.1:0`, mints a `crypto.randomUUID()` token, announces `ready{port,token}` on stdout, consumes a stdin NDJSON reader (`LineBuffer`), dispatches `session_open`/`session_close`/`ping`(→`pong`)/`shutdown` + unknown-ignore, and self-terminates on stdin-EOF/heartbeat. The `websocket`/`fetch` handlers were **deliberately stubbed** for this story to fill. [Source: 1-2 Completion Notes; server.ts:43-49]
- The token already flows: minted server-side, captured Lua-side from `ready`. This story makes the server **enforce** it in `hello`. [Source: 1-2 Dev Notes "Security"; server.lua ready handling]
- `M.send(msg)` (Lua) queues until `ready` then writes camelCase NDJSON via `vim.json.encode(msg).."\n"` — reuse it for the relay contract test; do not add a second write path. [Source: 1-2 server.lua:136-145; :27]
- Invariant carried forward: session-map mutation only in `sessions.ts`/`session.lua`; stdout protocol-only; no floating promises; one-server-per-instance, sessions keyed by `bufnr`. Do not regress these. [Source: 1-2 Dev Notes; architecture.md#Process Patterns lines 497-505]
- CI shape (reuse, just add co-located Bun specs): Stylua check, Lua smoke, busted smoke (`scaffold_spec`, `session_spec`), orphan gate, `bun test server`, frontend bundle smoke. Neovim 0.10.4 + Bun provisioned. [Source: ci.yml]

### Git intelligence

Baseline for this story is HEAD `be45ef0`. Recent commits: Story 1.1 scaffold (`189b6c5`), Epic-3 release pipeline (`a53cd8f`, `68ef456`), and the Story 1.2 supervision work that landed since. The release-pipeline commits are unrelated — **do not touch** `scripts/release.ts`/`checksums.txt`/`release.yml`. No prior relay/WS-fanout code exists to preserve; the `fetch`/`websocket` handlers are intentional stubs. [Source: `git log`; 1-2 Git intelligence]

## Project Structure Notes

All target files already exist (server files real from Story 1.2; `frontend/ws.ts`/`main.ts`/`protocol.ts` and `static.ts` from the scaffold). This story fills the WS-relay and frontend-client behavior into existing seams; no new module tree. The only new file is the contract test `server/relay.test.ts` (co-located per the architecture's "*.test.ts co-located" rule). The `subscribers` field on `Session` and `subscribe`/`unsubscribe` in `sessions.ts` align exactly with the architecture's `Session = { …, subscribers:Set<WebSocket> }`; no structural variance expected. The `static.ts` HTML-import seam is the architecture's intended static-serving path (binary-friendly), so serving the frontend through it is on-pattern.

## References

- Epics: `_bmad-output/planning-artifacts/epics.md#Story 1.3` (lines 214-235); cross-story scope `#Story 1.4` (237-254), `#Story 1.5` (256-273)
- Architecture — State & Session Model: `_bmad-output/planning-artifacts/architecture.md` lines 276-286
- Architecture — Transport & Message Protocol: `architecture.md` lines 288-307
- Architecture — Render Pipeline (URL/session, scope-out): `architecture.md` lines 309-322
- Architecture — Security (token gate): `architecture.md` lines 324-332
- Architecture — Multiplexing (subscribers/re-sync): `architecture.md` lines 99-117
- Architecture — Naming/Format/Communication/Process patterns: `architecture.md` lines 408-505
- Architecture — Enforcement & contract test: `architecture.md` lines 509-524
- Architecture — Pattern examples (good/anti): `architecture.md` lines 526-544
- Architecture — Implementation sequence (step 3 = this story): `architecture.md` lines 377-383
- Tier 2 (Bun.serve native HTTP+WS+static): `architecture.md` lines 185-195
- Previous story: `_bmad-output/implementation-artifacts/1-2-server-spawn-and-no-orphan-supervision.md`
- Bun WebSockets / HTML bundling: https://bun.sh/docs/api/websockets , https://bun.sh/docs/bundler/html

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

Commands run (all from repo root):

- `bun test server` (baseline) → 16 pass / 0 fail / 5 files.
- Manual relay smoke (real spawned server): HTTP `/` → 200 with `id="app"`; WS upgrade + `hello`(token) + stdin `render` → WS frame byte-identical to sent envelope (`IDENTICAL true`); unknown + garbage frames → connection stayed alive (2 msgs relayed after).
- `stylua --check .` → exit 0.
- `nvim --headless -i NONE -u tests/minimal_init.lua -l tests/nvim_smoke.lua -c qa` → exit 0.
- `tests/integration/run_orphan_check.sh` → `PASS: no-orphan gate green` (reaped within ~100ms via stdin-EOF path), exit 0.
- `bun build frontend/index.html --outdir dist/frontend` → "Bundled 3 modules" (index.html + bundled index-*.js including ws.ts), exit 0.
- `bun run scripts/release.ts validate-targets` → exit 0.
- `bun test server` (final) → **27 pass / 0 fail / 87 expect() calls / 6 files**.

### Completion Notes List

- Implemented the full Lua→server→browser communication spine. `server/server.ts`: `fetch()` now performs the WS `server.upgrade(req, { data:{subscribed:false} })` (returns `undefined` on success) and routes `/` to the bundled frontend via `Bun.serve` `routes` using the `static.ts` HTML-bundle seam (binary-friendly; no ad-hoc `fs`). Bind stays literal `127.0.0.1:0`.
- WS handlers: `hello{sessionId,token}` validates the per-start token (closure-captured) and subscribes only on a match — missing/wrong token closes the socket and never subscribes; `ack{v}` is a warm-channel no-op; any other/unparseable inbound frame is logged to stderr and ignored (never throws). `close` removes the socket from its session's subscriber set via `sessions.ts`. A `render` case was added to the stdin `handleMessage()` that re-serializes the verbatim envelope (`JSON.stringify`, one JSON object per WS frame) and fans it out to exactly that session's subscribers; unknown session / zero subscribers is a silent no-op. `v` is never minted or mutated. Every WS send is wrapped (`safeSend`) so a dead socket can't throw across the broadcast loop.
- `server/sessions.ts`: `Session` gained `subscribers: Set<Subscriber>` (init empty in `register`); added `subscribe`/`unsubscribe`/`subscribersOf`. Subscriber-set mutation is confined to this module (single-owner invariant). `size` remains the session count, never the subscriber count.
- `frontend/ws.ts`: real `WebSocket` client — reads `sessionId`/`token` from `location.search`, sends `hello` on open, dispatches inbound envelopes by `type` to callbacks; types imported from `frontend/protocol.ts` (never redefined). `frontend/main.ts` wires it and only stashes/logs `render`/`error_display`/`session_closed` (no DOM render; no d3-graphviz/@hpcc-js import — Story 1.4).
- Scope guards honored: NO real WASM/Graphviz render, NO browser open (1.4); NO debounce/`v`-minting/latest-wins (1.5); NO last-good/error-overlay (1.6). A SEAM comment marks where 1.4/1.6 will replay `lastGoodDot` on subscribe.
- No protocol types added (the `MessageType` union already covered every type used); `protocol.lua` mirror left intact. `server.lua` `M.send` already carries arbitrary camelCase envelopes — unchanged.
- Tests: added `server/relay.test.ts` (contract round-trip [load-bearing], token rejection (wrong+missing), per-session isolation, zero-subscriber no-op, unknown/garbage-frame survival, close-removes-subscriber) and extended `server/sessions.test.ts` (empty-set init, subscribe, implicit register, idempotent unsubscribe, size invariant, unknown-session iterable). Co-located under `server/`, auto-picked-up by the CI `bun test server` step.

### File List

- server/server.ts (modified)
- server/sessions.ts (modified)
- server/static.ts (modified)
- server/relay.test.ts (new)
- server/sessions.test.ts (modified)
- frontend/ws.ts (modified)
- frontend/main.ts (modified)
- _bmad-output/implementation-artifacts/1-3-message-protocol-and-websocket-relay.md (story doc)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status → review)

### Change Log

- 2026-06-03: Created Story 1.3 context (message protocol + WebSocket relay). Status → ready-for-dev.
- 2026-06-03: Implemented the message-protocol + WebSocket relay spine — static HTTP serving, WS upgrade + token-gated `hello`/`ack`/unknown handling, per-session `render` fan-out, `sessions.ts` subscriber set, real frontend WS client; added contract/round-trip + isolation + token-reject + unknown-frame tests (bun test server: 27 pass). Status → review.
