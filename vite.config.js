import { defineConfig } from "vite";

export default defineConfig({
  root: "frontend",
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
