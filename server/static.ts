import type { HTMLBundle } from "bun";
import frontendEntry from "../frontend/index.html";

// The bundled frontend entrypoint. Importing the HTML lets Bun bundle index.html
// plus its TS/JS module graph at build time; the same value is servable under
// `bun run` AND a `bun build --compile` binary (Epic 3) — no ad-hoc `fs` reads.
// Routing `/` to this through `Bun.serve`'s `routes` is the binary-friendly path.
export function staticAssetRoot(): HTMLBundle {
  return frontendEntry as HTMLBundle;
}
