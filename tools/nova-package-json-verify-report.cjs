/* AI 生成 By Peng.Guo */
/**
 * 在 react18 仓库目录执行，输出 sprint 分支本地/远程 package.json 的 Markdown 核对报告。
 * 环境变量：SPRINT_BRANCH、VERSION（期望 nova 版本）
 * 使用 .cjs：项目 package.json 为 type:module，CommonJS 脚本须用 .cjs 扩展名。
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const sprint = (process.env.SPRINT_BRANCH || '').trim();
const expected = (process.env.VERSION || '').trim();

const targets = [
  '@chanjet/nova-athena',
  '@chanjet/nova-cross-shared',
  '@chanjet/nova-intelligent-import',
  '@chanjet/nova-microkernel',
  '@chanjet/nova-shared',
  '@chanjet/nova-uikit',
  '@chanjet/nova-uikit-compat',
  '@chanjet/ai-runtime',
  '@chanjet/ai-adapters',
];

const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'resolutions'];

function gitShow(ref) {
  return execSync(`git show ${ref}:package.json`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function getPkg(ref) {
  return JSON.parse(gitShow(ref));
}

function pickNova(pkg) {
  const out = {};
  for (const sec of sections) {
    if (!pkg[sec]) continue;
    for (const name of targets) {
      if (Object.prototype.hasOwnProperty.call(pkg[sec], name)) {
        if (!out[sec]) out[sec] = {};
        out[sec][name] = pkg[sec][name];
      }
    }
  }
  return out;
}

function collectRows(pkg) {
  const rows = [];
  for (const sec of sections) {
    if (!pkg[sec]) continue;
    for (const name of targets) {
      if (Object.prototype.hasOwnProperty.call(pkg[sec], name)) {
        rows.push({ key: `${sec}:${name}`, name, section: sec, version: pkg[sec][name] });
      }
    }
  }
  return rows;
}

function main() {
  if (!sprint) {
    console.error('[10/10] 缺少环境变量 SPRINT_BRANCH');
    process.exit(1);
  }

  const localSha = execSync(`git rev-parse ${sprint}`, { encoding: 'utf8' }).trim();
  const remoteSha = execSync(`git rev-parse origin/${sprint}`, { encoding: 'utf8' }).trim();
  const localPkg = getPkg(sprint);
  const remotePkg = getPkg(`origin/${sprint}`);
  const sameCommit = localSha === remoteSha;
  const sameContent = JSON.stringify(localPkg) === JSON.stringify(remotePkg);

  const localMap = new Map(collectRows(localPkg).map((r) => [r.key, r]));
  const remoteMap = new Map(collectRows(remotePkg).map((r) => [r.key, r]));
  const keys = [...new Set([...localMap.keys(), ...remoteMap.keys()])].sort();

  const lines = [];
  lines.push('# package.json 核对报告');
  lines.push('');
  lines.push(`- **分支**: \`${sprint}\``);
  if (expected) lines.push(`- **期望 nova 版本**: \`${expected}\``);
  lines.push(`- **本地 commit**: \`${localSha}\``);
  lines.push(`- **远程 commit**: \`${remoteSha}\``);
  lines.push(`- **commit 一致**: ${sameCommit ? '是' : '**否（请核对）**'}`);
  lines.push(`- **package.json 内容一致**: ${sameContent ? '是' : '**否（请核对）**'}`);
  lines.push('');
  lines.push('## nova 相关依赖对比');
  lines.push('');
  lines.push('| 依赖包 | 区块 | 本地版本 | 远程版本 | 一致 |');
  lines.push('| --- | --- | --- | --- | --- |');

  let allMatchExpected = Boolean(expected);
  for (const key of keys) {
    const l = localMap.get(key);
    const r = remoteMap.get(key);
    const lv = l?.version ?? '-';
    const rv = r?.version ?? '-';
    const ok = lv === rv ? '✅' : '❌';
    if (expected && (lv !== expected || rv !== expected)) allMatchExpected = false;
    const name = l?.name || r?.name || key;
    const sec = l?.section || r?.section || '-';
    lines.push(`| ${name} | ${sec} | \`${lv}\` | \`${rv}\` | ${ok} |`);
  }
  if (expected) {
    lines.push('');
    lines.push(`- **nova 依赖均为期望版本 \`${expected}\`**: ${allMatchExpected ? '是' : '**否（请核对上表）**'}`);
  }

  lines.push('');
  lines.push('## nova 相关依赖 JSON（精简，便于比对）');
  lines.push('');
  lines.push('### 本地');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(pickNova(localPkg), null, 2));
  lines.push('```');
  lines.push('');
  lines.push('### 远程');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(pickNova(remotePkg), null, 2));
  lines.push('```');

  if (!sameContent) {
    lines.push('');
    lines.push('## 完整 package.json');
    lines.push('');
    lines.push('### 本地');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(localPkg, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('### 远程');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(remotePkg, null, 2));
    lines.push('```');
  } else {
    lines.push('');
    lines.push('## 完整 package.json（本地与远程相同，仅一份）');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(localPkg, null, 2));
    lines.push('```');
  }

  const report = lines.join('\n');
  const reportPath = path.join(process.cwd(), 'package-json-verify.md');
  fs.writeFileSync(reportPath, report, 'utf8');

  console.log('[10/10] Markdown 核对报告（下方可复制到支持 MD 的编辑器查看）');
  console.log('');
  console.log(report);
  console.log('');
  console.log(`[10/10] 报告已保存: ${path.resolve(reportPath)}`);
}

main();
