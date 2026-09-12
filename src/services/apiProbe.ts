export type VisualProbeRoute = "VISION" | "OCR";

type ProbeCanvas = {
  width: number;
  height: number;
  getContext(type: "2d"): {
    fillStyle: string;
    font: string;
    textAlign: string;
    fillRect(x: number, y: number, width: number, height: number): void;
    fillText(text: string, x: number, y: number): void;
  } | null;
  toDataURL(type: "image/png"): string;
};

export type VisualProbe = {
  dataUrl: string;
  width: number;
  height: number;
  mime: "image/png";
  prompt: string;
  expected: string;
};

export function createVisualProbe(
  route: VisualProbeRoute,
  canvasFactory: () => ProbeCanvas = () =>
    document.createElement("canvas") as ProbeCanvas,
): VisualProbe {
  const canvas = canvasFactory();
  canvas.width = 320;
  canvas.height = 200;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_context_unavailable");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111111";
  context.textAlign = "center";
  context.font = "700 28px Arial, sans-serif";
  context.fillText("PaperTutor", 160, 58);
  context.font = "700 30px Arial, sans-serif";
  context.fillText(route === "VISION" ? "VISION TEST" : "OCR TEST", 160, 108);
  context.font = "700 42px Arial, sans-serif";
  context.fillText(route === "VISION" ? "123" : "456", 160, 165);
  const dataUrl = canvas.toDataURL("image/png");
  if (!dataUrl.startsWith("data:image/png;base64,"))
    throw new Error("canvas_png_generation_failed");
  return {
    dataUrl,
    width: canvas.width,
    height: canvas.height,
    mime: "image/png",
    prompt:
      route === "VISION"
        ? "请读取图片中的数字，只回复你看到的数字，不要解释。"
        : "识别图片中的文字，只输出识别结果，不要解释。",
    expected: route === "VISION" ? "123" : "456",
  };
}

export function visualProbePassed(probe: VisualProbe, responseText: unknown) {
  return String(responseText || "").includes(probe.expected);
}
