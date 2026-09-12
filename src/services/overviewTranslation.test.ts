import { describe, expect, it } from "vitest";
import {
  applyOverviewTranslation,
  parseOverviewResponse,
} from "./overviewTranslation";
import { emptyPaperProfile } from "./paperLibrary";

describe("overview translation", () => {
  it("parses fenced model JSON", () => {
    expect(
      parseOverviewResponse('```json\n{"titleZh":"中文标题"}\n```'),
    ).toEqual({
      titleZh: "中文标题",
    });
  });
  it("stores Chinese reader fields without destroying source metadata", () => {
    const source = {
      ...emptyPaperProfile("paper.pdf"),
      title: "An English Paper",
      abstract: "An English abstract.",
      sections: [
        {
          id: "s1",
          title: "Introduction",
          level: 1,
          page: 1,
          summary: "English",
          paragraphs: [],
        },
      ],
    };
    const result = applyOverviewTranslation(source, {
      titleZh: "一篇英文论文",
      abstractZh: "一段中文摘要。",
      sections: [{ id: "s1", titleZh: "引言", summary: "中文概述" }],
    });
    expect(result.title).toBe("An English Paper");
    expect(result.abstract).toBe("An English abstract.");
    expect(result.overviewTitle).toBe("一篇英文论文");
    expect(result.overviewAbstract).toBe("一段中文摘要。");
    expect(result.overviewSectionTitles?.s1).toBe("引言");
    expect(result.sections[0].summary).toBe("中文概述");
  });
});
