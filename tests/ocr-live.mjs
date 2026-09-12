import { _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const pdf = process.argv[2],
  key = process.env.PAPERTUTOR_TEST_API_KEY,
  url = process.env.PAPERTUTOR_TEST_BASE_URL;
if (!pdf || !key || !url)
  throw Error(
    "A private test PDF, PAPERTUTOR_TEST_API_KEY and PAPERTUTOR_TEST_BASE_URL are required",
  );
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "papertutor-ocr-")),
  state = path.join(profile, "papertutor-data.json");
const paper = {
  id: "ocr-paper",
  name: "scan.pdf",
  path: pdf,
  size: fs.statSync(pdf).size,
  fingerprint: "ocr",
  importedAt: new Date().toISOString(),
  page: 1,
  scale: 1,
  scrollTop: 0,
  bookmarks: [
    {
      id: "b",
      name: "保留书签",
      page: 1,
      scrollTop: 0,
      createdAt: new Date().toISOString(),
    },
  ],
  status: "ready",
  profile: {
    title: "English OCR Test",
    authors: "",
    abstract: "",
    researchQuestion: "",
    contributions: [],
    methods: [],
    keywords: [],
    sections: [
      {
        id: "s",
        title: "Method",
        level: 1,
        page: 1,
        summary: "English source section",
        paragraphs: [],
      },
    ],
  },
};
fs.writeFileSync(
  state,
  JSON.stringify({
    library: [paper],
    activePaperId: paper.id,
    settings: {
      provider: "Custom OpenAI Compatible",
      textBaseUrl: url,
      textModel: "qwen3.7-plus",
      visionBaseUrl: url,
      visionModel: "qwen3.8-max",
      ocrMode: "api",
      ocrBaseUrl: url,
      ocrModel: "qwen3.8-max",
      temperature: 0,
      maxTokens: 500,
      streaming: true,
      timeout: 180000,
    },
  }),
);
const app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: path.resolve("."),
  }),
  page = await app.firstWindow();
await page.getByLabel("设置").click();
await page.getByLabel("OCR API Key").fill(key);
await page.getByRole("button", { name: "保存设置" }).click();
await page.getByLabel("对此页执行 OCR").click();
await page.locator(".call-details").waitFor({ timeout: 180000 });
const summary = await page.locator(".call-details summary").last().innerText();
if (!summary.includes("OCR") || !summary.includes("qwen3.8-max"))
  throw Error("OCR metadata missing");
await page.locator(".call-details summary").last().click();
await page.getByRole("button", { name: "查看本次实际上下文" }).last().click();
const dialog = page.getByRole("dialog", { name: "请求上下文查看器" });
await dialog.getByText("图片附件").click();
const inspect = await dialog.innerText();
if (inspect.includes("data:image") || !inspect.includes("Base64：已隐藏"))
  throw Error("OCR image safety failed");
await page.getByLabel("关闭上下文查看器").click();
await page.getByLabel("对此页执行 OCR").click();
await page.waitForTimeout(700);
const cachedState = JSON.parse(fs.readFileSync(state, "utf8"));
const cachedMetric = (cachedState.tokenMetrics || [])
  .filter((x) => x.route === "OCR")
  .at(-1);
if (!cachedMetric?.localCacheHit) throw Error("OCR cache miss");
await page.getByLabel("设置").click();
await page.getByRole("button", { name: "清除全部安全缓存" }).click();
await page.getByRole("button", { name: "确认清除" }).click();
await page.getByText(/缓存已清除/).waitFor();
await page.getByRole("button", { name: "返回阅读" }).click();
await page.getByLabel("对此页执行 OCR").click();
await page.locator(".call-details").waitFor({ timeout: 180000 });
const saved = JSON.parse(fs.readFileSync(state, "utf8")),
  metrics = (saved.tokenMetrics || []).filter((x) => x.route === "OCR"),
  result = {
    ocrRecords: metrics.length,
    actualCalls: metrics.filter((x) => !x.localCacheHit).length,
    cacheHits: metrics.filter((x) => x.localCacheHit).length,
    model: metrics.at(-1)?.model,
    bookmarkPreserved: saved.library[0].bookmarks[0].name,
    readingPage: saved.library[0].page,
    secretPlaintextInState: fs.readFileSync(state, "utf8").includes(key),
  };
await app.close();
fs.rmSync(profile, { recursive: true, force: true });
console.log(JSON.stringify(result));
