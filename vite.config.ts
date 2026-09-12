import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  // electron-builder historically placed the runnable directory under dist.
  // Preserve that occupied directory while rebuilding renderer assets.
  build: { emptyOutDir: false },
});
