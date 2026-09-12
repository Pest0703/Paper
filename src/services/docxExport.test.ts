import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { buildNotesDocx, sanitizeFilename } from "../../electron/docxExport";

describe("DOCX note export", () => {
  const dirs: string[] = [];
  afterEach(() =>
    dirs
      .splice(0)
      .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })),
  );
  it("preserves selected order, headings, tables, formula, anchor and embedded image", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "papertutor-docx-test-"),
    );
    dirs.push(root);
    const noteId = "note-alpha",
      filename = `${"a".repeat(64)}.png`;
    fs.mkdirSync(path.join(root, "note-assets", noteId), { recursive: true });
    fs.writeFileSync(
      path.join(root, "note-assets", noteId, filename),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av5WAAAAAElFTkSuQmCC",
        "base64",
      ),
    );
    const content: any = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [
            { type: "text", marks: [{ type: "bold" }], text: "Rich Heading" },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [{ type: "italic" }, { type: "underline" }],
              text: "Formatted text",
            },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Cell A" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: "mathBlock", attrs: { latex: "E=mc^2" } },
        {
          type: "paragraph",
          content: [
            { type: "paperAnchor", attrs: { page: 12, sectionId: "4.2" } },
          ],
        },
        {
          type: "image",
          attrs: { src: `papertutor-note-asset://asset/${noteId}/${filename}` },
        },
      ],
    };
    const buffer = await buildNotesDocx(
      [
        { title: "Paper Beta", content },
        { title: "Paper Alpha", content: { type: "doc", content: [] } },
      ],
      root,
      { toc: true, pageBreak: true },
    );
    const zip = await JSZip.loadAsync(buffer),
      xml = await zip.file("word/document.xml")!.async("string");
    expect(xml.indexOf("Paper Beta")).toBeLessThan(xml.indexOf("Paper Alpha"));
    expect(xml).toContain("Rich Heading");
    expect(xml).toContain("E=mc^2");
    expect(xml).toContain("来源：P12 · §4.2");
    expect(
      Object.keys(zip.files).some((name) => name.startsWith("word/media/")),
    ).toBe(true);
  });
  it("sanitizes Windows-reserved filename characters", () =>
    expect(sanitizeFilename('A:B/C*D?"E<F>G|')).toBe("A_B_C_D__E_F_G_"));
});
