import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";
import { buildNotesDocx } from "../dist-electron/docxExport.js";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "papertutor-word-check-"),
);
const target = path.join(directory, "PaperTutor-Notes.docx");
const noteId = "note-alpha";
const imageName = `${"b".repeat(64)}.png`;
fs.mkdirSync(path.join(directory, "note-assets", noteId), { recursive: true });
fs.writeFileSync(
  path.join(directory, "note-assets", noteId, imageName),
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av5WAAAAAElFTkSuQmCC",
    "base64",
  ),
);
const content = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [
        { type: "text", marks: [{ type: "bold" }], text: "Test Note Alpha" },
      ],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Persistent rich text" }],
    },
    {
      type: "image",
      attrs: {
        src: `papertutor-note-asset://asset/${noteId}/${imageName}`,
      },
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
                  content: [{ type: "text", text: "Cell" }],
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
      content: [{ type: "paperAnchor", attrs: { page: 12, sectionId: "4.2" } }],
    },
  ],
};
fs.writeFileSync(
  target,
  await buildNotesDocx([{ title: "Paper Alpha", content }], directory, {
    toc: true,
    pageBreak: true,
  }),
);
const zip = await JSZip.loadAsync(fs.readFileSync(target));
const xml = await zip.file("word/document.xml").async("string");
if (
  !xml.includes("Paper Alpha") ||
  !xml.includes("E=mc^2") ||
  !xml.includes("来源：P12")
)
  throw new Error("DOCX structural validation failed");
let wordOpened = false;
if (process.platform === "win32") {
  const escaped = target.replaceAll("'", "''");
  const command = `$p='${escaped}';$w=New-Object -ComObject Word.Application;$w.Visible=$false;$w.DisplayAlerts=0;try{$d=$w.Documents.Open($p);$d.Close();Write-Output 'OPEN_OK'}finally{$w.Quit()}`;
  try {
    wordOpened = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", command],
      { encoding: "utf8", timeout: 60000, windowsHide: true },
    ).includes("OPEN_OK");
  } catch {}
}
console.log(
  JSON.stringify({
    structural: true,
    mediaCount: Object.keys(zip.files).filter((name) =>
      name.startsWith("word/media/"),
    ).length,
    wordOpened,
  }),
);
fs.rmSync(directory, { recursive: true, force: true });
