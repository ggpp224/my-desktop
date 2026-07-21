/* AI 生成 By Peng.Guo */
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { config } from '../../config/default.js';

export type VideoJobStatus = 'pending' | 'running' | 'success' | 'failure';

export type VideoJobMeta = {
  jobId: string;
  status: VideoJobStatus;
  prompt: string;
  scriptModel?: string;
  createdAt: string;
  updatedAt: string;
  outputPath?: string;
  error?: string;
  steps: Array<{ name: string; status: 'success' | 'failure'; message: string }>;
};

export type VideoJobPaths = {
  jobId: string;
  jobDir: string;
  rawDir: string;
  scriptPath: string;
  finalPath: string;
  metaPath: string;
};

function resolveOutputRoot(): string {
  const root = config.video.outputDir;
  return path.isAbsolute(root) ? root : path.resolve(process.cwd(), root);
}

export async function createVideoJob(prompt: string, scriptModel?: string): Promise<VideoJobPaths> {
  const jobId = randomUUID();
  const jobDir = path.join(resolveOutputRoot(), jobId);
  const rawDir = path.join(jobDir, 'raw');
  await fs.mkdir(rawDir, { recursive: true });
  const now = new Date().toISOString();
  const meta: VideoJobMeta = {
    jobId,
    status: 'pending',
    prompt,
    scriptModel,
    createdAt: now,
    updatedAt: now,
    steps: [],
  };
  const paths: VideoJobPaths = {
    jobId,
    jobDir,
    rawDir,
    scriptPath: path.join(jobDir, 'script.json'),
    finalPath: path.join(jobDir, 'final.mp4'),
    metaPath: path.join(jobDir, 'job-meta.json'),
  };
  await fs.writeFile(paths.metaPath, JSON.stringify(meta, null, 2), 'utf8');
  return paths;
}

export async function loadVideoJobMeta(jobId: string): Promise<VideoJobMeta | null> {
  const metaPath = path.join(resolveOutputRoot(), jobId, 'job-meta.json');
  try {
    const text = await fs.readFile(metaPath, 'utf8');
    return JSON.parse(text) as VideoJobMeta;
  } catch {
    return null;
  }
}

export async function updateVideoJobMeta(jobId: string, patch: Partial<VideoJobMeta>): Promise<VideoJobMeta> {
  const meta = await loadVideoJobMeta(jobId);
  if (!meta) throw new Error(`Job 不存在: ${jobId}`);
  const next: VideoJobMeta = {
    ...meta,
    ...patch,
    updatedAt: new Date().toISOString(),
    steps: patch.steps ?? meta.steps,
  };
  const metaPath = path.join(resolveOutputRoot(), jobId, 'job-meta.json');
  await fs.writeFile(metaPath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function getVideoJobFinalPath(jobId: string): string {
  return path.join(resolveOutputRoot(), jobId, 'final.mp4');
}

export function getVideoOutputRoot(): string {
  return resolveOutputRoot();
}
