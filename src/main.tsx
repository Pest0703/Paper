import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./error.css";
import { App } from "./App";

if (import.meta.env.DEV) {
  performance.mark("renderer-start");
  console.info("[Startup Performance] Renderer Start");
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
