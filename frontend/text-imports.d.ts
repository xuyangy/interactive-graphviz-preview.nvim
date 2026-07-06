// Bun inlines `import ... with { type: "text" }` as a plain string at build
// time (see style.ts / styles.css). This ambient declaration is editor-only:
// Bun itself needs no help resolving the import.
declare module "*.css" {
  const text: string;
  export default text;
}
