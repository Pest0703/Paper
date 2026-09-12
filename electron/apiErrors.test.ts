import { describe, expect, it } from "vitest";
import { classifyApiError, sanitizeApiErrorDetail } from "./apiErrors.js";

describe("API error classification", () => {
  it.each([
    ["invalid image size", "image_size"],
    ["invalid image format", "image_format"],
    ["invalid image data", "image_invalid"],
    ["bad request", "bad_request"],
    ["model does not support image input", "vision_unsupported"],
    ["unsupported modality", "vision_unsupported"],
  ])("classifies HTTP 400 %s as %s", (message, expected) => {
    expect(classifyApiError(400, message)).toBe(expected);
  });

  it("redacts credentials, image data and local paths from details", () => {
    const key = "sk-" + "1234567890abcdef";
    const localPath = ["C:", "Users", "private", "paper.png"].join("\\");
    const authorization = "Authorization:" + " Bearer " + "secret-token";
    const safe = sanitizeApiErrorDetail(
      `${authorization} api_key=${key} ${localPath} data:image/png;base64,AAAA`,
    );
    expect(safe).not.toContain("secret-token");
    expect(safe).not.toContain(key);
    expect(safe).not.toContain(["C:", "Users"].join("\\"));
    expect(safe).not.toContain("base64,AAAA");
  });
});
