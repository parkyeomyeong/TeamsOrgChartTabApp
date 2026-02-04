import react from "@vitejs/plugin-react";
import fs from "fs";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "./",
  esbuild: {
    tsconfigRaw: fs.readFileSync("./tsconfig.app.json"),
  },
  server: {
    port: 53000,
    https: {
      key: fs.readFileSync(process.env.SSL_KEY_FILE),
      cert: fs.readFileSync(process.env.SSL_CRT_FILE),
    },
  },
});
