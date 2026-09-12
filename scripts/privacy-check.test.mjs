import assert from "node:assert/strict";
import { scanEntries } from "./privacy-check.mjs";

const check = (name, content) => scanEntries([{ name, content }]);
assert.equal(
  check(".env.example", "TEXT_API_KEY=\nVISION_API_KEY=\n").length,
  0,
);
assert.ok(
  check(
    "sample.txt",
    ["C:", "Users", "alice", "Desktop", "private.docx"].join("\\"),
  ).length,
);
assert.ok(
  check(
    "sample.txt",
    ["", "Users", "alice", "Downloads", "private.pdf"].join("/"),
  ).length,
);
assert.ok(check("sample.txt", "TEXT_API_" + "KEY=real-secret-value").length);
assert.ok(
  check("sample.txt", "Authorization: Bearer " + "private-token-value").length,
);
assert.ok(check("sample.txt", "sk-" + "exampleSecretValue123").length);
assert.ok(
  check(
    "sample.txt",
    "https://ws-" +
      "example123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
  ).length,
);
assert.ok(check("private-paper.pdf", "").length);
assert.ok(check("private-paper.docx", "").length);
console.log("Privacy guard simulation tests passed.");
