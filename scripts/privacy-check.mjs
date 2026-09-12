import { execFileSync } from "node:child_process";
import fs from "node:fs";

const BLOCKED_DOCUMENT = /\.(?:pdf|doc|docx)$/i;
const RULES = [
  ["Windows user-home path", /[A-Za-z]:\\Users\\(?!<)[^\\\s]+\\/i],
  ["macOS user-home path", /\/Users\/(?!<)[^/\s]+\//i],
  ["personal folder path", /(?:^|[\\/"'])(?:Desktop|Downloads|Documents|OneDrive)[\\/]/i],
  ["API secret", /sk-[A-Za-z0-9_-]{16,}/i],
  ["Authorization bearer", /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._-]{12,}/i],
  [
    "non-empty API key assignment",
    /(?:^|\n)[ \t]*[A-Z0-9_]*API_KEY[ \t]*=[ \t]*[^\s#][^\r\n]*/i,
  ],
  [
    "workspace-specific endpoint",
    /https?:\/\/[A-Za-z0-9-]+\.(?:[A-Za-z0-9-]+\.)*maas\.aliyuncs\.com(?:\/|\b)/i,
  ],
];

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

export function scanEntries(entries) {
  const findings = [];
  for (const { name, content = "" } of entries) {
    const normalized = name.replaceAll("\\", "/");
    if (BLOCKED_DOCUMENT.test(normalized)) {
      findings.push({ name: normalized, rule: "private document file" });
      continue;
    }
    for (const [rule, pattern] of RULES) {
      if (pattern.test(content)) findings.push({ name: normalized, rule });
    }
  }
  return findings;
}

function stagedEntries() {
  const names = git([
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMR",
    "-z",
  ])
    .split("\0")
    .filter(Boolean);
  return names.map((name) => ({
    name,
    content: fs.existsSync(name) ? fs.readFileSync(name, "utf8") : "",
  }));
}

function trackedEntries() {
  return git(["ls-files", "-z"])
    .split("\0")
    .filter(Boolean)
    .map((name) => ({ name, content: fs.readFileSync(name, "utf8") }));
}

function historyEntries() {
  const objects = git(["rev-list", "--objects", "--all"])
    .trim()
    .split("\n")
    .map((line) => {
      const split = line.indexOf(" ");
      return split < 0
        ? null
        : { oid: line.slice(0, split), name: line.slice(split + 1) };
    })
    .filter(Boolean);
  const seen = new Set();
  const entries = [];
  for (const object of objects) {
    if (seen.has(object.oid)) continue;
    seen.add(object.oid);
    try {
      const type = git(["cat-file", "-t", object.oid]).trim();
      if (type !== "blob") continue;
      entries.push({
        name: object.name,
        content: git(["cat-file", "blob", object.oid]),
      });
    } catch {}
  }
  return entries;
}

function main() {
  const mode = process.argv.includes("--history")
    ? "history"
    : process.argv.includes("--staged")
      ? "staged"
      : "tracked";
  const entries =
    mode === "history"
      ? historyEntries()
      : mode === "staged"
        ? stagedEntries()
        : trackedEntries();
  const findings = scanEntries(entries);
  if (findings.length) {
    console.error(
      `Privacy check failed (${mode}): ${findings.length} finding(s).`,
    );
    for (const finding of findings)
      console.error(`- ${finding.rule}: ${finding.name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Privacy check passed (${mode}, ${entries.length} files/blobs).`);
}

if (
  process.argv[1] &&
  new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") ===
    process.argv[1].replaceAll("\\", "/")
)
  main();
