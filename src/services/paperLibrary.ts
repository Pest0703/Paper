import type { PaperProfile, PaperRecord } from "../types";

export type DiscoveredPaper = {
  path: string;
  name: string;
  size: number;
  folderName: string;
};

export function emptyPaperProfile(name: string): PaperProfile {
  return {
    title: name.replace(/\.(pdf|docx?)$/i, ""),
    authors: "",
    abstract: "",
    researchQuestion: "",
    contributions: [],
    methods: [],
    keywords: [],
    sections: [],
  };
}

export function createIndexedPaper(
  file: DiscoveredPaper,
  id: string,
): PaperRecord {
  return {
    id,
    name: file.name,
    path: file.path,
    size: file.size,
    folderName: file.folderName,
    fingerprint: id,
    profile: emptyPaperProfile(file.name),
    importedAt: new Date().toISOString(),
    page: 1,
    scale: 1.1,
    scrollTop: 0,
    bookmarks: [],
    status: "indexed",
  };
}

export function mergePaperLibrary(
  current: PaperRecord[],
  discovered: PaperRecord[],
) {
  const byPath = new Map(current.map((paper) => [paper.path, paper]));
  for (const paper of discovered)
    if (!byPath.has(paper.path)) byPath.set(paper.path, paper);
  return [...byPath.values()];
}

export const paperStatusLabel = (status: PaperRecord["status"]) =>
  ({
    indexed: "未打开",
    parsing: "待模型分析",
    ready: "已分析",
    error: "打开失败",
  })[status];
