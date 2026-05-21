/* AI 生成 By Peng.Guo */
import { useCallback, useEffect, useState } from 'react';
import type { CommandCapabilityResponse } from '../../domain/capability/models';
import { fetchCommandCapabilities } from '../../infrastructure/capability/commandCapabilityApi';

export function useCommandCapability(apiBase: string) {
  const [data, setData] = useState<CommandCapabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchCommandCapabilities(apiBase);
      setData(next);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}
