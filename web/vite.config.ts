import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const api = "http://localhost:8787";

export default defineConfig({
  root: here("."),
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": here("./src") } },
  build: { outDir: here("../assets"), emptyOutDir: true, assetsDir: "static" },
  server: {
    port: 5173,
    proxy: { "/api": api, "/auth": api, "/mcp": api },
  },
});
