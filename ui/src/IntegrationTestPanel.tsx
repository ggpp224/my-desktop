/* AI 生成 By Peng.Guo */
import { useEffect, useRef, type CSSProperties } from 'react';
import type { AppThemeTokens } from './domain/theme/appTheme';
import {
  caseDisplayTitle,
  groupCheckState,
  matchesCaseFilter,
  type GroupCheckState,
} from './domain/integrationTest/caseSelection';
import { buildCaseTree, folderVisibleCount } from './domain/integrationTest/caseTree';
import {
  describeCaseResult,
  describeReports,
  tallyOutcomes,
  type OutcomeTally,
} from './domain/integrationTest/lastResults';
import type {
  IntegrationTestCase,
  IntegrationTestCaseGroup,
  IntegrationTestCaseResult,
  IntegrationTestLastResults,
  IntegrationTestRunMode,
} from './domain/integrationTest/models';
import { useIntegrationTestRunner } from './viewmodel/integrationTest/useIntegrationTestRunner';
import { Button } from './view/Button';

interface IntegrationTestPanelProps {
  apiBase: string;
  addLog: (line: string) => void;
  themeTokens: AppThemeTokens;
}

const RUN_MODES: Array<{ key: IntegrationTestRunMode; label: string }> = [
  { key: 'remote', label: '远程' },
  { key: 'local', label: '本地' },
];

function GroupCheckbox({
  state,
  accent,
  onChange,
}: {
  state: GroupCheckState;
  accent: string;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'partial';
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'all'}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      style={{ accentColor: accent }}
    />
  );
}

const OUTCOME_MARK_STYLE: CSSProperties = { display: 'inline-block', width: 14, textAlign: 'center', fontWeight: 700, flexShrink: 0 };

function OutcomeMark({ result, themeTokens }: { result?: IntegrationTestCaseResult; themeTokens: AppThemeTokens }) {
  if (!result) return <span style={OUTCOME_MARK_STYLE} />;
  const { mark, color } =
    result.outcome === 'passed'
      ? { mark: '✓', color: themeTokens.statusSuccess }
      : result.outcome === 'failed'
        ? { mark: '✗', color: themeTokens.statusError }
        : { mark: '–', color: themeTokens.textSecondary };
  return (
    <span title={describeCaseResult(result)} style={{ ...OUTCOME_MARK_STYLE, color }}>
      {mark}
    </span>
  );
}

function LastResultsSummary({
  lastResults,
  tally,
  themeTokens,
}: {
  lastResults: IntegrationTestLastResults;
  tally: OutcomeTally;
  themeTokens: AppThemeTokens;
}) {
  return (
    <p style={{ margin: '-4px 0 12px', fontSize: 12, color: themeTokens.textSecondary, wordBreak: 'break-all' }}>
      {lastResults.error ? (
        <span style={{ color: themeTokens.statusWarning }}>{lastResults.error}</span>
      ) : (
        <>
          上次结果（{describeReports(lastResults.reports)}）：
          <span style={{ color: themeTokens.statusSuccess }}>✓ 通过 {tally.passed}</span>
          {' · '}
          <span style={{ color: themeTokens.statusError }}>✗ 失败 {tally.failed}</span>
        </>
      )}
    </p>
  );
}

function GroupOutcomeTally({ tally, themeTokens }: { tally: OutcomeTally; themeTokens: AppThemeTokens }) {
  if (!tally.passed && !tally.failed) return null;
  return (
    <span style={{ fontWeight: 400, fontSize: 12, display: 'inline-flex', gap: 6 }}>
      {tally.passed > 0 && <span style={{ color: themeTokens.statusSuccess }}>✓{tally.passed}</span>}
      {tally.failed > 0 && <span style={{ color: themeTokens.statusError }}>✗{tally.failed}</span>}
    </span>
  );
}

function CaseGroupBlock({
  group,
  visible,
  selected,
  lastCases,
  themeTokens,
  indentPx,
  onToggle,
}: {
  group: IntegrationTestCaseGroup;
  visible: IntegrationTestCase[];
  selected: ReadonlySet<string>;
  lastCases?: Record<string, IntegrationTestCaseResult>;
  themeTokens: AppThemeTokens;
  indentPx: number;
  onToggle: (specPaths: string[], checked: boolean) => void;
}) {
  return (
    <details style={{ marginBottom: 4 }}>
      <summary
        style={{
          cursor: 'pointer',
          padding: `6px 0 6px ${indentPx}px`,
          fontSize: 13,
          fontWeight: 600,
          color: themeTokens.textPrimary,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <GroupCheckbox
            state={groupCheckState(visible, selected)}
            accent={themeTokens.tabActiveBorder}
            onChange={(checked) => onToggle(visible.map((c) => c.specPath), checked)}
          />
          {group.label}
          <span style={{ fontWeight: 400, fontSize: 12, color: themeTokens.textSecondary }}>
            {group.dirPath} · {group.cases.length}
          </span>
          {lastCases && <GroupOutcomeTally tally={tallyOutcomes(group.cases, lastCases)} themeTokens={themeTokens} />}
        </span>
      </summary>
      {visible.map((c) => (
        <label
          key={c.specPath}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            padding: `4px 0 4px ${indentPx + 20}px`,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={selected.has(c.specPath)}
            onChange={(e) => onToggle([c.specPath], e.target.checked)}
            style={{ accentColor: themeTokens.tabActiveBorder, marginTop: 3 }}
          />
          {lastCases && <OutcomeMark result={lastCases[c.specPath]} themeTokens={themeTokens} />}
          <span>
            <span style={{ display: 'block', fontSize: 13, color: themeTokens.textPrimary }}>{caseDisplayTitle(c)}</span>
            {c.titles.length > 0 && (
              <span style={{ display: 'block', fontSize: 11, color: themeTokens.textSecondary }}>{c.fileName}</span>
            )}
          </span>
        </label>
      ))}
    </details>
  );
}

export function IntegrationTestPanel({ apiBase, addLog, themeTokens }: IntegrationTestPanelProps) {
  const vm = useIntegrationTestRunner(apiBase, addLog);
  const catalog = vm.catalog;
  const lastCases = vm.lastResults?.cases;
  const groups = catalog?.groups ?? [];
  const totalCases = groups.reduce((n, g) => n + g.cases.length, 0);
  const visibleGroups = groups
    .map((g) => ({ group: g, visible: g.cases.filter((c) => matchesCaseFilter(c, vm.keyword)) }))
    .filter((g) => g.visible.length > 0);
  const caseTree = buildCaseTree(visibleGroups);
  const currentEnv = catalog?.envs.find((e) => e.id === vm.env);
  const errorText = vm.loadError || catalog?.error || '';

  const labelStyle: CSSProperties = { fontSize: 12, color: themeTokens.textSecondary, minWidth: 64 };
  const rowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 };

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16 }}>
      <header style={{ marginBottom: 12 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600, color: themeTokens.textPrimary }}>运行集成用例</h2>
        <p style={{ margin: 0, fontSize: 12, color: themeTokens.textSecondary, wordBreak: 'break-all' }}>
          项目：{catalog?.projectPath || '（未配置 INTEGRATION_TEST_PROJECT_PATH）'}
        </p>
      </header>

      {errorText && (
        <div
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            color: themeTokens.statusError,
            background: themeTokens.statusErrorBackground,
          }}
        >
          {errorText}
        </div>
      )}

      <div style={rowStyle}>
        <span style={labelStyle}>执行环境</span>
        {(catalog?.envs ?? []).map((e) => (
          <Button
            key={e.id || '__default'}
            themeTokens={themeTokens}
            variant={vm.env === e.id ? 'solid' : 'soft'}
            size="sm"
            disabled={!e.hasLocalFile}
            title={e.hasLocalFile ? e.portalBaseUrl || e.fileName : `缺少 ${e.fileName}，请先从 ${e.fileName}.example 复制`}
            onClick={() => vm.setEnv(e.id)}
          >
            {e.label}
          </Button>
        ))}
        {currentEnv && (
          <span style={{ fontSize: 12, color: themeTokens.textSecondary }}>
            {currentEnv.fileName}
            {currentEnv.portalBaseUrl ? ` · ${currentEnv.portalBaseUrl}` : ''}
          </span>
        )}
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>运行位置</span>
        {RUN_MODES.map((m) => (
          <Button
            key={m.key}
            themeTokens={themeTokens}
            variant={vm.mode === m.key ? 'solid' : 'soft'}
            size="sm"
            onClick={() => vm.setMode(m.key)}
          >
            {m.label}
          </Button>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: themeTokens.textPrimary, marginLeft: 8 }}>
          <input
            type="checkbox"
            checked={vm.headless}
            onChange={(e) => vm.setHeadless(e.target.checked)}
            style={{ accentColor: themeTokens.tabActiveBorder }}
          />
          无头模式
        </label>
      </div>
      {vm.mode === 'local' && (
        <p style={{ margin: '-4px 0 12px', fontSize: 12, color: themeTokens.statusWarning, lineHeight: 1.6 }}>
          本地模式（LOCAL_REMOTES=1）按桌面「MF 联调」写入的 localhost 入口加载微应用：请确认已配置并装好桥接（硬刷门户页），且对应 dev server 已启动。
        </p>
      )}

      <div style={rowStyle}>
        <span style={labelStyle}>用例</span>
        <input
          type="search"
          value={vm.keyword}
          placeholder="按标题或文件名过滤"
          onChange={(e) => vm.setKeyword(e.target.value)}
          style={{
            padding: '4px 8px',
            borderRadius: 6,
            border: `1px solid ${themeTokens.inputBorder}`,
            background: themeTokens.inputBackground,
            color: themeTokens.textPrimary,
            fontSize: 12,
            minWidth: 220,
          }}
        />
        <Button
          themeTokens={themeTokens}
          variant="soft"
          size="sm"
          onClick={() => vm.toggleCases(visibleGroups.flatMap((g) => g.visible.map((c) => c.specPath)), true)}
        >
          全选可见
        </Button>
        <Button themeTokens={themeTokens} variant="soft" size="sm" onClick={vm.clearSelection}>
          清空
        </Button>
        <Button themeTokens={themeTokens} variant="soft" size="sm" loading={vm.loading} onClick={() => void vm.reload()}>
          刷新
        </Button>
        <Button
          themeTokens={themeTokens}
          variant="soft"
          size="sm"
          loading={vm.loadingLastResults}
          title="读取最近一份 Playwright HTML 报告，在用例前标记通过 / 失败"
          onClick={() => void vm.loadLastResults()}
        >
          上次结果
        </Button>
        <span style={{ fontSize: 12, color: themeTokens.textSecondary }}>
          已选 {vm.selected.size} / {totalCases}
        </span>
      </div>
      {vm.lastResults && (
        <LastResultsSummary
          lastResults={vm.lastResults}
          tally={tallyOutcomes(groups.flatMap((g) => g.cases), vm.lastResults.cases)}
          themeTokens={themeTokens}
        />
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          border: `1px solid ${themeTokens.panelBorder}`,
          borderRadius: 6,
          padding: '4px 10px',
          background: themeTokens.workspacePanelSubtleBackground,
        }}
      >
        {caseTree.map((node) => {
          if (node.kind === 'group') {
            return (
              <CaseGroupBlock
                key={node.group.dirPath}
                group={node.group}
                visible={node.visible}
                selected={vm.selected}
                lastCases={lastCases}
                themeTokens={themeTokens}
                indentPx={0}
                onToggle={vm.toggleCases}
              />
            );
          }
          const folderCases = node.children.flatMap((c) => c.visible);
          const folderAllCases = node.children.flatMap((c) => c.group.cases);
          return (
            <details key={node.key} style={{ marginBottom: 4 }}>
              <summary
                style={{
                  cursor: 'pointer',
                  padding: '6px 0',
                  fontSize: 13,
                  fontWeight: 600,
                  color: themeTokens.textPrimary,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <GroupCheckbox
                    state={groupCheckState(folderCases, vm.selected)}
                    accent={themeTokens.tabActiveBorder}
                    onChange={(checked) => vm.toggleCases(folderCases.map((c) => c.specPath), checked)}
                  />
                  {node.label}
                  <span style={{ fontWeight: 400, fontSize: 12, color: themeTokens.textSecondary }}>
                    · {folderVisibleCount(node.children)}
                  </span>
                  {lastCases && (
                    <GroupOutcomeTally tally={tallyOutcomes(folderAllCases, lastCases)} themeTokens={themeTokens} />
                  )}
                </span>
              </summary>
              {node.children.map(({ group, visible }) => (
                <CaseGroupBlock
                  key={group.dirPath}
                  group={group}
                  visible={visible}
                  selected={vm.selected}
                  lastCases={lastCases}
                  themeTokens={themeTokens}
                  indentPx={16}
                  onToggle={vm.toggleCases}
                />
              ))}
            </details>
          );
        })}
        {!vm.loading && catalog?.projectExists && visibleGroups.length === 0 && (
          <div style={{ padding: 12, fontSize: 12, color: themeTokens.textSecondary }}>没有匹配的用例</div>
        )}
      </div>

      <footer style={{ display: 'flex', gap: 12, alignItems: 'center', paddingTop: 12 }}>
        <pre
          style={{
            flex: 1,
            margin: 0,
            padding: '8px 10px',
            maxHeight: 96,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            borderRadius: 6,
            fontSize: 12,
            border: `1px solid ${themeTokens.inputBorder}`,
            background: themeTokens.inputBackground,
            color: vm.preview && !vm.preview.ok ? themeTokens.statusWarning : themeTokens.textPrimary,
          }}
        >
          {vm.preview ? (vm.preview.ok ? vm.preview.command : vm.preview.error) : '—'}
        </pre>
        <Button
          themeTokens={themeTokens}
          variant="solid"
          size="md"
          loading={vm.running}
          disabled={!vm.preview?.ok}
          onClick={() => void vm.run()}
        >
          运行
        </Button>
      </footer>
      {vm.feedback && (
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 12,
            wordBreak: 'break-all',
            color: vm.feedback.ok ? themeTokens.statusSuccess : themeTokens.statusError,
          }}
        >
          {vm.feedback.message}
        </p>
      )}
    </section>
  );
}
