import { PROTOCOL_VERSION } from "./protocol";

export function main(): number {
  console.error(`interactive-graphviz server scaffold protocol=${PROTOCOL_VERSION}`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = main();
}
