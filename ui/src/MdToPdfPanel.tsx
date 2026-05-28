/* AI 生成 By Peng.Guo */
import { useRef, useState, type ChangeEvent } from 'react';
import type { AppThemeTokens } from './domain/theme/appTheme';
import { Button } from './view/Button';

type MdToPdfResult = {
  success: boolean;
  mdPath?: string;
  pdfPath?: string;
  error?: string;
};

type ElectronMdPdfApi = {
  pickMdFile?: () => Promise<{ canceled: boolean; filePath?: string }>;
  generateMdPdf?: (mdFilePath: string) => Promise<MdToPdfResult>;
};

interface MdToPdfPanelProps {
  addLog: (line: string) => void;
  themeTokens: AppThemeTokens;
}

function getElectronMdPdfApi(): ElectronMdPdfApi | undefined {
  return (window as Window & { electronAPI?: ElectronMdPdfApi }).electronAPI;
}

export function MdToPdfPanel({ addLog, themeTokens }: MdToPdfPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mdPath, setMdPath] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<MdToPdfResult | null>(null);

  const electronApi = getElectronMdPdfApi();
  const canGenerate = Boolean(mdPath.trim()) && Boolean(electronApi?.generateMdPdf);

  const pickViaDialog = async () => {
    if (!electronApi?.pickMdFile) {
      fileInputRef.current?.click();
      return;
    }
    const picked = await electronApi.pickMdFile();
    if (picked.canceled || !picked.filePath) return;
    setMdPath(picked.filePath);
    setResult(null);
  };

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const pathFromElectron = (file as File & { path?: string }).path;
    if (pathFromElectron) {
      setMdPath(pathFromElectron);
      setResult(null);
      return;
    }
    setResult({
      success: false,
      error: '无法获取本地文件路径，请使用「选择 MD 文件」按钮（需 Electron 桌面端）',
    });
    event.target.value = '';
  };

  const generate = async () => {
    const path = mdPath.trim();
    if (!path) return;
    if (!electronApi?.generateMdPdf) {
      setResult({ success: false, error: 'PDF 生成仅支持 Electron 桌面端' });
      return;
    }
    setGenerating(true);
    setResult(null);
    addLog(`开始生成 PDF：${path}`);
    try {
      const data = await electronApi.generateMdPdf(path);
      setResult(data);
      if (data.success && data.pdfPath) {
        addLog(`PDF 已生成：${data.pdfPath}`);
      } else {
        addLog(`PDF 生成失败：${data.error ?? '未知错误'}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ success: false, error: msg });
      addLog(`PDF 生成失败：${msg}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: themeTokens.textPrimary }}>MD 生成 PDF</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: themeTokens.textSecondary, lineHeight: 1.6 }}>
        选择本地 <code>.md</code> 文件，点击「生成」后会在<strong>该文件同目录</strong>下输出同名
        <code>.pdf</code>，排版为 GitLab 风格（含表格、代码高亮、<code>```mermaid</code> 流程图 / subgraph）。
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <Button themeTokens={themeTokens} onClick={() => void pickViaDialog()} variant="solid" size="md">
          选择 MD 文件
        </Button>
        <Button
          themeTokens={themeTokens}
          onClick={() => fileInputRef.current?.click()}
          variant="soft"
          size="md"
        >
          上传 MD
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,text/markdown"
          style={{ display: 'none' }}
          onChange={onFileInputChange}
        />
        <Button
          themeTokens={themeTokens}
          onClick={() => void generate()}
          variant="solid"
          size="md"
          loading={generating}
          disabled={!canGenerate}
        >
          生成
        </Button>
      </div>
      {mdPath ? (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 6,
            border: `1px solid ${themeTokens.inputBorder}`,
            background: themeTokens.workspacePanelSubtleBackground,
            fontSize: 12,
            color: themeTokens.textPrimary,
            wordBreak: 'break-all',
          }}
        >
          已选文件：{mdPath}
        </div>
      ) : (
        <div style={{ marginBottom: 12, fontSize: 12, color: themeTokens.textSecondary }}>尚未选择文件</div>
      )}
      {result && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 6,
            border: `1px solid ${result.success ? themeTokens.tabActiveBorder : themeTokens.statusWarning}`,
            background: themeTokens.workspacePanelSubtleBackground,
            fontSize: 13,
            color: result.success ? themeTokens.textPrimary : themeTokens.statusWarning,
            lineHeight: 1.6,
          }}
        >
          {result.success ? (
            <>
              生成成功
              {result.pdfPath ? (
                <>
                  <br />
                  输出：{result.pdfPath}
                </>
              ) : null}
            </>
          ) : (
            <>生成失败：{result.error ?? '未知错误'}</>
          )}
        </div>
      )}
      {!electronApi?.generateMdPdf && (
        <p style={{ marginTop: 12, fontSize: 12, color: themeTokens.statusWarning }}>
          当前为浏览器预览模式，无法写入本地 PDF。请使用 Electron 桌面应用（yarn dev）打开本页签。
        </p>
      )}
    </section>
  );
}
