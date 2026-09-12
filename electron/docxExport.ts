import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import fs from "node:fs/promises";
import path from "node:path";

type JsonNode = {
  type?: string;
  text?: string;
  attrs?: any;
  marks?: any[];
  content?: JsonNode[];
};

function runs(nodes: JsonNode[] = []): Array<TextRun | ExternalHyperlink> {
  return nodes.flatMap((node) => {
    if (node.type === "paperAnchor")
      return [
        new TextRun({
          text: `来源：P${node.attrs?.page || 1}${node.attrs?.sectionId ? ` · §${node.attrs.sectionId}` : ""}`,
          color: "18796B",
        }),
      ];
    if (node.type === "inlineMath")
      return [
        new TextRun({
          text: node.attrs?.latex || "",
          font: "Cambria Math",
          italics: true,
        }),
      ];
    if (node.type === "hardBreak") return [new TextRun({ break: 1 })];
    if (node.type !== "text") return runs(node.content);
    const marks = node.marks || [],
      link = marks.find((mark) => mark.type === "link");
    const style = Object.fromEntries(
      marks.map((mark) => [mark.type, mark.attrs || true]),
    );
    const run = new TextRun({
      text: node.text || "",
      bold: !!style.bold,
      italics: !!style.italic,
      underline: style.underline ? {} : undefined,
      strike: !!style.strike,
      superScript: !!style.superscript,
      subScript: !!style.subscript,
      color: style.textStyle?.color?.replace("#", ""),
      highlight: style.highlight?.color ? "yellow" : undefined,
      shading: style.textStyle?.backgroundColor
        ? {
            type: ShadingType.CLEAR,
            fill: style.textStyle.backgroundColor.replace("#", ""),
          }
        : undefined,
      font: style.textStyle?.fontFamily,
      size: style.textStyle?.fontSize
        ? Math.round(Number.parseFloat(style.textStyle.fontSize) * 1.5)
        : undefined,
    });
    return link?.attrs?.href
      ? [new ExternalHyperlink({ link: link.attrs.href, children: [run] })]
      : [run];
  });
}

async function blocks(
  nodes: JsonNode[] = [],
  userData: string,
): Promise<any[]> {
  const output: any[] = [];
  for (const node of nodes) {
    if (
      node.type === "image" &&
      String(node.attrs?.src || "").startsWith("papertutor-note-asset://")
    ) {
      const url = new URL(node.attrs.src),
        [noteId, filename] = url.pathname.split("/").filter(Boolean);
      const data = await fs.readFile(
        path.join(userData, "note-assets", noteId, filename),
      );
      output.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data,
              transformation: { width: 480, height: 300 },
              type: path.extname(filename).slice(1) as any,
            }),
          ],
        }),
      );
    } else if (node.type === "table") {
      const rows = await Promise.all(
        (node.content || []).map(
          async (row) =>
            new TableRow({
              children: await Promise.all(
                (row.content || []).map(
                  async (cell) =>
                    new TableCell({
                      children: await blocks(cell.content || [], userData),
                      shading:
                        cell.type === "tableHeader"
                          ? { type: ShadingType.CLEAR, fill: "E8EFEB" }
                          : undefined,
                    }),
                ),
              ),
            }),
        ),
      );
      const border = { style: BorderStyle.SINGLE, size: 1, color: "909090" };
      output.push(
        new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: border,
            bottom: border,
            left: border,
            right: border,
            insideHorizontal: border,
            insideVertical: border,
          },
        }),
      );
    } else if (node.type === "horizontalRule")
      output.push(
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999" },
          },
        }),
      );
    else if (node.type === "mathBlock" || node.type === "blockMath")
      output.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: node.attrs?.latex || "",
              font: "Cambria Math",
              italics: true,
            }),
          ],
        }),
      );
    else if (
      ["bulletList", "orderedList", "taskList"].includes(node.type || "")
    ) {
      let index = 1;
      for (const item of node.content || [])
        output.push(
          new Paragraph({
            children: runs(
              item.content?.flatMap((child) => child.content || []) || [],
            ),
            bullet: node.type !== "orderedList" ? { level: 0 } : undefined,
            numbering:
              node.type === "orderedList"
                ? {
                    reference: "default-numbering",
                    level: 0,
                    instance: index++,
                  }
                : undefined,
          }),
        );
    } else {
      const level =
        node.type === "heading" ? Number(node.attrs?.level || 1) : 0;
      output.push(
        new Paragraph({
          heading: level
            ? [
                HeadingLevel.HEADING_1,
                HeadingLevel.HEADING_2,
                HeadingLevel.HEADING_3,
                HeadingLevel.HEADING_4,
              ][level - 1]
            : undefined,
          alignment:
            (
              {
                center: AlignmentType.CENTER,
                right: AlignmentType.RIGHT,
                justify: AlignmentType.JUSTIFIED,
              } as any
            )[node.attrs?.textAlign] || AlignmentType.LEFT,
          indent: node.type === "blockquote" ? { left: 480 } : undefined,
          children: runs(node.content),
        }),
      );
    }
  }
  return output;
}

export function sanitizeFilename(name: string) {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/[. ]+$/g, "")
      .slice(0, 120) || "Paper Note"
  );
}

export async function buildNotesDocx(
  notes: Array<{ title: string; content: JsonNode }>,
  userData: string,
  options: { toc?: boolean; pageBreak?: boolean },
) {
  const children: any[] = [];
  if (options.toc)
    children.push(
      new Paragraph({ text: "目录", heading: HeadingLevel.TITLE }),
      new TableOfContents("目录", {
        hyperlink: true,
        headingStyleRange: "1-4",
      }),
      new Paragraph({ children: [new PageBreak()] }),
    );
  for (let index = 0; index < notes.length; index++) {
    if (index && options.pageBreak)
      children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        text: notes[index].title,
        heading: HeadingLevel.HEADING_1,
      }),
      ...(await blocks(notes[index].content.content || [], userData)),
    );
  }
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}
