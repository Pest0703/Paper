import { _electron as electron } from "@playwright/test";
import path from "node:path";

const app = await electron.launch({ args: ["."], cwd: path.resolve(".") });
try {
  const page = await app.firstWindow();
  await page.getByLabel("设置").click();

  const visionCard = page.locator(".api-config-card").filter({ hasText: "视觉模型" });
  await visionCard.getByRole("button", { name: "测试 VISION" }).click();
  await visionCard.locator(".connection:not(.testing)").waitFor({ timeout: 180_000 });
  const vision = (await visionCard.locator(".connection").innerText()).trim();

  const ocrCard = page.locator(".api-config-card").filter({ hasText: /^OCR/ });
  await ocrCard.getByRole("button", { name: "测试 OCR" }).click();
  await ocrCard.locator(".connection:not(.testing)").waitFor({ timeout: 180_000 });
  const ocr = (await ocrCard.locator(".connection").innerText()).trim();

  if (!vision.includes("视觉能力测试通过")) throw new Error(vision);
  if (!ocr.includes("OCR 测试通过")) throw new Error(ocr);
  console.log(JSON.stringify({ vision, ocr }));
} finally {
  await app.close();
}
