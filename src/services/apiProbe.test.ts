import { describe, expect, it, vi } from "vitest";
import { createVisualProbe, visualProbePassed } from "./apiProbe";

function fakeCanvas() {
  const context = {
    fillStyle: "",
    font: "",
    textAlign: "",
    fillRect: vi.fn(),
    fillText: vi.fn(),
  };
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toDataURL: vi.fn(() => "data:image/png;base64,VALID_TEST_IMAGE"),
    context,
  };
}

describe("visual API probes", () => {
  it("uses an anonymous, valid-size PNG for the vision probe", () => {
    const canvas = fakeCanvas();
    const probe = createVisualProbe("VISION", () => canvas);
    expect(probe.width).toBeGreaterThanOrEqual(256);
    expect(probe.height).toBeGreaterThanOrEqual(128);
    expect(probe.mime).toBe("image/png");
    expect(probe.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(canvas.context.fillText).toHaveBeenCalledWith("123", 160, 165);
  });

  it("requires the expected visual content instead of HTTP success alone", () => {
    const probe = createVisualProbe("VISION", fakeCanvas);
    expect(visualProbePassed(probe, "图片中的数字是 123")).toBe(true);
    expect(visualProbePassed(probe, "连接成功")).toBe(false);
  });

  it("validates OCR independently with its own expected text", () => {
    const probe = createVisualProbe("OCR", fakeCanvas);
    expect(probe.prompt).toContain("识别图片中的文字");
    expect(visualProbePassed(probe, "OCR TEST 456")).toBe(true);
    expect(visualProbePassed(probe, "123")).toBe(false);
  });
});
