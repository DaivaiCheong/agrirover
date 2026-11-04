import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Docker on Windows does not forward file-change events into the container,
  // so without polling the browser keeps showing the old code.
  server: { port: 5173, host: true, watch: { usePolling: true, interval: 300 } },
});
