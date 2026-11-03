import { resolve } from "node:path";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [viteReact()],
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "src") },
  },
  build: {
    outDir: "android/www",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: resolve(import.meta.dirname, "apk/index.html"),
      output: {
        inlineDynamicImports: true,
        entryFileNames: "app.js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
