import type { ApiSecrets, Settings } from "../types";
import type { ModelRoute } from "./modelRouting";
export type RouteCredentials = {
  baseUrl: string;
  apiKey: string;
  model: string;
};
export function credentialsFor(
  route: ModelRoute,
  settings: Settings,
  keys: ApiSecrets,
): RouteCredentials {
  return route === "TEXT"
    ? {
        baseUrl: settings.textBaseUrl,
        apiKey: keys.text,
        model: settings.textModel,
      }
    : route === "VISION"
      ? {
          baseUrl: settings.visionBaseUrl,
          apiKey: keys.vision,
          model: settings.visionModel,
        }
      : {
          baseUrl: settings.ocrBaseUrl,
          apiKey: keys.ocr,
          model: settings.ocrModel,
        };
}
class RouteClient {
  constructor(readonly route: ModelRoute) {}
  config(settings: Settings, keys: ApiSecrets) {
    return credentialsFor(this.route, settings, keys);
  }
}
export class TextModelClient extends RouteClient {
  constructor() {
    super("TEXT");
  }
}
export class VisionModelClient extends RouteClient {
  constructor() {
    super("VISION");
  }
}
export class OcrModelClient extends RouteClient {
  constructor() {
    super("OCR");
  }
}
