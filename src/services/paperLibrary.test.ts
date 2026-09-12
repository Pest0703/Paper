import { describe, expect, it } from "vitest";
import {
  createIndexedPaper,
  mergePaperLibrary,
  paperStatusLabel,
} from "./paperLibrary";

describe("paper library", () => {
  const file = {
    path: "fixture-root/sample-paper.pdf",
    name: "sample-paper.pdf",
    size: 123,
    folderName: "fixture-root",
  };
  it("creates a metadata-only record without parsed content", () => {
    const paper = createIndexedPaper(file, "paper-1");
    expect(paper.status).toBe("indexed");
    expect(paper.profile.sections).toEqual([]);
    expect(paperStatusLabel(paper.status)).toBe("未打开");
  });

  it("keeps an analyzed record when the same path is rediscovered", () => {
    const indexed = createIndexedPaper(file, "paper-1");
    const analyzed = { ...indexed, status: "ready" as const };
    expect(mergePaperLibrary([analyzed], [indexed])).toEqual([analyzed]);
  });

  it("adds new paths without discarding existing papers", () => {
    const first = createIndexedPaper(file, "paper-1");
    const second = createIndexedPaper(
      { ...file, path: "fixture-root/second.pdf", name: "second.pdf" },
      "paper-2",
    );
    expect(mergePaperLibrary([first], [second])).toHaveLength(2);
  });
});
