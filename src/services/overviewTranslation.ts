import type { PaperProfile } from "../types";

export type OverviewTranslation = {
  titleZh?: string;
  abstractZh?: string;
  researchQuestion?: string;
  contributions?: string[];
  methods?: string[];
  sections?: Array<{ id: string; titleZh?: string; summary?: string }>;
};

export function parseOverviewResponse(text: string): OverviewTranslation {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型未返回有效的概述 JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export function applyOverviewTranslation(
  profile: PaperProfile,
  data: OverviewTranslation,
): PaperProfile {
  const sectionTitles = { ...(profile.overviewSectionTitles || {}) };
  const sections = profile.sections.map((section) => {
    const translated = data.sections?.find((item) => item.id === section.id);
    if (translated?.titleZh) sectionTitles[section.id] = translated.titleZh;
    return translated?.summary
      ? { ...section, summary: translated.summary }
      : section;
  });
  return {
    ...profile,
    overviewTitle: data.titleZh || profile.overviewTitle || profile.title,
    overviewAbstract:
      data.abstractZh || profile.overviewAbstract || profile.abstract,
    overviewSectionTitles: sectionTitles,
    researchQuestion: data.researchQuestion || profile.researchQuestion,
    contributions: data.contributions || profile.contributions,
    methods: data.methods || profile.methods,
    sections,
  };
}
