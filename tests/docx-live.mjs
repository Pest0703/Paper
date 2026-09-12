import { _electron as electron } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
const root = path.resolve("."),
  source = process.env.TEST_DOCX || process.argv[2],
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "papertutor-docx-"));
if (!source)
  throw new Error("TEST_DOCX or a DOCX command-line argument is required");
if (!fs.existsSync(source))
  throw new Error("Private DOCX test resource is unavailable");
const sha = () =>
    crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex"),
  before = sha(),
  hasRecord = false;
const app = await electron.launch({
  args: [".", `--user-data-dir=${profile}`, `--test-pdf=${source}`],
  cwd: root,
});
const page = await app.firstWindow();
await page.getByRole("button", { name: "PT PaperTutor" }).waitFor();
if (!hasRecord) {
  await page.getByText("导入论文").click();
  await page.getByText("返回阅读").waitFor({ timeout: 260000 });
  await page.getByText("返回阅读").click();
}
await page.getByLabel("当前页").fill("12");
await page.waitForFunction(
  () =>
    document.querySelectorAll('[data-page="12"] .text-layer span').length > 50,
  null,
  { timeout: 60000 },
);
const raw = await page.evaluate(() => {
  const all = [
      ...document.querySelectorAll('[data-page="12"] .text-layer span'),
    ].filter((x) => (x.textContent || "").trim().length > 1),
    idx = all.findIndex((x) => (x.textContent || "").trim().length > 8),
    spans = all.slice(idx, idx + 3),
    last = spans.at(-1),
    r = document.createRange();
  if (idx < 0 || !last) throw new Error("target sentence spans not found");
  r.setStart(spans[0].firstChild, 0);
  r.setEnd(
    last.firstChild,
    Math.max(1, Math.floor(last.textContent.length * 0.55)),
  );
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
  spans[0].parentElement.dispatchEvent(
    new MouseEvent("mouseup", { bubbles: true }),
  );
  return s.toString().replace(/\s+/g, " ").trim();
});
await page.locator(".selection").waitFor();
const completed = await page.locator(".selection blockquote").innerText();
await page.locator(".thinking").waitFor({ state: "hidden", timeout: 260000 });
const answer = await page.locator(".turn.assistant").last().innerText();
await app.close();
const after = sha(),
  saved = JSON.parse(
    fs.readFileSync(path.join(profile, "papertutor-data.json"), "utf8"),
  ),
  record = saved.library.find((x) => x.path === source);
console.log(
  JSON.stringify(
    {
      sourceName: "private-test-document.docx",
      sourceUnchanged: before === after,
      imported: !!record,
      pages: record?.profile?.sections
        ?.flatMap((s) => s.paragraphs)
        .reduce((m, p) => Math.max(m, p.page), 0),
      rawChars: raw.length,
      completedChars: completed.length,
      tailRecovered: completed.length > raw.length,
      answerChars: answer.length,
      storedOriginalPath: record?.path === source,
      apiKeyLogged: JSON.stringify(saved.lastPromptMetric || {}).includes(
        "sk-",
      ),
    },
    null,
    2,
  ),
);
fs.rmSync(profile, { recursive: true, force: true });
