import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => mode === "ecosystem-worker" ? {
  publicDir: false,
  build: {
    target: "es2022",
    outDir: "dist/worker",
    lib: { entry: "worker/index.ts", formats: ["es"], fileName: () => "production-studio.mjs" },
    rollupOptions: { external: ["cloudflare:workers"] },
  },
} : {
  base: "/production-studio/",
  plugins: [react()],
  build: { target: "es2022", outDir: "dist/client" },
});
