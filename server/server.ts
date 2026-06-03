import { PROTOCOL_VERSION, type ProtocolMessage } from "./protocol";
import { staticAssetRoot } from "./static";
import { SessionRegistry } from "./sessions";
import { encodeLine, LineBuffer } from "./stdio";

export function bundledFrontendEntry(): unknown {
  return staticAssetRoot();
}

// Backstop only. The primary no-orphan signal is stdin EOF (the OS closes the
// child's stdin when the parent Neovim dies, including `kill -9`). The heartbeat
// catches the rare case where the pipe stays open but Neovim has gone silent.
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 6000;

export function heartbeatTimeoutMs(): number {
  const raw = process.env.IG_HEARTBEAT_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HEARTBEAT_TIMEOUT_MS;
}

// Diagnostics go to stderr; stdout is the protocol channel.
function diag(message: string): void {
  console.error(`interactive-graphviz server: ${message}`);
}

function writeStdout(message: ProtocolMessage): void {
  process.stdout.write(encodeLine(message));
}

export function main(): number {
  void bundledFrontendEntry();

  const sessions = new SessionRegistry();

  const server = Bun.serve({
    hostname: "127.0.0.1", // literal loopback (NFR-4) — never 0.0.0.0 / localhost / ::1
    port: 0, // ephemeral; the real port is read back below
    fetch() {
      // No frontend/relay served yet (Stories 1.3/1.4). The listener exists only
      // so this process owns a real bound port to announce.
      return new Response(null, { status: 503 });
    },
    websocket: {
      // Browser return channel goes live in Story 1.3; ignore traffic for now.
      message() {},
      open() {},
      close() {},
    },
  });

  const token = crypto.randomUUID();
  writeStdout({ type: "ready", port: server.port, token });
  diag(`ready protocol=${PROTOCOL_VERSION} port=${server.port}`);

  const timeoutMs = heartbeatTimeoutMs();
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function shutdown(code = 0): void {
    if (stopped) {
      return;
    }
    stopped = true;
    if (watchdog) {
      clearTimeout(watchdog);
    }
    try {
      server.stop(true);
    } catch {
      // best-effort; we are exiting anyway
    }
    process.exit(code);
  }

  function armWatchdog(): void {
    if (watchdog) {
      clearTimeout(watchdog);
    }
    watchdog = setTimeout(() => {
      diag("heartbeat timeout; exiting");
      shutdown(0);
    }, timeoutMs);
  }

  function handleMessage(message: ProtocolMessage): void {
    switch (message.type) {
      case "session_open":
        if (typeof message.sessionId === "number") {
          sessions.register(message.sessionId);
        }
        break;
      case "session_close":
        if (typeof message.sessionId === "number") {
          sessions.unregister(message.sessionId);
        }
        break;
      case "ping":
        writeStdout({ type: "pong" });
        break;
      case "shutdown":
        shutdown(0);
        break;
      default:
        diag(`ignoring message type=${String(message.type)}`);
    }
  }

  armWatchdog();

  void (async () => {
    const decoder = new TextDecoder();
    const buffer = new LineBuffer();
    try {
      for await (const chunk of Bun.stdin.stream()) {
        armWatchdog(); // any stdin traffic counts as liveness
        for (const line of buffer.push(decoder.decode(chunk, { stream: true }))) {
          let parsed: ProtocolMessage;
          try {
            parsed = JSON.parse(line) as ProtocolMessage;
          } catch {
            diag(`bad json line dropped: ${line}`);
            continue;
          }
          handleMessage(parsed);
        }
      }
    } catch (err) {
      diag(`stdin error: ${String(err)}`);
    }
    // stdin closed (EOF) → parent gone → self-terminate. This is the load-bearing
    // no-orphan guarantee (survives `kill -9` of the parent).
    diag("stdin EOF; exiting");
    shutdown(0);
  })();

  return 0;
}

if (import.meta.main) {
  main();
}
