/* AI 生成 By Peng.Guo */

export type EnhancedNodeMetadata = {
  filePath: string;
  docId: string;
  nodeId: string;
  nodeType: 'parent' | 'child';
  parentId?: string;
  title: string;
  summary: string;
  hypotheticalQuestions: string[];
  keyEntities: string[];
  embeddingText: string;
};

export type ChildNodeRecord = {
  id: string;
  text: string;
  metadata: EnhancedNodeMetadata;
};

export type ParentNodeRecord = {
  id: string;
  text: string;
  metadata: EnhancedNodeMetadata;
};

export type DocFingerprint = {
  docId: string;
  md5: string;
  updatedAt: string;
};

export type ProcessedDocCache = {
  fingerprint: DocFingerprint;
  parents: ParentNodeRecord[];
  children: ChildNodeRecord[];
};

export type IngestionResult = {
  docId: string;
  changed: boolean;
  parentCount: number;
  childCount: number;
  md5: string;
};

export type FilterStrategy = {
  query: string;
  queryTokens: string[];
  possibleEntities: string[];
};

export type IngestionCacheFile = {
  version: 1;
  docs: Record<string, ProcessedDocCache>;
  updatedAt: string;
};
