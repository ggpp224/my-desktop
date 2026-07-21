/* AI 生成 By Peng.Guo */
import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';
import type { JobContext } from './adapters/model-adapter.js';
import { GpuModelScheduler } from './gpu-model-scheduler.js';
import { generateVideoScript } from './script-generator.js';
import { createVideoJob, updateVideoJobMeta, type VideoJobMeta } from './video-job-store.js';
import { getVideoAdapter } from './registry/video-adapter-registry.js';
import type { VideoScript } from './domain/video-script.js';

export type VideoPipelineStepResult = {
  name: string;
  status: 'success' | 'failure';
  message: string;
};

export type VideoPipelineResult = {
  success: boolean;
  jobId: string;
  outputPath?: string;
  script?: VideoScript;
  message: string;
  steps: VideoPipelineStepResult[];
};

export type VideoPipelineOptions = {
  prompt: string;
  scriptModel?: string;
  signal?: AbortSignal;
  onStep?: (message: string) => void;
  onProgress?: (percent: number) => void;
};

function appendStep(steps: VideoPipelineStepResult[], name: string, status: 'success' | 'failure', message: string) {
  steps.push({ name, status, message });
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 80) || 'video';
}

/** 将成片复制到用户「下载」目录，便于在 Finder 中直接打开 */
async function publishFinalToDownloads(sourcePath: string, title: string, jobId: string): Promise<string> {
  const fileName = `${sanitizeFileName(title)}_${jobId.slice(0, 8)}.mp4`;
  const destPath = path.join(homedir(), 'Downloads', fileName);
  await fs.copyFile(sourcePath, destPath);
  return destPath;
}

export async function runVideoPipeline(options: VideoPipelineOptions): Promise<VideoPipelineResult> {
  const onStep = options.onStep ?? (() => {});
  const onProgress = options.onProgress ?? (() => {});
  const steps: VideoPipelineStepResult[] = [];
  const paths = await createVideoJob(options.prompt, options.scriptModel);
  const { jobId, jobDir, rawDir, scriptPath, finalPath } = paths;

  const ctx: JobContext = {
    jobId,
    jobDir,
    rawDir,
    signal: options.signal,
    onProgress: onStep,
  };

  try {
    await updateVideoJobMeta(jobId, { status: 'running' });

    onStep('Step 1/6：LLM 生成分镜脚本…');
    onProgress(5);
    const script = await generateVideoScript(options.prompt, {
      model: options.scriptModel,
      signal: options.signal,
      onProgress: onStep,
    });
    await fs.writeFile(scriptPath, JSON.stringify(script, null, 2), 'utf8');
    appendStep(steps, 'script', 'success', `分镜脚本已生成：${script.title}`);
    onProgress(15);

    const gpuTasks: Array<{ adapterName: string; input: unknown; ctx: JobContext }> = [];

    onStep('Step 2/6：准备 Wan2.2 视频生成…');
    gpuTasks.push({
      adapterName: 'wan',
      input: { ...script.video, durationSec: script.durationSec, title: script.title },
      ctx,
    });

    if (script.voiceover.enabled) {
      onStep('Step 3/6：准备 CosyVoice 配音…');
      gpuTasks.push({
        adapterName: 'cosyvoice',
        input: { ...script.voiceover, durationSec: script.durationSec },
        ctx,
      });
    } else {
      appendStep(steps, 'cosyvoice', 'success', '已跳过配音');
    }

    if (script.music.enabled) {
      onStep('Step 4/6：准备 AudioCraft 背景音乐…');
      gpuTasks.push({
        adapterName: 'audiocraft-music',
        input: script.music,
        ctx,
      });
    } else {
      appendStep(steps, 'audiocraft-music', 'success', '已跳过背景音乐');
    }

    if (script.foley.enabled) {
      onStep('Step 5/6：准备 Foley 环境音…');
      gpuTasks.push({
        adapterName: 'audiocraft-foley',
        input: script.foley,
        ctx,
      });
    } else {
      appendStep(steps, 'audiocraft-foley', 'success', '已跳过环境音');
    }

    const scheduler = new GpuModelScheduler();
    const requiredAdapters = gpuTasks.map((t) => t.adapterName);
    onStep('检查 GPU Sidecar 服务…');
    await scheduler.assertSidecarsReady(requiredAdapters);

    let stepIndex = 2;
    const totalGpuSteps = gpuTasks.length;
    const outputs = await scheduler.runSequential(
      gpuTasks.map((task) => ({
        ...task,
        ctx: {
          ...task.ctx,
          onProgress: (msg: string) => {
            onStep(`Step ${stepIndex}/6：${msg}`);
          },
        },
      })),
      {
        onStep: (msg) => {
          onProgress(15 + Math.floor((stepIndex / (totalGpuSteps + 1)) * 70));
          onStep(msg);
          stepIndex += 1;
        },
      }
    );

    for (const [name, outputPath] of Object.entries(outputs)) {
      appendStep(steps, name, 'success', `输出: ${outputPath}`);
    }

    onStep('Step 6/6：FFmpeg 混流合成…');
    onProgress(90);
    const ffmpeg = getVideoAdapter('ffmpeg');
    if (!ffmpeg) throw new Error('FFmpeg 适配器未注册');

    const videoPath = outputs.wan || path.join(rawDir, 'video.mp4');
    const composed = await ffmpeg.generate(
      {
        videoPath,
        voicePath: outputs.cosyvoice,
        musicPath: outputs['audiocraft-music'],
        foleyPath: outputs['audiocraft-foley'],
        outputPath: finalPath,
        mix: script.mix,
      },
      ctx
    );
    appendStep(steps, 'ffmpeg', 'success', `成片: ${composed}`);
    onProgress(95);
    const publishedPath = await publishFinalToDownloads(composed, script.title, jobId);
    appendStep(steps, 'publish', 'success', `已保存到下载目录: ${publishedPath}`);
    onProgress(100);

    const metaPatch: Partial<VideoJobMeta> = {
      status: 'success',
      outputPath: publishedPath,
      steps: steps.map((s) => ({ name: s.name, status: s.status, message: s.message })),
    };
    await updateVideoJobMeta(jobId, metaPatch);

    return {
      success: true,
      jobId,
      outputPath: publishedPath,
      script,
      message: '视频生成完成',
      steps,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendStep(steps, 'pipeline', 'failure', message);
    await updateVideoJobMeta(jobId, {
      status: 'failure',
      error: message,
      steps: steps.map((s) => ({ name: s.name, status: s.status, message: s.message })),
    });
    return {
      success: false,
      jobId,
      message,
      steps,
    };
  }
}
