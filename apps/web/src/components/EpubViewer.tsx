import ePub from "epubjs";
import type { Book } from "epubjs";
import type { Location, Rendition } from "epubjs";
import type { NavItem } from "epubjs";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./EpubViewer.module.css";

interface Props {
  mediaId: string;
  title: string;
  onClose: () => void;
}

type Theme = "light" | "dark" | "sepia";

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28];
const DEFAULT_FONT_IDX = 2; // 16px
const LINE_HEIGHTS = [1.3, 1.5, 1.7, 2.0];
const DEFAULT_LINE_IDX = 1; // 1.5

const THEME_STYLES: Record<Theme, Record<string, string>> = {
  light: { background: "#ffffff", color: "#1a1a1a" },
  dark: { background: "#1a1a2e", color: "#e0e0e0" },
  sepia: { background: "#f4ecd8", color: "#3b2e1e" },
};

function savePosition(mediaId: string, cfi: string, chapterTitle?: string) {
  fetch(`/api/v1/media/${mediaId}/reading-position`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cfi, ...(chapterTitle ? { chapterTitle } : {}) }),
  }).catch(() => {
    // best-effort save
  });
}

export default function EpubViewer({ mediaId, title, onClose }: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const [toc, setToc] = useState<NavItem[]>([]);
  const [currentCfi, setCurrentCfi] = useState<string>("");
  const [currentChapter, setCurrentChapter] = useState<string>("");
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fontIdx, setFontIdx] = useState(DEFAULT_FONT_IDX);
  const [lineIdx, setLineIdx] = useState(DEFAULT_LINE_IDX);
  const [theme, setTheme] = useState<Theme>("light");
  const [showToc, setShowToc] = useState(true);

  const applyTheme = useCallback((rendition: Rendition, t: Theme, fIdx: number, lIdx: number) => {
    const ts = THEME_STYLES[t];
    const fontSize = FONT_SIZES[fIdx] ?? 16;
    const lineHeight = LINE_HEIGHTS[lIdx] ?? 1.5;
    rendition.themes.register("xon", {
      body: {
        background: ts.background ?? "#ffffff",
        color: ts.color ?? "#1a1a1a",
        "font-size": `${fontSize}px`,
        "line-height": String(lineHeight),
        padding: "1em 2em",
      },
      "*, *::before, *::after": {
        "box-sizing": "border-box",
      },
    });
    rendition.themes.select("xon");
  }, []);

  // Init book — only re-run when mediaId changes; theme/fontIdx/lineIdx changes handled by separate effect
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — book init must only run on mediaId change
  useEffect(() => {
    if (!viewerRef.current) return;

    setLoading(true);
    setError(null);

    const book = ePub(`/api/v1/media/${mediaId}/epub`);
    bookRef.current = book;

    const rendition = book.renderTo(viewerRef.current, {
      width: "100%",
      height: "100%",
      flow: "scrolled-doc",
    });
    renditionRef.current = rendition;

    applyTheme(rendition, theme, fontIdx, lineIdx);

    // Load saved position then display
    fetch(`/api/v1/media/${mediaId}/reading-position`)
      .then((r) => r.json())
      .then((pos: unknown) => {
        const savedCfi =
          pos && typeof pos === "object" && "cfi" in pos ? (pos as { cfi: string }).cfi : undefined;
        return rendition.display(savedCfi);
      })
      .catch(() => rendition.display())
      .then(() => setLoading(false))
      .catch(() => {
        setError("Failed to load EPUB.");
        setLoading(false);
      });

    // Load TOC
    book.loaded.navigation
      .then((nav) => {
        setToc(nav.toc);
      })
      .catch(() => {
        // TOC unavailable
      });

    // Track location changes
    rendition.on("relocated", (location: Location) => {
      const cfi = location.start.cfi;
      setCurrentCfi(cfi);
      setAtStart(location.atStart ?? false);
      setAtEnd(location.atEnd ?? false);

      // Resolve chapter title from TOC
      book.loaded.navigation
        .then((nav) => {
          const spineItem = book.spine.get(cfi);
          if (spineItem) {
            const chapter = nav.toc.find((item) => item.href.includes(spineItem.href ?? ""));
            const chapterTitle = chapter?.label ?? "";
            setCurrentChapter(chapterTitle);
            savePosition(mediaId, cfi, chapterTitle || undefined);
          } else {
            savePosition(mediaId, cfi);
          }
        })
        .catch(() => {
          savePosition(mediaId, cfi);
        });
    });

    book.on("openFailed", () => {
      setError("Failed to open EPUB file.");
      setLoading(false);
    });

    return () => {
      renditionRef.current = null;
      bookRef.current = null;
      book.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId]);

  // Re-apply theme/font when settings change (after initial load)
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    applyTheme(rendition, theme, fontIdx, lineIdx);
  }, [theme, fontIdx, lineIdx, applyTheme]);

  const goNext = useCallback(() => {
    renditionRef.current?.next();
  }, []);

  const goPrev = useCallback(() => {
    renditionRef.current?.prev();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        goPrev();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, goNext, goPrev]);

  const themeStyle = THEME_STYLES[theme];

  return (
    <dialog
      open
      className={styles.overlay ?? ""}
      aria-label={`EPUB Viewer: ${title}`}
      style={{ background: themeStyle.background, color: themeStyle.color }}
    >
      {/* Toolbar */}
      <div className={`${styles.toolbar ?? ""} ${styles[`toolbar_${theme}`] ?? ""}`}>
        <button
          type="button"
          className={styles.closeBtn ?? ""}
          onClick={onClose}
          title="Close (Esc)"
        >
          ✕
        </button>
        <button
          type="button"
          className={`${styles.tocToggle ?? ""} ${showToc ? (styles.tocToggleActive ?? "") : ""}`}
          onClick={() => setShowToc((v) => !v)}
          title="Toggle table of contents"
        >
          ☰
        </button>
        <span className={styles.toolbarTitle ?? ""}>{currentChapter || title}</span>
        <div className={styles.toolbarControls ?? ""}>
          {/* Font size */}
          <button
            type="button"
            className={styles.ctrlBtn ?? ""}
            onClick={() => setFontIdx((i) => Math.max(i - 1, 0))}
            disabled={fontIdx === 0}
            title="Decrease font size"
          >
            A−
          </button>
          <span className={styles.ctrlLabel ?? ""}>{FONT_SIZES[fontIdx]}px</span>
          <button
            type="button"
            className={styles.ctrlBtn ?? ""}
            onClick={() => setFontIdx((i) => Math.min(i + 1, FONT_SIZES.length - 1))}
            disabled={fontIdx === FONT_SIZES.length - 1}
            title="Increase font size"
          >
            A+
          </button>
          {/* Line height */}
          <button
            type="button"
            className={styles.ctrlBtn ?? ""}
            onClick={() => setLineIdx((i) => Math.max(i - 1, 0))}
            disabled={lineIdx === 0}
            title="Decrease line height"
          >
            ↕−
          </button>
          <button
            type="button"
            className={styles.ctrlBtn ?? ""}
            onClick={() => setLineIdx((i) => Math.min(i + 1, LINE_HEIGHTS.length - 1))}
            disabled={lineIdx === LINE_HEIGHTS.length - 1}
            title="Increase line height"
          >
            ↕+
          </button>
          {/* Theme */}
          <button
            type="button"
            className={`${styles.themeBtn ?? ""} ${theme === "light" ? (styles.themeBtnActive ?? "") : ""}`}
            onClick={() => setTheme("light")}
            title="Light theme"
          >
            ☀
          </button>
          <button
            type="button"
            className={`${styles.themeBtn ?? ""} ${theme === "sepia" ? (styles.themeBtnActive ?? "") : ""}`}
            onClick={() => setTheme("sepia")}
            title="Sepia theme"
          >
            ♜
          </button>
          <button
            type="button"
            className={`${styles.themeBtn ?? ""} ${theme === "dark" ? (styles.themeBtnActive ?? "") : ""}`}
            onClick={() => setTheme("dark")}
            title="Dark theme"
          >
            ☾
          </button>
          {/* Navigation */}
          <button
            type="button"
            className={styles.navBtn ?? ""}
            onClick={goPrev}
            disabled={atStart}
            title="Previous (←)"
          >
            ‹
          </button>
          <button
            type="button"
            className={styles.navBtn ?? ""}
            onClick={goNext}
            disabled={atEnd}
            title="Next (→)"
          >
            ›
          </button>
        </div>
      </div>

      <div className={styles.body ?? ""}>
        {/* TOC sidebar */}
        {showToc && toc.length > 0 && (
          <div className={`${styles.sidebar ?? ""} ${styles[`sidebar_${theme}`] ?? ""}`}>
            <div className={styles.sidebarTitle ?? ""}>Contents</div>
            {toc.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.tocItem ?? ""} ${item.href && currentCfi.includes(item.href.replace(/#.*$/, "")) ? (styles.tocItemActive ?? "") : ""}`}
                onClick={() => renditionRef.current?.display(item.href)}
                title={item.label}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Viewer area */}
        <div className={styles.main ?? ""}>
          {loading && <p className={styles.loadingMsg ?? ""}>Loading book…</p>}
          {error && <p className={styles.errorMsg ?? ""}>{error}</p>}
          <div
            ref={viewerRef}
            className={styles.epubContainer ?? ""}
            style={{ display: loading || error ? "none" : "block" }}
          />
        </div>
      </div>
    </dialog>
  );
}
