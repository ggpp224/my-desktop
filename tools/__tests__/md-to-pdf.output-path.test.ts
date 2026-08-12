/* AI 生成 By Peng.Guo */
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  expandUserPath,
  resolvePdfOutputDir,
  resolvePdfOutputPath,
} from '../md-to-pdf.js';

const ORIGINAL_OUTPUT_DIR = process.env.MD_PDF_OUTPUT_DIR;

describe('md-to-pdf output path', () => {
  beforeEach(() => {
    delete process.env.MD_PDF_OUTPUT_DIR;
  });

  afterEach(() => {
    if (ORIGINAL_OUTPUT_DIR == null) delete process.env.MD_PDF_OUTPUT_DIR;
    else process.env.MD_PDF_OUTPUT_DIR = ORIGINAL_OUTPUT_DIR;
  });

  it('未配置时默认输出到本机下载目录同名 pdf', () => {
    const pdfPath = resolvePdfOutputPath('/tmp/docs/readme.md');
    assert.equal(pdfPath, path.join(homedir(), 'Downloads', 'readme.pdf'));
  });

  it('MD_PDF_OUTPUT_DIR 可覆盖输出目录', () => {
    process.env.MD_PDF_OUTPUT_DIR = '/custom/pdf-out';
    const pdfPath = resolvePdfOutputPath('/tmp/docs/readme.md');
    assert.equal(pdfPath, path.resolve('/custom/pdf-out', 'readme.pdf'));
  });

  it('MD_PDF_OUTPUT_DIR 支持 ~ 展开', () => {
    process.env.MD_PDF_OUTPUT_DIR = '~/Desktop/pdfs';
    const pdfPath = resolvePdfOutputPath('/tmp/docs/guide.md');
    assert.equal(pdfPath, path.join(homedir(), 'Desktop', 'pdfs', 'guide.pdf'));
  });

  it('Electron 下载目录可作为 fallback，且低于环境变量', () => {
    const electronDownloads = '/Users/demo/MyDownloads';
    assert.equal(resolvePdfOutputDir(electronDownloads), path.resolve(electronDownloads));

    process.env.MD_PDF_OUTPUT_DIR = '/override/out';
    assert.equal(resolvePdfOutputDir(electronDownloads), path.resolve('/override/out'));
  });

  it('expandUserPath 展开 ~ 与 ~/ 前缀', () => {
    assert.equal(expandUserPath('~'), homedir());
    assert.equal(expandUserPath('~/Downloads'), path.join(homedir(), 'Downloads'));
    assert.equal(expandUserPath('/abs/path'), '/abs/path');
  });
});
