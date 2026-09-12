import fs from "node:fs";
import path from "node:path";

const gitDir = path.resolve(".git");
if (!fs.existsSync(gitDir))
  throw new Error("Run this command from the repository root.");
const hook = path.join(gitDir, "hooks", "pre-commit");
fs.writeFileSync(hook, "#!/bin/sh\nnpm run privacy:check -- --staged\n", {
  encoding: "utf8",
  mode: 0o755,
});
console.log("PaperTutor privacy pre-commit hook installed.");
