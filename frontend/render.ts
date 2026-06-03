export interface Renderer {
  describe(): string;
}

export function createRenderer(): Renderer {
  return {
    describe() {
      return "Graphviz renderer scaffold";
    },
  };
}
