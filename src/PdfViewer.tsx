import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  BookmarkSimple,
  Camera,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
  Minus,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import type { Bookmark } from "./types";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Props = {
  pdf: PDFDocumentProxy | null;
  page: number;
  scale: number;
  initialScrollTop: number;
  bookmarks: Bookmark[];
  onPage: (n: number) => void;
  onScale: (n: number) => void;
  onSelect: (text: string, page: number) => void;
  onScroll: (n: number) => void;
  onAddBookmark: (name: string, page: number, scrollTop: number) => void;
  onRemoveBookmark: (id: string) => void;
  onCapture: (capture: { dataUrl: string; page: number }) => void;
};

function PdfPage({
  pdf,
  number,
  scale,
  onSelect,
  captureMode,
  onCapture,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  scale: number;
  onSelect: (text: string, page: number) => void;
  captureMode: boolean;
  onCapture: (capture: { dataUrl: string; page: number }) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  // Reserve an A4-sized slot immediately so pages above the current view do not
  // grow later and make a page jump land several pages too early.
  const [size, setSize] = useState({ width: 595 * scale, height: 842 * scale });
  const [drag, setDrag] = useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const dragRef=useRef<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  useEffect(() => {
    let cancelled = false,
      task: any;
    pdf
      .getPage(number)
      .then(async (p) => {
      if (cancelled) return;
      const viewport = p.getViewport({ scale });
      setSize({ width: viewport.width, height: viewport.height });
        const c = canvas.current;
        if (!c) return;
        const ratio = window.devicePixelRatio || 1;
        c.width = viewport.width * ratio;
        c.height = viewport.height * ratio;
        c.style.width = `${viewport.width}px`;
        c.style.height = `${viewport.height}px`;
        const ctx = c.getContext("2d")!;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        task = p.render({ canvasContext: ctx, viewport } as any);
        await task.promise;
        const tc = await p.getTextContent();
        if (cancelled || !layer.current) return;
        layer.current.innerHTML = "";
        layer.current.style.width = `${viewport.width}px`;
        layer.current.style.height = `${viewport.height}px`;
        for (const item of tc.items as any[]) {
          const span = document.createElement("span");
          span.textContent = item.str;
          const tx = pdfjs.Util.transform(viewport.transform, item.transform);
          const font = Math.hypot(tx[2], tx[3]);
          span.style.left = `${tx[4]}px`;
          span.style.top = `${tx[5] - font}px`;
          span.style.fontSize = `${font}px`;
          span.style.transform = `scaleX(${Math.max(0.6, Math.min(1.8, (item.width * scale) / Math.max(1, item.str.length * font * 0.5)))})`;
          layer.current.appendChild(span);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      task?.cancel?.();
    };
  }, [pdf, number, scale]);
  const select = () => {
    if(captureMode)return;
    const s = window.getSelection()?.toString().replace(/\s+/g, " ").trim();
    if (s && s.length > 1) onSelect(s, number);
  };
  const point=(e:React.PointerEvent<HTMLDivElement>)=>{const r=e.currentTarget.getBoundingClientRect();return{x:Math.max(0,Math.min(r.width,e.clientX-r.left)),y:Math.max(0,Math.min(r.height,e.clientY-r.top))}};
  const finishCapture=(e:React.PointerEvent<HTMLDivElement>)=>{
    const active=dragRef.current;if(!active||!canvas.current)return;const p=point(e),x=Math.min(active.x1,p.x),y=Math.min(active.y1,p.y),w=Math.abs(p.x-active.x1),h=Math.abs(p.y-active.y1);dragRef.current=null;setDrag(null);if(w<12||h<12)return;
    const source=canvas.current,ratio=source.width/Math.max(1,source.getBoundingClientRect().width),out=document.createElement('canvas');out.width=Math.round(w*ratio);out.height=Math.round(h*ratio);out.getContext('2d')?.drawImage(source,Math.round(x*ratio),Math.round(y*ratio),out.width,out.height,0,0,out.width,out.height);onCapture({dataUrl:out.toDataURL('image/png'),page:number});
  };
  return (
    <div className="page-wrap" data-page={number} style={size} onMouseUp={select}>
      <canvas ref={canvas} />
      <div ref={layer} className="text-layer" />
      {captureMode&&<div className="capture-layer" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);const p=point(e),next={x1:p.x,y1:p.y,x2:p.x,y2:p.y};dragRef.current=next;setDrag(next)}} onPointerMove={e=>{const active=dragRef.current;if(active){const p=point(e),next={...active,x2:p.x,y2:p.y};dragRef.current=next;setDrag(next)}}} onPointerUp={finishCapture} onPointerCancel={()=>{dragRef.current=null;setDrag(null)}}>{drag&&<div className="capture-box" style={{left:Math.min(drag.x1,drag.x2),top:Math.min(drag.y1,drag.y2),width:Math.abs(drag.x2-drag.x1),height:Math.abs(drag.y2-drag.y1)}}/>}<span>拖动框选公式或图片</span></div>}
      <span className="page-number">{number}</span>
    </div>
  );
}

export function PdfViewer({
  pdf,
  page,
  scale,
  initialScrollTop,
  bookmarks,
  onPage,
  onScale,
  onSelect,
  onScroll,
  onAddBookmark,
  onRemoveBookmark,
  onCapture,
}: Props) {
  const [search, setSearch] = useState("");
  const [bookmarkName, setBookmarkName] = useState("");
  const [captureMode, setCaptureMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ignoreNext = useRef(false);
  const restored = useRef("");
  const go = (n: number) => {
    const target = Math.max(1, Math.min(pdf?.numPages || 1, n));
    scrollRef.current
      ?.querySelector(`[data-page="${target}"]`)
      ?.scrollIntoView({ behavior: "auto", block: "start" });
    onPage(target);
  };
  useEffect(() => {
    if (!pdf) return;
    const restoreKey = `${pdf.fingerprints?.[0] || pdf.numPages}:${scale}`;
    if (restored.current !== restoreKey) {
      restored.current = restoreKey;
      const id = requestAnimationFrame(() => {
        const box = scrollRef.current;
        if (!box) return;
        if (initialScrollTop > 0) box.scrollTop = initialScrollTop;
        else box.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ block: "start" });
      });
      return () => cancelAnimationFrame(id);
    }
    if (ignoreNext.current) {
      ignoreNext.current = false;
      return;
    }
    scrollRef.current
      ?.querySelector(`[data-page="${page}"]`)
      ?.scrollIntoView({ block: "start" });
  }, [page, pdf, scale]);
  const handleScroll = () => {
    const box = scrollRef.current;
    if (!box) return;
    onScroll(box.scrollTop);
    const top = box.getBoundingClientRect().top + 70;
    let best = page,
      dist = Infinity;
    box.querySelectorAll<HTMLElement>(".page-wrap").forEach((el) => {
      const d = Math.abs(el.getBoundingClientRect().top - top);
      if (d < dist) {
        dist = d;
        best = Number(el.dataset.page);
      }
    });
    if (best !== page) {
      ignoreNext.current = true;
      onPage(best);
    }
  };
  const doSearch = async () => {
    if (!pdf || !search.trim()) return;
    for (let n = 1; n <= pdf.numPages; n++) {
      const t = (await (await pdf.getPage(n)).getTextContent()).items
        .map((x: any) => x.str)
        .join(" ");
      if (t.toLowerCase().includes(search.toLowerCase())) {
        go(n);
        return;
      }
    }
  };
  const addBookmark = () => {
    const name = bookmarkName.trim() || `书签 ${bookmarks.length + 1}`;
    onAddBookmark(name, page, scrollRef.current?.scrollTop || 0);
    setBookmarkName("");
  };
  const jumpBookmark = (bookmark: Bookmark) => {
    if (scrollRef.current) scrollRef.current.scrollTop = bookmark.scrollTop;
    ignoreNext.current = true;
    onPage(bookmark.page);
  };
  return (
    <section className="reader" aria-label="PDF 阅读区">
      <div className="pdf-toolbar">
        <div className="tool-group">
          <button className={captureMode?'active-tool':''} aria-label={captureMode?'取消截图':'截图提问'} onClick={()=>{window.getSelection()?.removeAllRanges();setCaptureMode(v=>!v)}} title="框选公式或图片后向模型提问"><Camera/></button>
          <button
            aria-label="上一页"
            disabled={page <= 1}
            onClick={() => go(page - 1)}
          >
            <CaretLeft />
          </button>
          <span>
            <input
              aria-label="当前页"
              value={page}
              onChange={(e) => go(+e.target.value || 1)}
            />{" "}
            / {pdf?.numPages || 0}
          </span>
          <button
            aria-label="下一页"
            disabled={!pdf || page >= pdf.numPages}
            onClick={() => go(page + 1)}
          >
            <CaretRight />
          </button>
        </div>
        <div className="search">
          <MagnifyingGlass />
          <input
            aria-label="搜索论文"
            placeholder="搜索论文"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
        </div>
        <div className="tool-group">
          <button
            aria-label="缩小"
            onClick={() => onScale(Math.max(0.55, scale - 0.1))}
          >
            <Minus />
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button
            aria-label="放大"
            onClick={() => onScale(Math.min(2.2, scale + 0.1))}
          >
            <Plus />
          </button>
        </div>
      </div>
      <div className="reader-content">
        <aside className="bookmark-rail" aria-label="论文书签">
          <div className="bookmark-heading"><BookmarkSimple weight="fill"/><strong>书签</strong></div>
          <form onSubmit={(e) => { e.preventDefault(); addBookmark(); }}>
            <input aria-label="书签名称" value={bookmarkName} onChange={(e) => setBookmarkName(e.target.value)} placeholder={`第 ${page} 页书签`} />
            <button aria-label="添加书签" title="添加当前位置书签"><BookmarkSimple/>添加当前位置</button>
          </form>
          <div className="bookmark-list">
            {bookmarks.length ? bookmarks.map((b) => <div className="bookmark-item" key={b.id}>
              <button className="bookmark-jump" onClick={() => jumpBookmark(b)} title={`跳转到第 ${b.page} 页`}><span>{b.name}</span><small>第 {b.page} 页</small></button>
              <button className="bookmark-delete" aria-label={`删除书签 ${b.name}`} onClick={() => onRemoveBookmark(b.id)}><Trash/></button>
            </div>) : <p>还没有书签</p>}
          </div>
        </aside>
        <div ref={scrollRef} className="pdf-scroll continuous" onScroll={handleScroll}>
        {pdf ? (
          Array.from({ length: pdf.numPages }, (_, i) => (
            <PdfPage
              key={i + 1}
              pdf={pdf}
              number={i + 1}
              scale={scale}
              onSelect={onSelect}
              captureMode={captureMode}
              onCapture={(capture)=>{setCaptureMode(false);onCapture(capture)}}
            />
          ))
        ) : (
          <div className="empty-reader">
            <div className="paper-mark">P</div>
            <h2>把论文放到阅读桌上</h2>
            <p>
              导入 PDF 或 Word 后，PaperTutor
              会先建立章节、段落和句子索引，再开始模型预读。
            </p>
          </div>
        )}
        </div>
      </div>
    </section>
  );
}
