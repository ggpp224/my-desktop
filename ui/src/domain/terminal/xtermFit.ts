/* AI 生成 By Peng.Guo */
import type { FitAddon } from 'xterm-addon-fit';
import type { Terminal } from 'xterm';

/** xterm 首帧渲染完成前 _renderService.dimensions 为 undefined，此时 fit 会抛 dimensions 错误 */
export function isXtermRenderReady(terminal: Terminal): boolean {
  const core = (terminal as unknown as { _core?: { _renderService?: { dimensions?: { css?: { cell?: { width?: number; height?: number } } } } } })
    ._core;
  const cell = core?._renderService?.dimensions?.css?.cell;
  return Boolean(cell && (cell.width ?? 0) > 0 && (cell.height ?? 0) > 0);
}

export function safeFitXterm(fitAddon: FitAddon, terminal: Terminal): boolean {
  if (!isXtermRenderReady(terminal)) return false;
  try {
    const dims = fitAddon.proposeDimensions();
    if (!dims || dims.cols < 2 || dims.rows < 1) return false;
    if (terminal.cols !== dims.cols || terminal.rows !== dims.rows) {
      terminal.resize(dims.cols, dims.rows);
    }
    return true;
  } catch {
    return false;
  }
}
