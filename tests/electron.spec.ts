import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { PDFDocument, StandardFonts } from "pdf-lib";

async function noteWindow(app: Awaited<ReturnType<typeof electron.launch>>) {
  await expect.poll(() => app.windows().length).toBe(2);
  const window = app.windows().find((item) => item.url().includes("window=notes"));
  if (!window) throw new Error("Notes BrowserWindow was not created");
  await window.getByRole("main", { name: "论文笔记" }).waitFor();
  return window;
}

async function seedReadyPaper(profile: string, id: string, name: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(`Synthetic paper ${id}`, { x: 60, y: 780, size: 18, font });
  const filePath = path.join(profile, name);
  fs.writeFileSync(filePath, await pdf.save());
  const metadata = {
    id,
    name,
    path: filePath,
    size: fs.statSync(filePath).size,
    fingerprint: id,
    importedAt: "2026-01-01T00:00:00.000Z",
    page: 1,
    scale: 1.1,
    scrollTop: 0,
    status: "ready",
    profileStatus: "ready",
    title: `Paper ${id}`,
    authors: "Test Author",
    bookmarkCount: 0,
  };
  const paperDir = path.join(profile, "papers", id);
  fs.mkdirSync(paperDir, { recursive: true });
  fs.writeFileSync(
    path.join(paperDir, "profile.json"),
    JSON.stringify({
      profile: {
        title: metadata.title,
        authors: "Test Author",
        abstract: "Synthetic",
        researchQuestion: "Test",
        contributions: [],
        methods: [],
        keywords: [],
        sections: [
          {
            id: "s1",
            title: "Introduction",
            level: 1,
            page: 1,
            summary: "Synthetic",
            paragraphs: [],
          },
        ],
      },
      bookmarks: [],
      schemaVersion: 1,
    }),
  );
  return metadata;
}
test("launches, adapts, and exposes three independent API sections", async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "papertutor-empty-"));
  const app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: path.resolve("."),
  });
  const page = await app.firstWindow();
  await expect(
    page.getByRole("button", { name: "PT PaperTutor" }),
  ).toBeVisible();
  await page.getByLabel("打开 OCR 文本页").click();
  await expect(page.getByRole("region", { name: "OCR 文本页" })).toBeVisible();
  await expect(page.getByText("未进行OCR")).toBeVisible();
  await page.getByLabel("关闭 OCR 文本页").click();
  await expect(page.getByRole("region", { name: "OCR 文本页" })).toHaveCount(0);
  fs.mkdirSync("screenshots", { recursive: true });
  for (const [w, h] of [
    [800, 600],
    [1280, 720],
    [1920, 1080],
    [2560, 1440],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBeTruthy();
  }
  await page.getByLabel("设置").click();
  await expect(page.getByRole("heading", { name: "模型与存储" })).toBeVisible();
  await expect(page.getByLabel("TEXT API URL")).toBeEditable();
  await expect(page.getByLabel("VISION API URL")).toBeEditable();
  await page.getByLabel("OCR 模式").selectOption("api");
  await expect(page.getByLabel("OCR API URL")).toBeEditable();
  await expect(
    page.getByRole("button", { name: "清除全部安全缓存" }),
  ).toBeVisible();
  await page.screenshot({ path: "screenshots/settings.png" });
  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
test("indexes a paper folder without parsing or model calls and restores it", async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "papertutor-library-"));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "papertutor-papers-"));
  fs.writeFileSync(path.join(folder, "alpha.pdf"), "metadata only");
  fs.writeFileSync(path.join(folder, "beta.docx"), "metadata only");
  fs.writeFileSync(path.join(folder, "ignored.txt"), "not a paper");
  let app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`, `--test-paper-folder=${folder}`],
    cwd: path.resolve("."),
  });
  let page = await app.firstWindow();
  await page.getByLabel("打开论文目录").click();
  await page.getByRole("button", { name: "导入文件夹" }).click();
  await expect(page.getByText("alpha.pdf")).toBeVisible();
  await expect(page.getByText("beta.docx")).toBeVisible();
  await expect(page.getByText("ignored.txt")).toHaveCount(0);
  await expect(page.getByText("未打开")).toHaveCount(2);
  await app.close();

  const statePath = path.join(profile, "papertutor-data.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  expect(state.library).toHaveLength(2);
  expect(state.library.every((item: any) => item.status === "indexed")).toBe(
    true,
  );
  expect(state.library.every((item: any) => !("profile" in item))).toBe(true);
  expect(state.lastPromptMetric).toBeUndefined();

  app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: path.resolve("."),
  });
  page = await app.firstWindow();
  await expect(page.getByText("alpha.pdf")).toBeVisible();
  await expect(page.getByText("beta.docx")).toBeVisible();
  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(folder, { recursive: true, force: true });
});
test("migrates legacy full profiles out of lightweight app state", async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "papertutor-migrate-"));
  const legacy = await seedReadyPaper(profile, "paper-legacy", "legacy.pdf");
  const full = JSON.parse(
    fs.readFileSync(
      path.join(profile, "papers", legacy.id, "profile.json"),
      "utf8",
    ),
  );
  fs.rmSync(path.join(profile, "papers"), { recursive: true, force: true });
  fs.writeFileSync(
    path.join(profile, "papertutor-data.json"),
    JSON.stringify({
      library: [{ ...legacy, profile: full.profile, bookmarks: [] }],
      settings: {},
    }),
  );
  const app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: path.resolve("."),
  });
  const page = await app.firstWindow();
  await page.locator(".brand").waitFor();
  await page.waitForTimeout(300);
  await app.close();
  const state = JSON.parse(
    fs.readFileSync(path.join(profile, "papertutor-data.json"), "utf8"),
  );
  expect(state.library[0]).not.toHaveProperty("profile");
  expect(
    fs.existsSync(path.join(profile, "papers", legacy.id, "profile.json")),
  ).toBe(true);
  fs.rmSync(profile, { recursive: true, force: true });
});
test("imports a real PDF and preserves its local record after restart", async () => {
  const sample = path.resolve("test-assets/attention-is-all-you-need.pdf"),
    profile = fs.mkdtempSync(path.join(os.tmpdir(), "papertutor-ui-"));
  test.skip(!fs.existsSync(sample), "sample PDF unavailable");
  let app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`, `--test-pdf=${sample}`],
    cwd: path.resolve("."),
  });
  let page = await app.firstWindow();
  await page.getByText("导入论文").click();
  await expect(page.getByRole("heading", { name: "模型与存储" })).toBeVisible({
    timeout: 30000,
  });
  await app.close();
  app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: path.resolve("."),
  });
  page = await app.firstWindow();
  await expect(page.locator(".paper-title strong")).not.toHaveText(
    "还没有打开论文",
    { timeout: 15000 },
  );
  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
test("persists three credentials and cache clearing preserves them", async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "papertutor-models-"));
  let app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: path.resolve("."),
  });
  let page = await app.firstWindow();
  await page.getByLabel("设置").click();
  await page.getByLabel("TEXT API URL").fill("URL-A");
  await page.getByLabel("TEXT API Key").fill("KEY-A");
  await page.getByLabel("TEXT 模型").fill("MODEL-A");
  await page.getByLabel("VISION API URL").fill("URL-B");
  await page.getByLabel("VISION API Key").fill("KEY-B");
  await page.getByLabel("VISION 模型").fill("MODEL-B");
  await page.getByLabel("OCR 模式").selectOption("api");
  await page.getByLabel("OCR API URL").fill("URL-C");
  await page.getByLabel("OCR API Key").fill("KEY-C");
  await page.getByLabel("OCR 模型").fill("MODEL-C");
  await page.getByRole("button", { name: "保存设置" }).click();
  await page.evaluate(async () => {
    const note = await window.paperTutor.noteOpen(
      "cache-safety-paper",
      "Paper Alpha",
    );
    await window.paperTutor.noteSave({
      id: note.id,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Test Note Alpha" }],
          },
        ],
      },
      lastCursor: 1,
      lastScrollTop: 0,
    });
  });
  await app.close();
  app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: path.resolve("."),
  });
  page = await app.firstWindow();
  await page.getByLabel("设置").click();
  await expect(page.getByLabel("TEXT API Key")).toHaveValue("KEY-A");
  await expect(page.getByLabel("VISION API Key")).toHaveValue("KEY-B");
  await expect(page.getByLabel("OCR API Key")).toHaveValue("KEY-C");
  expect(
    await page.evaluate(async () => {
      const note = await window.paperTutor.noteOpen(
        "cache-safety-paper",
        "Paper Alpha",
      );
      return JSON.stringify(note.content).includes("Test Note Alpha");
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "清除全部安全缓存" }).click();
  await expect(page.getByText("确认清除缓存？")).toBeVisible();
  await page.getByRole("button", { name: "确认清除" }).click();
  await expect(page.getByText(/缓存已清除/)).toBeVisible();
  await app.close();
  app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: path.resolve("."),
  });
  page = await app.firstWindow();
  await page.getByLabel("设置").click();
  await expect(page.getByLabel("TEXT API URL")).toHaveValue("URL-A");
  await expect(page.getByLabel("VISION API URL")).toHaveValue("URL-B");
  await expect(page.getByLabel("OCR API URL")).toHaveValue("URL-C");
  await expect(page.getByLabel("OCR API Key")).toHaveValue("KEY-C");
  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
});

test("autosaves one rich note per paper and restores it after restart", async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "papertutor-note-ui-"));
  const alpha = await seedReadyPaper(profile, "paper-alpha", "alpha.pdf");
  fs.writeFileSync(
    path.join(profile, "papertutor-data.json"),
    JSON.stringify({ library: [alpha], activePaperId: alpha.id, settings: {} }),
  );
  let app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: path.resolve("."),
  });
  let page = await app.firstWindow();
  await page.getByLabel("打开论文笔记").waitFor({ timeout: 15000 });
  await page.getByLabel("打开论文笔记").click();
  let notesPage = await noteWindow(app);
  const editor = notesPage.locator(".tiptap");
  await editor.click();
  await editor.fill("Old Note One\nOld Note Two");
  await page.waitForTimeout(1100);
  await app.close();

  app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: path.resolve("."),
  });
  page = await app.firstWindow();
  await page.getByLabel("打开论文笔记").waitFor({ timeout: 15000 });
  await page.getByLabel("打开论文笔记").click();
  notesPage = await noteWindow(app);
  await expect(notesPage.locator(".tiptap")).toContainText("Old Note One");
  await notesPage.getByRole("button", { name: /继续记录/ }).click();
  await notesPage.locator(".tiptap").pressSequentially(" New Note Three");
  await app.close();

  app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: path.resolve("."),
  });
  page = await app.firstWindow();
  await page.getByLabel("打开论文笔记").waitFor({ timeout: 15000 });
  await page.getByLabel("打开论文笔记").click();
  notesPage = await noteWindow(app);
  await expect(notesPage.locator(".tiptap")).toContainText("Old Note One");
  await expect(notesPage.locator(".tiptap")).toContainText("New Note Three");
  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
});

test("uses one lazy notes window and brokers context, inserts, anchors, export, close and geometry", async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "papertutor-note-window-"));
  const alpha = await seedReadyPaper(profile, "paper-window-alpha", "window-alpha.pdf");
  const beta = await seedReadyPaper(profile, "paper-window-beta", "window-beta.pdf");
  const gamma = await seedReadyPaper(profile, "paper-window-gamma", "window-gamma.pdf");
  fs.writeFileSync(path.join(profile, "papertutor-data.json"), JSON.stringify({
    library: [alpha, beta, gamma], activePaperId: alpha.id, settings: {},
  }));
  const app = await electron.launch({ args: [".", `--user-data-dir=${profile}`], cwd: path.resolve(".") });
  const main = await app.firstWindow();
  await main.getByLabel("打开论文笔记").waitFor({ timeout: 15000 });
  expect(app.windows()).toHaveLength(1);
  expect(await main.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("NoteWindowApp")))).toBe(false);

  for (let index = 0; index < 10; index++) await main.getByLabel("打开论文笔记").click();
  let notesPage = await noteWindow(app);
  expect(app.windows()).toHaveLength(2);
  const readiness = await notesPage.evaluate(() => ({ tiptap: Number(document.documentElement.dataset.tiptapReady), loaded: Number(document.documentElement.dataset.noteLoaded) }));
  expect(readiness.tiptap).toBeGreaterThan(0);
  expect(readiness.loaded).toBeGreaterThanOrEqual(readiness.tiptap);
  expect(readiness.loaded).toBeLessThan(1000);
  console.log(`Note readiness: Tiptap ${readiness.tiptap} ms, loaded ${readiness.loaded} ms`);
  await expect(notesPage.locator(".note-window-header").getByRole("heading", { name: "Paper paper-window-alpha" })).toBeVisible();
  for (const [width, height] of [[760, 560], [1100, 820], [1600, 1000]]) {
    const bounds = await app.evaluate(({ BrowserWindow }, size) => {
      const target = BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().includes("window=notes"))!;
      target.unmaximize(); target.setSize(size.width, size.height); return target.getSize();
    }, { width, height });
    expect(bounds[0]).toBe(width);
    expect(bounds[1]).toBeGreaterThanOrEqual(height);
    expect(bounds[1]).toBeLessThanOrEqual(height + 2);
    expect(await notesPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  const maximized = await app.evaluate(({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().includes("window=notes"))!;
    target.maximize(); return target.isMaximized();
  });
  expect(maximized).toBe(true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().includes("window=notes"))!.unmaximize());

  await main.bringToFront();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.webContents.getURL().includes("window=notes"))).toBe(false);

  await main.evaluate(async ({ contexts }) => {
    for (const context of contexts) await window.paperTutor.updateNoteContext(context);
  }, { contexts: [alpha, beta, gamma, alpha, gamma].map((paper) => ({ paperId: paper.id, title: paper.title, page: 1, sectionId: "s1" })) });
  await expect(notesPage.locator(".note-window-header").getByRole("heading", { name: "Paper paper-window-gamma" })).toBeVisible();
  await main.evaluate((context) => window.paperTutor.updateNoteContext(context), { paperId: beta.id, title: beta.title, page: 1, sectionId: "s1" });
  await expect(notesPage.locator(".note-window-header").getByRole("heading", { name: "Paper paper-window-beta" })).toBeVisible();
  await main.getByLabel("打开论文目录").click();
  await main.getByRole("button", { name: /window-beta\.pdf/ }).click();
  await expect(notesPage.locator(".note-window-header").getByRole("heading", { name: "Paper paper-window-beta" })).toBeVisible({ timeout: 15000 });
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.webContents.getURL().includes("window=notes"))).toBe(false);

  const betaContext = { paperId: beta.id, title: beta.title, page: 1, sectionId: "s1" };
  const accepted = await main.evaluate(async ({ context }) => {
    return window.paperTutor.insertIntoNote({ context, insertion: { id: crypto.randomUUID(), paperId: context.paperId, text: "Beta selection marker", kind: "quote", page: 1, sectionId: "s1" } });
  }, { context: betaContext });
  expect(accepted).toBe(true);
  await expect.poll(() => notesPage.evaluate(() => document.documentElement.dataset.lastInsertion || "")).not.toBe("");
  await expect(notesPage.locator(".tiptap")).toContainText("Beta selection marker");
  await expect(notesPage.locator(".tiptap > :first-child")).toHaveText("Paper paper-window-beta");
  await notesPage.locator(".paper-anchor").last().click();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.webContents.getURL().includes("window=notes"))).toBe(false);
  expect(app.windows()).toHaveLength(2);

  const alphaContext = { paperId: alpha.id, title: alpha.title, page: 1, sectionId: "s1" };
  await main.evaluate(async ({ context }) => {
    await window.paperTutor.insertIntoNote({ context, insertion: { id: crypto.randomUUID(), paperId: context.paperId, text: "Alpha cross-paper AI marker", kind: "ai", page: 1, sectionId: "s1" } });
  }, { context: alphaContext });
  await expect(notesPage.locator(".note-window-header").getByRole("heading", { name: "Paper paper-window-beta" })).toBeVisible();
  const stored = await main.evaluate(async ({ alphaId, betaId }) => {
    const alphaNote = await window.paperTutor.noteOpen(alphaId, "Alpha");
    const betaNote = await window.paperTutor.noteOpen(betaId, "Beta");
    return { alpha: JSON.stringify(alphaNote.content), beta: JSON.stringify(betaNote.content) };
  }, { alphaId: alpha.id, betaId: beta.id });
  expect(stored.alpha).toContain("Alpha cross-paper AI marker");
  expect(stored.beta).not.toContain("Alpha cross-paper AI marker");

  await notesPage.getByRole("button", { name: /导出/ }).click();
  await expect(main.getByRole("region", { name: "导出笔记" })).toBeVisible();
  await main.getByLabel("关闭导出中心").click();
  await notesPage.getByRole("button", { name: /清空编辑区/ }).click();
  await expect(notesPage.getByRole("dialog", { name: "确认清空当前论文笔记" })).toBeVisible();
  await notesPage.getByRole("button", { name: "取消" }).click();

  await notesPage.getByRole("button", { name: /继续记录/ }).click();
  await notesPage.locator(".tiptap").pressSequentially(" Immediate close marker");
  await app.evaluate(({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().includes("window=notes"))!;
    target.unmaximize(); target.setBounds({ x: 80, y: 70, width: 900, height: 650 });
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().includes("window=notes"))!.close());
  await expect.poll(() => app.windows().length).toBe(1);
  await main.getByLabel("打开论文笔记").click();
  notesPage = await noteWindow(app);
  await expect(notesPage.locator(".tiptap")).toContainText("Immediate close marker");
  const restored = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().includes("window=notes"))!.getBounds());
  expect(restored.width).toBe(900);
  expect(restored.height).toBeGreaterThanOrEqual(650);
  expect(restored.height).toBeLessThanOrEqual(652);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().includes("window=notes"))!.close());
  await expect.poll(() => app.windows().length).toBe(1);
  await main.evaluate(async (context) => {
    await Promise.all(["Ready queue first", "Ready queue second"].map((text) => window.paperTutor.insertIntoNote({
      context,
      insertion: { id: crypto.randomUUID(), paperId: context.paperId, text, kind: "quote", page: 1, sectionId: "s1" },
    })));
  }, betaContext);
  notesPage = await noteWindow(app);
  await expect(notesPage.locator(".tiptap")).toContainText("Ready queue first");
  await expect(notesPage.locator(".tiptap")).toContainText("Ready queue second");
  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
});
