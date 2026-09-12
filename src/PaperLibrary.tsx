import { useMemo, useState } from "react";
import {
  FileArrowUp,
  FolderOpen,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import type { PaperRecord } from "./types";
import { paperStatusLabel } from "./services/paperLibrary";

export function PaperLibrary({
  papers,
  activeId,
  onOpen,
  onImportPaper,
  onImportFolder,
  onClose,
}: {
  papers: PaperRecord[];
  activeId?: string;
  onOpen: (paper: PaperRecord) => void;
  onImportPaper: () => void;
  onImportFolder: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword
      ? papers.filter((paper) =>
          `${paper.name} ${paper.folderName || ""}`
            .toLowerCase()
            .includes(keyword),
        )
      : papers;
  }, [papers, query]);
  return (
    <div className="library-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="paper-library"
        aria-label="论文目录"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">Paper Library</p>
            <h2>论文目录</h2>
          </div>
          <button onClick={onClose} aria-label="关闭论文目录">
            <X />
          </button>
        </header>
        <div className="library-actions">
          <button onClick={onImportPaper}>
            <FileArrowUp /> 导入论文
          </button>
          <button onClick={onImportFolder}>
            <FolderOpen /> 导入文件夹
          </button>
        </div>
        <label className="library-search">
          <MagnifyingGlass />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索论文或文件夹"
            aria-label="搜索论文目录"
          />
        </label>
        <div className="library-list">
          {visible.length ? (
            visible.map((paper) => (
              <button
                key={paper.id}
                className={paper.id === activeId ? "active" : ""}
                onClick={() => onOpen(paper)}
              >
                <strong>{paper.name}</strong>
                <span>
                  <small>{paper.folderName || "单独导入"}</small>
                  <i className={paper.status}>
                    {paperStatusLabel(paper.status)}
                  </i>
                </span>
              </button>
            ))
          ) : (
            <div className="library-empty">
              <FolderOpen />
              <strong>{query ? "没有匹配的论文" : "论文目录为空"}</strong>
              <span>可导入单篇论文，也可一次登记整个文件夹。</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
