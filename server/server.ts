import { PROTOCOL_VERSION } from "./protocol";
import { staticAssetRoot } from "./static";

export function bundledFrontendEntry(): unknown {
  return staticAssetRoot();
}

export function main(): number {
  void bundledFrontendEntry();
  console.error(`interactive-graphviz server scaffold protocol=${PROTOCOL_VERSION}`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = main();
}
