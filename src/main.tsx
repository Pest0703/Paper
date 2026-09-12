import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./error.css";

if (import.meta.env.DEV) {
  performance.mark("renderer-start");
  console.info("[Startup Performance] Renderer Start");
}
const noteWindow = new URLSearchParams(location.search).get("window") === "notes";
void (noteWindow ? import("./NoteWindowApp") : import("./App")).then((module) => {
  const Component = noteWindow
    ? (module as typeof import("./NoteWindowApp")).NoteWindowApp
    : (module as typeof import("./App")).App;
  createRoot(document.getElementById("root")!).render(
    <StrictMode><Component /></StrictMode>,
  );
});
