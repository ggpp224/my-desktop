/* AI 生成 By Peng.Guo */

import { useCallback, useState } from 'react';
import { postGeminiTest } from '../../infrastructure/llm/geminiTestApi';

export type GeminiConnectionTestState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'success'; message: string }
  | { phase: 'error'; message: string };

export function useGeminiConnectionTest(apiBase: string) {
  const [state, setState] = useState<GeminiConnectionTestState>({ phase: 'idle' });

  const runTest = useCallback(
    async (body: { apiKey?: string; model?: string; baseUrl?: string }) => {
      setState({ phase: 'loading' });
      try {
        const result = await postGeminiTest(apiBase, body);
        if (result.ok) {
          setState({ phase: 'success', message: result.message });
        } else {
          setState({ phase: 'error', message: result.error });
        }
      } catch (e) {
        setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    },
    [apiBase],
  );

  const clear = useCallback(() => setState({ phase: 'idle' }), []);

  return { state, runTest, clear };
}
