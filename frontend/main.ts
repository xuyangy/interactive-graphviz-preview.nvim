import { createRenderer } from "./render";

const renderer = createRenderer();
const app = document.getElementById("app");

if (app) {
  app.textContent = renderer.describe();
}
