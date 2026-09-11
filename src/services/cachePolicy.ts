import type { PaperRecord } from "../types";
export function removeOcrLayers(papers: PaperRecord[]) {
  return papers.map((p) => ({
    ...p,
    profile: {
      ...p.profile,
      sections: p.profile.sections.map((s) => ({
        ...s,
        paragraphs: s.paragraphs.filter((x) => x.source !== "ocr"),
      })),
    },
  }));
}
export function cacheClearPatch(papers: PaperRecord[]) {
  return { answerCache: {}, ocrCache: {}, library: removeOcrLayers(papers) };
}
