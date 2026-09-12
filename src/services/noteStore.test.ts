import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NoteStore } from "../../electron/noteStore";

describe("note store", () => {
  const dirs: string[] = [];
  afterEach(() =>
    dirs
      .splice(0)
      .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })),
  );
  const create = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "papertutor-note-test-"));
    dirs.push(dir);
    return { dir, store: new NoteStore(dir) };
  };
  it("creates a first note with the paper title as an H1", () => {
    const { store } = create();
    const note = store.getOrCreate("paper-title", "A Reliable Paper");
    expect((note.content as any).content[0]).toEqual({
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "A Reliable Paper" }],
    });
    expect(store.getOrCreate("paper-title", "Changed Title").content).toEqual(note.content);
    store.close();
  });
  it("keeps exactly one primary note per paper and persists rich JSON", () => {
    const { dir, store } = create();
    const first = store.getOrCreate("paper-alpha", "Paper Alpha");
    const second = store.getOrCreate("paper-alpha", "Renamed");
    expect(second.id).toBe(first.id);
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [{ type: "bold" }],
              text: "Test Note Alpha",
            },
          ],
        },
      ],
    };
    store.save({ id: first.id, content, lastCursor: 7, lastScrollTop: 120 });
    store.close();
    const reopened = new NoteStore(dir),
      loaded = reopened.loadByPaper("paper-alpha")!;
    expect(loaded.content).toEqual(content);
    expect(loaded.lastCursor).toBe(7);
    expect(loaded.lastScrollTop).toBe(120);
    reopened.close();
  });
  it("handles a 100,000 character document without loading unrelated notes", () => {
    const { store } = create();
    const alpha = store.getOrCreate("paper-alpha", "Paper Alpha");
    store.getOrCreate("paper-beta", "Paper Beta");
    const text = "A".repeat(100_000);
    const images = Array.from({ length: 100 }, (_, index) => ({
      type: "image",
      attrs: { src: `papertutor-note-asset://asset/note/image-${index}.png` },
    }));
    const tables = Array.from({ length: 20 }, () => ({
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [{ type: "tableCell", content: [{ type: "paragraph" }] }],
        },
      ],
    }));
    const formulas = Array.from({ length: 50 }, (_, index) => ({
      type: "mathBlock",
      attrs: { latex: `x_${index}=y` },
    }));
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text }] },
        ...images,
        ...tables,
        ...formulas,
      ],
    };
    store.save({
      id: alpha.id,
      content,
      lastCursor: 100_000,
      lastScrollTop: 0,
    });
    const loaded = store.loadByPaper("paper-alpha")!.content as any;
    expect(loaded.content[0].content[0].text).toHaveLength(100_000);
    expect(
      loaded.content.filter((node: any) => node.type === "image"),
    ).toHaveLength(100);
    expect(
      loaded.content.filter((node: any) => node.type === "table"),
    ).toHaveLength(20);
    expect(
      loaded.content.filter((node: any) => node.type === "mathBlock"),
    ).toHaveLength(50);
    expect(store.list()).toHaveLength(2);
    expect(store.list()[0]).not.toHaveProperty("content");
    store.close();
  });
  it("keeps at most three parsed note documents in its LRU", () => {
    const { store } = create();
    for (const id of ["a", "b", "c", "d", "e"])
      store.getOrCreate(`paper-${id}`, `Paper ${id}`);
    expect(store.cacheSize()).toBe(3);
    store.close();
  });
});
