import { useRef } from "react";
import { Scan, X } from "@phosphor-icons/react";
import type { OcrPageResult } from "./services/ocrWorkspace";
import { normalizeOcrSelection } from "./services/ocrWorkspace";

export function OcrPanel({
  pages,
  busy,
  onClose,
  onSelect,
}: {
  pages: OcrPageResult[];
  busy: boolean;
  onClose: () => void;
  onSelect: (text: string) => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const selectText = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !body.current) return;
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    if (
      !anchor ||
      !focus ||
      !body.current.contains(anchor) ||
      !body.current.contains(focus)
    )
      return;
    const text = normalizeOcrSelection(selection.toString());
    if (text) onSelect(text);
  };
  return (
    <section className="ocr-panel" aria-label="OCR 文本页">
      <header>
        <div>
          <p className="eyebrow">
            <Scan /> OCR 文本
          </p>
          <h2>可选取识别文献</h2>
        </div>
        <button onClick={onClose} aria-label="关闭 OCR 文本页">
          <X />
        </button>
      </header>
      <div className="ocr-document" ref={body} onMouseUp={selectText}>
        {busy ? (
          <div className="ocr-empty">
            <span className="ocr-loader" />
            <strong>正在识别当前页</strong>
          </div>
        ) : pages.length ? (
          pages.map((page) => (
            <article key={page.page} data-ocr-page={page.page}>
              <small>第 {page.page} 页 · OCR</small>
              <div>{page.text}</div>
            </article>
          ))
        ) : (
          <div className="ocr-empty">
            <Scan />
            <strong>未进行OCR</strong>
            <span>在左侧论文工具栏中选择“对此页执行 OCR”。</span>
          </div>
        )}
      </div>
    </section>
  );
}
