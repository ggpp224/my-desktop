/* AI 生成 By Peng.Guo */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pickUsableEnv, pruneSelection, setCasesSelected } from '../../domain/integrationTest/caseSelection';
import type {
  IntegrationTestCatalog,
  IntegrationTestCommandPreview,
  IntegrationTestLastResults,
  IntegrationTestRunMode,
  IntegrationTestSelection,
} from '../../domain/integrationTest/models';
import {
  fetchIntegrationTestCatalog,
  fetchIntegrationTestLastResults,
  previewIntegrationTestCommand,
  runIntegrationTests,
} from '../../infrastructure/integrationTest/integrationTestApi';
import {
  loadIntegrationTestSelection,
  saveIntegrationTestSelection,
} from '../../infrastructure/integrationTest/integrationTestSelectionRepository';

export type IntegrationTestRunFeedback = { ok: boolean; message: string };

export function useIntegrationTestRunner(apiBase: string, addLog: (line: string) => void) {
  const initial = useMemo(() => loadIntegrationTestSelection(), []);
  const [catalog, setCatalog] = useState<IntegrationTestCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [env, setEnv] = useState(initial?.env ?? '');
  const [mode, setMode] = useState<IntegrationTestRunMode>(initial?.mode ?? 'remote');
  const [headless, setHeadless] = useState(initial?.headless ?? false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial?.specs ?? []));
  const [keyword, setKeyword] = useState('');
  const [preview, setPreview] = useState<IntegrationTestCommandPreview | null>(null);
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<IntegrationTestRunFeedback | null>(null);
  const [lastResults, setLastResults] = useState<IntegrationTestLastResults | null>(null);
  const [loadingLastResults, setLoadingLastResults] = useState(false);
  const previewSeq = useRef(0);

  const reload = useCallback(async () => {
    if (!apiBase) return;
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchIntegrationTestCatalog(apiBase);
      setCatalog(data);
      setEnv((prev) => pickUsableEnv(data.envs, prev));
      setSelected((prev) => pruneSelection(prev, data.groups));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selection = useMemo<IntegrationTestSelection>(
    () => ({ env, mode, headless, specs: [...selected] }),
    [env, mode, headless, selected]
  );

  useEffect(() => {
    if (!apiBase || !catalog?.projectExists) {
      setPreview(null);
      return;
    }
    const seq = ++previewSeq.current;
    previewIntegrationTestCommand(apiBase, selection)
      .then((result) => {
        if (seq === previewSeq.current) setPreview(result);
      })
      .catch((e) => {
        if (seq === previewSeq.current) setPreview({ ok: false, error: e instanceof Error ? e.message : String(e) });
      });
  }, [apiBase, catalog, selection]);

  const toggleCases = useCallback((specPaths: string[], checked: boolean) => {
    setSelected((prev) => setCasesSelected(prev, specPaths, checked));
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const loadLastResults = useCallback(async () => {
    if (!apiBase) return;
    setLoadingLastResults(true);
    try {
      setLastResults(await fetchIntegrationTestLastResults(apiBase));
    } catch (e) {
      setLastResults({ cases: {}, reports: [], error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoadingLastResults(false);
    }
  }, [apiBase]);

  const run = useCallback(async () => {
    setRunning(true);
    setFeedback(null);
    try {
      const result = await runIntegrationTests(apiBase, selection);
      if (result.success) {
        saveIntegrationTestSelection(selection);
        setFeedback({ ok: true, message: `已在系统终端启动：${result.command}` });
        addLog(`运行集成用例：${result.command}`);
      } else {
        setFeedback({ ok: false, message: result.error });
        addLog(`运行集成用例失败：${result.error}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setFeedback({ ok: false, message: msg });
      addLog(`运行集成用例失败：${msg}`);
    } finally {
      setRunning(false);
    }
  }, [apiBase, selection, addLog]);

  return {
    catalog,
    loading,
    loadError,
    env,
    setEnv,
    mode,
    setMode,
    headless,
    setHeadless,
    selected,
    toggleCases,
    clearSelection,
    keyword,
    setKeyword,
    preview,
    running,
    feedback,
    run,
    reload,
    lastResults,
    loadingLastResults,
    loadLastResults,
  };
}
