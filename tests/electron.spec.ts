import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
test("launches, adapts, and exposes three independent API sections", async () => {
  const app = await electron.launch({ args: ["."], cwd: path.resolve(".") });
  const page = await app.firstWindow();
  await expect(
    page.getByRole("button", { name: "PT PaperTutor" }),
  ).toBeVisible();
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
