import { _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const counts = process.argv.slice(2).map(Number).filter(Boolean);
const sizes = counts.length ? counts : [3, 30, 300];
const heavy = process.argv.includes("--legacy-heavy");
const noteCount = Number(
  process.argv.find((arg) => arg.startsWith("--notes="))?.split("=")[1] || 0,
);

function paper(index) {
  const id = `fixture-${String(index).padStart(3, "0")}`;
  const metadata = {
    id,
    name: `Paper Fixture ${String(index).padStart(3, "0")}.pdf`,
    path: path.join(os.tmpdir(), `${id}.pdf`),
    importedAt: "2026-01-01T00:00:00.000Z",
    page: 1,
    scale: 1.1,
    scrollTop: 0,
    bookmarkCount: 0,
    profileStatus: heavy ? "ready" : "missing",
    status: "indexed",
    title: `Paper Fixture ${index}`,
    authors: "Test Author",
    size: 1024,
    fingerprint: id,
  };
  if (!heavy) return metadata;
  return {
    ...metadata,
    bookmarks: [],
    profile: {
      title: metadata.title,
      authors: metadata.authors,
      abstract: "Synthetic abstract. ".repeat(30),
      researchQuestion: "Synthetic question",
      contributions: ["Synthetic contribution"],
      methods: ["Synthetic method"],
      keywords: [],
      sections: Array.from({ length: 12 }, (_, section) => ({
        id: `${id}-s${section}`,
        title: `Section ${section}`,
        level: 1,
        page: section + 1,
        summary: "Synthetic summary. ".repeat(30),
        paragraphs: Array.from({ length: 30 }, (_, paragraph) => ({
          id: `${id}-p${section}-${paragraph}`,
          text: "Synthetic paragraph for startup profiling. ".repeat(30),
          page: section + 1,
          sectionId: `${id}-s${section}`,
          sentences: [],
        })),
      })),
    },
  };
}

for (const count of sizes) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "papertutor-bench-"));
  const library = Array.from({ length: count }, (_, index) => paper(index + 1));
  fs.writeFileSync(
    path.join(profile, "papertutor-data.json"),
    JSON.stringify({ library, settings: {} }),
  );
  if (noteCount) {
    const db = new DatabaseSync(path.join(profile, "papertutor-notes.db"));
    db.exec(`CREATE TABLE notes(id TEXT PRIMARY KEY,paper_id TEXT UNIQUE,title TEXT,created_at TEXT,updated_at TEXT,last_scroll_top REAL DEFAULT 0,last_cursor INTEGER DEFAULT 0,schema_version INTEGER DEFAULT 1) STRICT;
      CREATE TABLE note_documents(note_id TEXT PRIMARY KEY,content_json TEXT) STRICT;
      CREATE TABLE note_assets(id TEXT PRIMARY KEY,note_id TEXT,relative_path TEXT,mime TEXT,width INTEGER,height INTEGER,hash TEXT,created_at TEXT,UNIQUE(note_id,hash)) STRICT;`);
    const insertNote = db.prepare(
      "INSERT INTO notes(id,paper_id,title,created_at,updated_at) VALUES(?,?,?,?,?)",
    );
    const insertDocument = db.prepare(
      "INSERT INTO note_documents(note_id,content_json) VALUES(?,?)",
    );
    for (let index = 1; index <= noteCount; index++) {
      const id = `note-${index}`,
        now = "2026-01-01T00:00:00.000Z";
      insertNote.run(
        id,
        `fixture-${String(index).padStart(3, "0")}`,
        `Test Note ${index}`,
        now,
        now,
      );
      insertDocument.run(
        id,
        JSON.stringify({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "N".repeat(1000) }],
            },
          ],
        }),
      );
    }
    db.close();
  }
  const started = performance.now();
  const app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: path.resolve("."),
  });
  const page = await app.firstWindow();
  page.on("console", (message) => console.error("renderer:", message.text()));
  page.on("pageerror", (error) =>
    console.error("renderer-error:", error.message),
  );
  if (process.env.PAPERTUTOR_BENCH_DEBUG === "1") {
    await page.waitForTimeout(1000);
    console.error(
      "debug-body:",
      (await page.locator("body").innerText()).slice(0, 500),
    );
    console.error("debug-url:", page.url());
  }
  await page.locator(".brand").waitFor();
  const shellReady = performance.now() - started;
  const internalShellReady = Number(
    await page.locator("html").getAttribute("data-shell-ready"),
  );
  if (
    !(await page.getByRole("complementary", { name: "论文目录" }).isVisible())
  )
    await page.getByLabel("打开论文目录").click();
  await page.getByText("Paper Fixture 001.pdf").waitFor();
  const libraryVisible = performance.now() - started;
  const internalLibraryReady = Number(
    await page.locator("html").getAttribute("data-library-ready"),
  );
  const memory = await app.evaluate(({ app }) => app.getAppMetrics());
  const workingSetMb = memory.reduce(
    (sum, metric) => sum + metric.memory.workingSetSize / 1024,
    0,
  );
  console.log(
    JSON.stringify({
      mode: heavy ? "legacy-heavy" : "metadata",
      count,
      stateBytes: fs.statSync(path.join(profile, "papertutor-data.json")).size,
      shellReadyMs: Math.round(shellReady),
      libraryVisibleMs: Math.round(libraryVisible),
      internalShellReadyMs: internalShellReady,
      internalLibraryReadyMs: internalLibraryReady,
      workingSetMb: Math.round(workingSetMb),
      noteCount,
    }),
  );
  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
