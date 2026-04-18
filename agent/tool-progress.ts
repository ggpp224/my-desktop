/* AI 生成 By Peng.Guo */
/** 工具执行阶段向 SSE / UI 推送的进度事件（与首轮 LLM 流式分离） */

export type ToolProgressEvent =
  | { phase: 'start'; tool: string }
  | { phase: 'progress'; tool: string; message: string }
  /** 工具内部再调模型时的 token 流（如周报 Ollama 生成），供 UI 展示正文而非字数 */
  | { phase: 'stream_delta'; tool: string; thinkingDelta?: string; contentDelta?: string }
  | { phase: 'done'; tool: string; ok: boolean; message?: string };

export type ToolProgressCallback = (e: ToolProgressEvent) => void;

export type RouteExecuteContext = {
  onToolProgress?: ToolProgressCallback;
};
