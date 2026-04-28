import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      // REST API
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
      // WebSocket
      "/ws": {
        target: "ws://localhost:8787",
        ws: true,
      },
    },
  },
});

