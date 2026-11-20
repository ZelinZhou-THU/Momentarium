import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 平台后端：开发期由 Vite 代理 /api 与 /vendor，避免前端跨域；前端运行不依赖数据库。
const PLATFORM_BACKEND = "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": PLATFORM_BACKEND,
      "/vendor": PLATFORM_BACKEND,
    },
  },
});
