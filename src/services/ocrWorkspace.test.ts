import { describe, expect, it } from "vitest";
import {
  normalizeOcrSelection,
  ocrPagesFromProfile,
  upsertOcrPage,
} from "./ocrWorkspace";

describe("OCR workspace", () => {
  it("extracts only OCR paragraphs and orders them by page", () => {
    const profile: any = {
      sections: [
        {
          paragraphs: [
            { page: 3, text: "第三页", source: "ocr" },
            { page: 1, text: "原生文本", source: "pdf-native" },
            { page: 2, text: "第二页", source: "ocr" },
          ],
        },
      ],
    };
    expect(ocrPagesFromProfile(profile)).toEqual([
      { page: 2, text: "第二页" },
      { page: 3, text: "第三页" },
    ]);
  });

  it("replaces a repeated page without duplicating it", () => {
    expect(
      upsertOcrPage(
        [
          { page: 1, text: "旧内容" },
          { page: 2, text: "第二页" },
        ],
        { page: 1, text: "新内容" },
      ),
    ).toEqual([
      { page: 1, text: "新内容" },
      { page: 2, text: "第二页" },
    ]);
  });

  it("normalizes selected OCR text before sending it to the tutor", () => {
    expect(normalizeOcrSelection("  一个\n  OCR   句子。 ")).toBe(
      "一个 OCR 句子。",
    );
  });
});
