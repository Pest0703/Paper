const WINDOWS_HOME_PATH = /[A-Za-z]:\\Users\\[^\\\s"'<>|]+(?:\\[^\s"'<>|]+)*/g;
const UNIX_HOME_PATH = /\/Users\/[^/\s"'<>]+(?:\/[^\s"'<>]+)*/g;

function anonymousPath(value: string) {
  const basename = value.split(/[\\/]/).filter(Boolean).at(-1) || "local-file";
  return `<local-path>/${basename}`;
}

export function sanitizeSensitiveText(value: string) {
  return value
    .replace(
      /data:image\/([a-z0-9.+-]+);base64,[a-z0-9+/=]+/gi,
      "[Image attached: image/$1; base64 hidden]",
    )
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/gi, "[REDACTED]")
    .replace(
      /("?(?:api[_-]?key|authorization|cookie|password|secret|access[_-]?token|refresh[_-]?token)"?\s*[:=]\s*)"?[^",\s}]+"?/gi,
      "$1[REDACTED]",
    )
    .replace(WINDOWS_HOME_PATH, anonymousPath)
    .replace(UNIX_HOME_PATH, anonymousPath);
}

export const sanitizeLog = sanitizeSensitiveText;
