/* AI 生成 By Peng.Guo */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentChatLlmBody } from '../../domain/llm/agentLlmRequest.js';
import type { TechDigestInnerTab, TechDigestReport, TechDigestScope } from '../../domain/trends/models.js';
import { fetchTechDigestLatestAll, postTechDigestRefreshStream } from '../../infrastructure/trends/techDigestApi.js';

async function runScopeRefresh(
  apiBase: string,
  scope: TechDigestScope,
  signal: AbortSignal,
  llmBody: AgentChatLlmBody | undefined,
  handlers: {
    onProgress: (message: string) => void;
    onLlmDelta?: (d: { contentDelta?: string; thinkingDelta?: string }) => void;
  }
): Promise<{ report: TechDigestReport | null; error: string }> {
  let report: TechDigestReport | null = null;
  let error = '';

  await postTechDigestRefreshStream(
    apiBase,
    scope,
    signal,
    {
      onProgress: handlers.onProgress,
      onLlmDelta: handlers.onLlmDelta,
      onResult: (next) => {
        report = next;
      },
      onError: (message) => {
        if (!signal.aborted) error = message;
      },
    },
    llmBody ? { llm: llmBody } : undefined
  );

  if (!report && !signal.aborted && !error) {
    error = '刷新未完成';
  }
  return { report, error };
}

export function useTechDigest(apiBase: string, llmBody?: AgentChatLlmBody, addLog?: (line: string) => void) {
  const [dailyReport, setDailyReport] = useState<TechDigestReport | null>(null);
  const [monthlyReport, setMonthlyReport] = useState<TechDigestReport | null>(null);
  const [halfYearReport, setHalfYearReport] = useState<TechDigestReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshingDaily, setRefreshingDaily] = useState(false);
  const [refreshingLongTerm, setRefreshingLongTerm] = useState(false);
  const [errorDaily, setErrorDaily] = useState('');
  const [errorLongTerm, setErrorLongTerm] = useState('');
  const [progressDaily, setProgressDaily] = useState('');
  const [progressLongTerm, setProgressLongTerm] = useState('');
  const [streamPreviewDaily, setStreamPreviewDaily] = useState('');
  const [streamPreviewLongTerm, setStreamPreviewLongTerm] = useState('');
  const [activeInnerTab, setActiveInnerTab] = useState<TechDigestInnerTab>('daily');
  const logDigest = useCallback(
    (line: string) => {
      addLog?.(`[技术趋势] ${line}`);
    },
    [addLog]
  );

  const emitProgress = useCallback(
    (setProgress: (message: string) => void, message: string) => {
      setProgress(message);
      logDigest(message);
    },
    [logDigest]
  );
  const abortDailyRef = useRef<AbortController | null>(null);
  const abortLongTermRef = useRef<AbortController | null>(null);

  const loadLatest = useCallback(async () => {
    if (!apiBase) return;
    setLoading(true);
    setErrorDaily('');
    setErrorLongTerm('');
    try {
      const res = await fetchTechDigestLatestAll(apiBase);
      if (!res.success) {
        const msg = res.error ?? '读取失败';
        setErrorDaily(msg);
        return;
      }
      setDailyReport(res.daily ?? null);
      setMonthlyReport(res.monthly ?? null);
      setHalfYearReport(res.halfYear ?? null);
    } catch (e) {
      setErrorDaily(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  const cancelRefreshDaily = useCallback(() => {
    abortDailyRef.current?.abort();
    abortDailyRef.current = null;
    setRefreshingDaily(false);
    setProgressDaily('');
    logDigest('已取消今日刷新');
  }, [logDigest]);

  const cancelRefreshLongTerm = useCallback(() => {
    abortLongTermRef.current?.abort();
    abortLongTermRef.current = null;
    setRefreshingLongTerm(false);
    setProgressLongTerm('');
    logDigest('已取消中长周期刷新');
  }, [logDigest]);

  const refreshDaily = useCallback(async () => {
    if (!apiBase || refreshingDaily) return;
    abortDailyRef.current?.abort();
    const ac = new AbortController();
    abortDailyRef.current = ac;
    setRefreshingDaily(true);
    setErrorDaily('');
    emitProgress(setProgressDaily, '准备刷新今日…');
    setStreamPreviewDaily('');

    try {
      const { report, error } = await runScopeRefresh(apiBase, 'daily', ac.signal, llmBody, {
        onProgress: (message) => emitProgress(setProgressDaily, message),
        onLlmDelta: (d) => {
          if (d.contentDelta) setStreamPreviewDaily((prev) => prev + d.contentDelta);
        },
      });

      if (report) {
        setDailyReport(report);
        logDigest('今日刷新完成');
      } else if (!ac.signal.aborted && error) {
        setErrorDaily(error);
        logDigest(`今日刷新失败：${error}`);
      }
    } finally {
      setRefreshingDaily(false);
      setProgressDaily('');
      abortDailyRef.current = null;
    }
  }, [apiBase, emitProgress, llmBody, logDigest, refreshingDaily]);

  const refreshLongTerm = useCallback(async () => {
    if (!apiBase || refreshingLongTerm) return;
    abortLongTermRef.current?.abort();
    const ac = new AbortController();
    abortLongTermRef.current = ac;
    setRefreshingLongTerm(true);
    setErrorLongTerm('');
    emitProgress(setProgressLongTerm, '准备刷新本月…');
    setStreamPreviewLongTerm('');

    try {
      const monthly = await runScopeRefresh(apiBase, 'monthly', ac.signal, llmBody, {
        onProgress: (message) => emitProgress(setProgressLongTerm, `[本月] ${message}`),
        onLlmDelta: (d) => {
          if (d.contentDelta) setStreamPreviewLongTerm((prev) => prev + d.contentDelta);
        },
      });

      if (monthly.report) {
        setMonthlyReport(monthly.report);
        logDigest('本月刷新完成');
      } else if (!ac.signal.aborted && monthly.error) {
        setErrorLongTerm(monthly.error);
        logDigest(`本月刷新失败：${monthly.error}`);
        return;
      }

      if (ac.signal.aborted) return;

      emitProgress(setProgressLongTerm, '准备刷新半年度…');
      setStreamPreviewLongTerm('');

      const halfYear = await runScopeRefresh(apiBase, 'halfYear', ac.signal, llmBody, {
        onProgress: (message) => emitProgress(setProgressLongTerm, `[半年度] ${message}`),
        onLlmDelta: (d) => {
          if (d.contentDelta) setStreamPreviewLongTerm((prev) => prev + d.contentDelta);
        },
      });

      if (halfYear.report) {
        setHalfYearReport(halfYear.report);
        logDigest('半年度刷新完成');
      } else if (!ac.signal.aborted) {
        setErrorLongTerm((prev) => prev || halfYear.error || '半年度刷新未完成');
        logDigest(`半年度刷新失败：${halfYear.error || '未完成'}`);
      }
    } finally {
      setRefreshingLongTerm(false);
      setProgressLongTerm('');
      abortLongTermRef.current = null;
    }
  }, [apiBase, emitProgress, llmBody, logDigest, refreshingLongTerm]);

  const refreshing = activeInnerTab === 'daily' ? refreshingDaily : refreshingLongTerm;
  const progress = activeInnerTab === 'daily' ? progressDaily : progressLongTerm;
  const error = activeInnerTab === 'daily' ? errorDaily : errorLongTerm;
  const streamPreview = activeInnerTab === 'daily' ? streamPreviewDaily : streamPreviewLongTerm;

  const cancelRefresh = activeInnerTab === 'daily' ? cancelRefreshDaily : cancelRefreshLongTerm;
  const refresh = activeInnerTab === 'daily' ? refreshDaily : refreshLongTerm;

  return {
    dailyReport,
    monthlyReport,
    halfYearReport,
    loading,
    refreshing,
    refreshingDaily,
    refreshingLongTerm,
    error,
    errorDaily,
    errorLongTerm,
    progress,
    progressDaily,
    progressLongTerm,
    streamPreview,
    activeInnerTab,
    setActiveInnerTab,
    loadLatest,
    refresh,
    refreshDaily,
    refreshLongTerm,
    cancelRefresh,
    cancelRefreshDaily,
    cancelRefreshLongTerm,
  };
}
