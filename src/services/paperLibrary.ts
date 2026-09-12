import type { PaperLibraryItem, PaperProfile, PaperRecord } from "../types";

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
): PaperLibraryItem {
  return {
    id,
    name: file.name,
    path: file.path,
    size: file.size,
    folderName: file.folderName,
    fingerprint: id,
    importedAt: new Date().toISOString(),
    page: 1,
    scale: 1.1,
    scrollTop: 0,
    status: "indexed",
    profileStatus: "missing",
    title: file.name.replace(/\.(pdf|docx?)$/i, ""),
    bookmarkCount: 0,
  };
}

export function mergePaperLibrary(
  current: PaperLibraryItem[],
  discovered: PaperLibraryItem[],
) {
  const byPath = new Map(current.map((paper) => [paper.path, paper]));
  for (const paper of discovered)
    if (!byPath.has(paper.path)) byPath.set(paper.path, paper);
  return [...byPath.values()];
}

export function toLibraryItem(record: PaperRecord): PaperLibraryItem {
  const { profile, bookmarks, ...metadata } = record;
  return {
    ...metadata,
    title: profile.title,
    authors: profile.authors,
    bookmarkCount: bookmarks?.length || 0,
    profileStatus: "ready",
    lastOpenedAt: new Date().toISOString(),
  };
}

export const paperStatusLabel = (status: PaperRecord["status"]) =>
  ({
    indexed: "未打开",
    parsing: "待模型分析",
    ready: "已分析",
    error: "打开失败",
  })[status];
