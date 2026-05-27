import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: appRoot,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4167"
    }
  },
  preview: {
    port: 5173
  },
  build: {
    outDir: "dist"
  }
});
