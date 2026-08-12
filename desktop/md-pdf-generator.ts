/* AI 生成 By Peng.Guo */
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { buildHtmlDocumentFromMdFile, getMermaidMinJsPath } from '../tools/md-to-pdf.js';

const PDF_RENDER_DELAY_MS = 500;
/** 大文档排版 + printToPDF 预留时间 */
const LOAD_TIMEOUT_MS = 120_000;
const MERMAID_RENDER_TIMEOUT_MS = 90_000;

async function runMermaidDiagrams(win: BrowserWindow): Promise<void> {
  const script = `
    (async () => {
      await new Promise((resolve, reject) => {
        if (globalThis.mermaid) {
          resolve();
          return;
        }
        const existing = document.querySelector('script[data-md-pdf-mermaid]');
        if (existing) {
          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error('Mermaid 脚本加载失败')), { once: true });
          return;
        }
        const s = document.createElement('script');
        s.src = './mermaid.min.js';
        s.setAttribute('data-md-pdf-mermaid', '1');
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Mermaid 脚本加载失败'));
        document.head.appendChild(s);
      });
      const mermaid = globalThis.mermaid;
      if (!mermaid) throw new Error('Mermaid 未就绪');
      mermaid.initialize({
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'loose',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      });
      const blocks = Array.from(document.querySelectorAll('pre.md-mermaid-pending'));
      for (let i = 0; i < blocks.length; i++) {
        const el = blocks[i];
        const raw = el.getAttribute('data-diagram') || '';
        let code = '';
        try {
          code = decodeURIComponent(raw);
        } catch {
          code = raw;
        }
        code = code.trim();
        if (!code) continue;
        const id = 'md-pdf-mermaid-' + i;
        try {
          const { svg } = await mermaid.render(id, code);
          const wrap = document.createElement('div');
          wrap.className = 'mermaid-svg-wrap';
          wrap.innerHTML = svg;
          el.replaceWith(wrap);
        } catch (err) {
          const errEl = document.createElement('pre');
          errEl.className = 'mermaid-error';
          errEl.textContent = 'Mermaid 渲染失败: ' + (err && err.message ? err.message : String(err));
          el.replaceWith(errEl);
        }
      }
      return { count: blocks.length };
    })()
  `;
  const mermaidTimeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Mermaid 图表渲染超时')), MERMAID_RENDER_TIMEOUT_MS);
  });
  await Promise.race([win.webContents.executeJavaScript(script, true), mermaidTimeout]);
}

async function waitForPageReady(win: BrowserWindow): Promise<void> {
  await new Promise((r) => setTimeout(r, PDF_RENDER_DELAY_MS));
  try {
    await win.webContents.executeJavaScript(
      `(async () => {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      })()`,
      true
    );
  } catch {
    // 预览页无脚本错误时忽略
  }
}

async function printHtmlToPdf(html: string, options?: { renderMermaid?: boolean }): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  const tempDir = await mkdtemp(path.join(tmpdir(), 'md-pdf-'));
  const htmlPath = path.join(tempDir, 'preview.html');
  try {
    if (options?.renderMermaid) {
      await copyFile(getMermaidMinJsPath(), path.join(tempDir, 'mermaid.min.js'));
    }
    await writeFile(htmlPath, html, 'utf8');
    const loadDone = win.loadFile(htmlPath);
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('渲染 HTML 超时')), LOAD_TIMEOUT_MS);
    });
    await Promise.race([loadDone, timeout]);
    if (options?.renderMermaid) {
      await runMermaidDiagrams(win);
    }
    await waitForPageReady(win);
    return await win.webContents.printToPDF({
      printBackground: true,
      margins: { marginType: 'default' },
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    if (!win.isDestroyed()) win.destroy();
  }
}

export type MdToPdfResult = {
  success: boolean;
  mdPath?: string;
  pdfPath?: string;
  error?: string;
};

/** 读取 MD 文件，输出到本机下载目录（可用 MD_PDF_OUTPUT_DIR 覆盖） */
export async function generateMdPdfFromSource(mdFilePath: string): Promise<MdToPdfResult> {
  try {
    const { html, pdfPath, hasMermaid } = await buildHtmlDocumentFromMdFile(
      mdFilePath,
      app.getPath('downloads')
    );
    const pdfBuffer = await printHtmlToPdf(html, { renderMermaid: hasMermaid });
    await mkdir(path.dirname(pdfPath), { recursive: true });
    await writeFile(pdfPath, pdfBuffer);
    return { success: true, mdPath: mdFilePath, pdfPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, mdPath: mdFilePath, error: message };
  }
}
