export type ApiErrorCode =
  | "auth"
  | "model"
  | "timeout"
  | "rate"
  | "server"
  | "vision_unsupported"
  | "image_invalid"
  | "image_size"
  | "image_format"
  | "bad_request"
  | "network"
  | "empty";

export function classifyApiError(
  status: number | undefined,
  message: unknown,
): ApiErrorCode {
  const detail = String(message || "");
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "model";
  if (status === 429) return "rate";
  if (
    status === 413 ||
    /image too (?:small|large)|invalid image size|image (?:size|resolution|width|height)|resolution|width|height/i.test(
      detail,
    )
  )
    return "image_size";
  if (
    /unsupported image format|invalid image format|invalid mime type|unsupported (?:media|mime) type/i.test(
      detail,
    )
  )
    return "image_format";
  if (
    /invalid image(?: data)?|failed to decode image|image decode failed|malformed image|image preprocessing failed/i.test(
      detail,
    )
  )
    return "image_invalid";
  if (
    /does not support image input|image input is not supported|unsupported modality|model only supports text|vision input (?:is )?not supported|multimodal input (?:is )?not supported/i.test(
      detail,
    )
  )
    return "vision_unsupported";
  if (status === 400) return "bad_request";
  if (status != null && status >= 500) return "server";
  return "network";
}

export function sanitizeApiErrorDetail(message: unknown) {
  return String(message || "")
    .replace(
      /data:image\/([a-z0-9.+-]+);base64,[a-z0-9+/=]+/gi,
      "[image base64 hidden]",
    )
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/gi, "[REDACTED]")
    .replace(
      /([A-Za-z]:\\(?:[^\\\s:*?"<>|]+\\)*[^\\\s:*?"<>|]*)/g,
      "[local path hidden]",
    )
    .replace(
      /("?(?:api[_-]?key|authorization|cookie|password|secret|access[_-]?token)"?\s*[:=]\s*)"?[^",\s}]+"?/gi,
      "$1[REDACTED]",
    )
    .slice(0, 500);
}
