/* AI 生成 By Peng.Guo */
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const uiDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(uiDir, '..');

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@app-config': path.join(repoRoot, 'config'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [repoRoot],
    },
  },
  // 开发：Electron 通过 http://localhost:5173 加载，base 必须为 '/'，否则 ESM 模块无法执行、#root 空白
  // 生产：Electron loadFile(file://) 必须用相对路径，否则 /assets/*.js 会解析到盘符根导致白屏
  base: command === 'serve' ? '/' : './',
  build: { outDir: 'dist' },
}));
