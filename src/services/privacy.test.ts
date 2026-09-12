import { describe, expect, it } from "vitest";
import { sanitizeSensitiveText } from "./privacy";

describe("privacy sanitization", () => {
  it("redacts a Windows user path", () => {
    const input = [
      "C:",
      "Users",
      "alice",
      "Desktop",
      "private-paper.docx",
    ].join("\\");
    const result = sanitizeSensitiveText(input);
    expect(result).not.toContain("alice");
    expect(result).not.toContain("Desktop");
    expect(result).toContain("<local-path>/private-paper.docx");
  });

  it("redacts a Unix home path", () => {
    const input = ["", "Users", "alice", "Documents", "private-paper.pdf"].join(
      "/",
    );
    const result = sanitizeSensitiveText(input);
    expect(result).not.toContain("alice");
    expect(result).not.toContain("Documents");
    expect(result).toContain("<local-path>/private-paper.pdf");
  });

  it("redacts authorization and API keys", () => {
    const key = "sk-" + "exampleSecretValue123";
    const authorization = "Authorization:" + " Bearer " + "private-token";
    const result = sanitizeSensitiveText(
      `${authorization} API_KEY=${key}`,
    );
    expect(result).not.toContain("private-token");
    expect(result).not.toContain(key);
  });
});
