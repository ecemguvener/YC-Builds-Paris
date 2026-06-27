import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "BarkanWidget",
      formats: ["iife"],
      fileName: () => "widget.js"
    }
  }
});
