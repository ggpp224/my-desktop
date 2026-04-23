/* AI 生成 By Peng.Guo */
import { useMemo, useRef, useState, type ChangeEvent } from 'react';

type UploadItem = { path: string; content: string };

interface KnowledgeBasePanelProps {
  apiBase: string;
  addLog: (line: string) => void;
}

export function KnowledgeBasePanel({ apiBase, addLog }: KnowledgeBasePanelProps) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const mdCount = useMemo(
    () => selectedFiles.filter((file) => file.name.toLowerCase().endsWith('.md')).length,
    [selectedFiles]
  );

  const chooseFolder = () => pickerRef.current?.click();

  const onSelectFolder = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setSelectedFiles(files);
    setResult(null);
  };

  const importFolder = async () => {
    if (!apiBase) return;
    const mdFiles = selectedFiles.filter((file) => file.name.toLowerCase().endsWith('.md'));
    if (mdFiles.length === 0) {
      setResult({ success: false, message: '所选目录没有 Markdown 文件（.md）' });
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const payload: UploadItem[] = await Promise.all(
        mdFiles.map(async (file) => ({
          path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
          content: await file.text(),
        }))
      );
      addLog(`开始导入私人知识库：${payload.length} 个 Markdown 文件`);
      const res = await fetch(`${apiBase}/knowledge-base/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceName: sourceName.trim(),
          files: payload,
        }),
      });
      const data = (await res.json()) as { success?: boolean; imported?: number; targetDir?: string; error?: string };
      if (!res.ok || !data.success) {
        const msg = data.error || `导入失败(${res.status})`;
        setResult({ success: false, message: msg });
        addLog(`私人知识库导入失败：${msg}`);
        return;
      }
      const msg = `导入成功：${data.imported ?? 0} 个文件，目录 ${data.targetDir ?? '--'}`;
      setResult({ success: true, message: msg });
      addLog(msg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ success: false, message: msg });
      addLog(`私人知识库导入失败：${msg}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16 }}>
      <div style={{ marginBottom: 12, color: '#cbd5e1', fontSize: 14 }}>
        选择一个本地目录，将目录下所有 <code>.md</code> 文档导入私人知识库。导入后可直接在聊天中提问。
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          type="button"
          onClick={chooseFolder}
          style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #334155', background: '#0f3460', color: '#e2e8f0', cursor: 'pointer' }}
        >
          选择目录
        </button>
        <input
          ref={pickerRef}
          type="file"
          multiple
          // @ts-expect-error - webkitdirectory is supported in Chromium/Electron
          webkitdirectory=""
          style={{ display: 'none' }}
          onChange={onSelectFolder}
        />
        <input
          value={sourceName}
          onChange={(e) => setSourceName(e.target.value)}
          placeholder="可选：导入名称（如 react18-docs）"
          style={{
            minWidth: 280,
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid #334155',
            background: '#0f172a',
            color: '#e2e8f0',
          }}
        />
        <button
          type="button"
          onClick={importFolder}
          disabled={uploading || mdCount === 0}
          style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #334155', background: uploading ? '#334155' : '#1d4ed8', color: '#f8fafc', cursor: uploading ? 'not-allowed' : 'pointer' }}
        >
          {uploading ? '导入中...' : '加入知识库'}
        </button>
      </div>
      <div style={{ marginBottom: 10, color: '#94a3b8', fontSize: 12 }}>
        已选择文件：{selectedFiles.length} 个，其中 Markdown：{mdCount} 个
      </div>
      {result && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 6,
            border: `1px solid ${result.success ? '#14532d' : '#7f1d1d'}`,
            background: result.success ? '#052e16' : '#450a0a',
            color: result.success ? '#86efac' : '#fecaca',
            fontSize: 13,
          }}
        >
          {result.message}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#0d0d1a', border: '1px solid #1f2937', borderRadius: 8, padding: 10 }}>
        {selectedFiles.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: 13 }}>尚未选择目录</div>
        ) : (
          selectedFiles.slice(0, 200).map((file, idx) => {
            const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
            const isMd = file.name.toLowerCase().endsWith('.md');
            return (
              <div key={`${rel}-${idx}`} style={{ color: isMd ? '#cbd5e1' : '#64748b', fontSize: 12, marginBottom: 4 }}>
                {rel}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
