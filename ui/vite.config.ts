/* AI 生成 By Peng.Guo */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Electron 用 loadFile 加载 file://，必须用相对路径否则 /assets/xxx.js 会请求到盘符根导致白屏
  base: './',
  build: { outDir: 'dist' },
});
