import type { PaperProfile } from "../types";

export type OcrPageResult = { page: number; text: string };

export function ocrPagesFromProfile(profile: PaperProfile): OcrPageResult[] {
  const pages = profile.sections
    .flatMap((section) => section.paragraphs)
    .filter((paragraph) => paragraph.source === "ocr" && paragraph.text.trim())
    .map((paragraph) => ({
      page: paragraph.page,
      text: paragraph.text.trim(),
    }));
  return pages.reduce<OcrPageResult[]>(
    (results, page) => upsertOcrPage(results, page),
    [],
  );
}

export function upsertOcrPage(
  pages: OcrPageResult[],
  next: OcrPageResult,
): OcrPageResult[] {
  return [...pages.filter((page) => page.page !== next.page), next].sort(
    (a, b) => a.page - b.page,
  );
}

export function normalizeOcrSelection(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
