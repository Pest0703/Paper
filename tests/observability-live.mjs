import { _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const pdf = process.argv[2],
  key = process.env.PAPERTUTOR_TEST_API_KEY,
  baseUrl = process.env.PAPERTUTOR_TEST_BASE_URL;
if (!pdf || !key || !baseUrl)
  throw new Error(
    "A private test PDF, PAPERTUTOR_TEST_API_KEY and PAPERTUTOR_TEST_BASE_URL are required",
  );
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "papertutor-observe-")),
  statePath = path.join(profile, "papertutor-data.json"),
  paragraph =
    "This paragraph explains entity alignment with structural and attribute evidence. The model compares two knowledge graphs and identifies equivalent entities.";
const paper = {
  id: "observe-paper",
  name: "observe.pdf",
  path: pdf,
  size: fs.statSync(pdf).size,
  fingerprint: "observe",
  importedAt: new Date().toISOString(),
  page: 1,
  scale: 1.1,
  scrollTop: 0,
  bookmarks: [],
  status: "ready",
  profile: {
    title: "PaperTutor Observability Test",
    authors: "",
    abstract: "",
    researchQuestion: "How are equivalent entities identified?",
    contributions: [],
    methods: [],
    keywords: [],
    sections: [
      {
        id: "s1",
        title: "Method",
        level: 1,
        page: 1,
        summary: "The section explains structural and attribute evidence.",
        paragraphs: [
          {
            id: "p1",
            text: paragraph,
            page: 1,
            sectionId: "s1",
            sentences: [
              {
                id: "x1",
                text: paragraph,
                page: 1,
                paragraphId: "p1",
                sectionId: "s1",
              },
            ],
          },
          {
            id: "p2",
            text: "The next paragraph provides local context for the selected sentence and tests retrieval provenance.",
            page: 1,
            sectionId: "s1",
            sentences: [],
          },
        ],
      },
    ],
  },
};
fs.writeFileSync(
  statePath,
  JSON.stringify({
    library: [paper],
    activePaperId: paper.id,
    settings: {
      provider: "Custom OpenAI Compatible",
      baseUrl,
      textModel: "qwen3.7-plus",
      visionModel: "qwen3.8-max",
      temperature: 0.1,
      maxTokens: 300,
      streaming: true,
      timeout: 180000,
    },
  }),
);
const app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: path.resolve("."),
    env: { ...process.env, DEEPSEEK_API_KEY: key },
  }),
  page = await app.firstWindow();
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForFunction(
  () =>
    document.querySelectorAll('[data-page="1"] .text-layer span').length > 1,
  null,
  { timeout: 30000 },
);
await page.evaluate(() => {
  const spans = [
    ...document.querySelectorAll('[data-page="1"] .text-layer span'),
  ].filter((x) => (x.textContent || "").trim());
  const start = spans.findIndex((x) =>
    (x.textContent || "").includes("This paragraph"),
  );
  const chosen = spans.slice(Math.max(0, start), Math.max(0, start) + 2);
  const r = document.createRange();
  r.setStart(chosen[0].firstChild, 0);
  const last = chosen.at(-1);
  r.setEnd(last.firstChild, last.textContent.length);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
  chosen[0].parentElement.dispatchEvent(
    new MouseEvent("mouseup", { bubbles: true }),
  );
});
await page.getByRole("button", { name: "自定义提问" }).click();
await page.getByLabel("本次提示词").fill("请只用一句话说明这里的核心机制。");
await page.getByRole("button", { name: /确认文字与提示词并分析/ }).click();
await page.locator(".call-details").waitFor({ timeout: 180000 });
const textSummary = await page
  .locator(".call-details summary")
  .last()
  .innerText();
await page.locator(".call-details summary").last().click();
await page.getByRole("button", { name: "查看本次实际上下文" }).last().click();
const dialog = page.getByRole("dialog", { name: "请求上下文查看器" });
const textDialog = await dialog.innerText();
const textRequest = /Request ID：([^\s]+)/.exec(textDialog)?.[1];
if (
  !textDialog.includes("最终实际 messages") ||
  /sk-[A-Za-z0-9_-]{8,}/.test(textDialog)
)
  throw new Error("TEXT inspector safety failed");
await page.getByLabel("关闭上下文查看器").click();
await page.getByLabel("截图提问").click();
const layer = page.locator('[data-page="1"] .capture-layer'),
  box = await layer.boundingBox();
if (!box) throw new Error("capture layer unavailable");
await page.mouse.move(box.x + 60, box.y + 80);
await page.mouse.down();
await page.mouse.move(box.x + 360, box.y + 230);
await page.mouse.up();
await page.getByLabel("截图问题").fill("请简要说明截图中的内容。");
await page.getByRole("button", { name: "确认截图并分析" }).click();
await page.locator(".call-details").waitFor({ timeout: 180000 });
const visionSummary = await page
  .locator(".call-details summary")
  .last()
  .innerText();
await page.locator(".call-details summary").last().click();
await page.getByRole("button", { name: "查看本次实际上下文" }).last().click();
const visionDialog = await dialog.innerText(),
  visionRequest = /Request ID：([^\s]+)/.exec(visionDialog)?.[1];
if (
  visionDialog.includes("data:image") ||
  /[A-Za-z0-9+/]{200,}={0,2}/.test(visionDialog)
)
  throw new Error("VISION base64 leaked");
await page.setViewportSize({ width: 760, height: 600 });
const overflow = await dialog.evaluate((el) => el.scrollWidth > el.clientWidth);
await page.getByLabel("关闭上下文查看器").click();
await app.close();
const saved = JSON.parse(fs.readFileSync(statePath, "utf8")),
  metrics = saved.tokenMetrics || [];
const result = {
  text: { summary: textSummary, requestId: textRequest },
  vision: {
    summary: visionSummary,
    requestId: visionRequest,
    base64Hidden: true,
  },
  independentRequests: textRequest !== visionRequest,
  metrics: metrics.map((x) => ({
    route: x.route,
    model: x.model,
    inputTokens: x.inputTokens,
    outputTokens: x.outputTokens,
    totalTokens: x.totalTokens,
    latency: x.latency,
    localCacheHit: x.localCacheHit,
    estimatedCost: x.estimatedCost,
  })),
  narrowOverflow: overflow,
};
fs.rmSync(profile, { recursive: true, force: true });
console.log(JSON.stringify(result, null, 2));
