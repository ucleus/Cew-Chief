import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  // Deployed at /ac/ on the server (a sibling of the root MotoGP app), so
  // production asset references need that prefix. Dev server stays at root
  // for a plain `npm run dev` workflow.
  base: command === "build" ? "/ac/" : "/",
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
}));
