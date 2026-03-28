import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../apiFetch.js";
import styles from "./PdfViewer.module.css";

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

interface Props {
  mediaId: string;
  title: string;
  onClose: () => void;
}

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];
const DEFAULT_ZOOM_IDX = 2; // 1.0
const THUMBNAIL_SCALE = 0.15;

export default function PdfViewer({ mediaId, title, onClose }: Props) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const mainRenderTaskRef = useRef<RenderTask | null>(null);
  const thumbCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const thumbRenderTasksRef = useRef<(RenderTask | null)[]>([]);

  const zoom = ZOOM_LEVELS[zoomIdx] ?? 1.0;

  // Load PDF document
  useEffect(() => {
    setLoading(true);
    setError(null);
    let cancelled = false;

    const loadDoc = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(`/api/v1/media/${mediaId}/stream`);
        const doc = await loadingTask.promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Failed to load PDF document.");
          setLoading(false);
        }
      }
    };

    loadDoc();
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  // Render main page
  const renderPage = useCallback(async (doc: PDFDocumentProxy, pageNum: number, scale: number) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    // Cancel any in-flight render
    if (mainRenderTaskRef.current) {
      mainRenderTaskRef.current.cancel();
      mainRenderTaskRef.current = null;
    }

    let page: PDFPageProxy;
    try {
      page = await doc.getPage(pageNum);
    } catch {
      return;
    }

    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const task = page.render({ canvas, canvasContext: ctx, viewport });
    mainRenderTaskRef.current = task;

    try {
      await task.promise;
    } catch {
      // render cancelled or failed — ignore
    } finally {
      page.cleanup();
    }
  }, []);

  useEffect(() => {
    if (!pdfDoc) return;
    renderPage(pdfDoc, currentPage, zoom);
  }, [pdfDoc, currentPage, zoom, renderPage]);

  // Save reading progress on page change
  useEffect(() => {
    if (!pdfDoc || numPages === 0) return;
    const completed = currentPage >= numPages;
    apiFetch(`/api/v1/media/${mediaId}/progress`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: currentPage, duration: numPages, completed }),
    }).catch(() => {
      // best-effort save
    });
  }, [mediaId, currentPage, numPages, pdfDoc]);

  // Render thumbnail for a given page index
  const renderThumbnail = useCallback(async (doc: PDFDocumentProxy, pageNum: number) => {
    const canvas = thumbCanvasRefs.current[pageNum - 1];
    if (!canvas) return;

    // Cancel any in-flight render for this thumb
    const prev = thumbRenderTasksRef.current[pageNum - 1];
    if (prev) {
      prev.cancel();
      thumbRenderTasksRef.current[pageNum - 1] = null;
    }

    let page: PDFPageProxy;
    try {
      page = await doc.getPage(pageNum);
    } catch {
      return;
    }

    const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const task = page.render({ canvas, canvasContext: ctx, viewport });
    thumbRenderTasksRef.current[pageNum - 1] = task;

    try {
      await task.promise;
    } catch {
      // cancelled or failed
    } finally {
      page.cleanup();
    }
  }, []);

  // Render all thumbnails when doc loads
  useEffect(() => {
    if (!pdfDoc) return;
    thumbRenderTasksRef.current = new Array(numPages).fill(null);
    for (let i = 1; i <= numPages; i++) {
      renderThumbnail(pdfDoc, i);
    }
  }, [pdfDoc, numPages, renderThumbnail]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        setCurrentPage((p) => Math.min(p + 1, numPages));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        setCurrentPage((p) => Math.max(p - 1, 1));
      } else if (e.key === "+" || e.key === "=") {
        setZoomIdx((z) => Math.min(z + 1, ZOOM_LEVELS.length - 1));
      } else if (e.key === "-") {
        setZoomIdx((z) => Math.max(z - 1, 0));
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, numPages]);

  // Scroll active thumbnail into view
  useEffect(() => {
    const el = thumbCanvasRefs.current[currentPage - 1];
    el?.parentElement?.scrollIntoView({ block: "nearest" });
  }, [currentPage]);

  return (
    <dialog open className={styles.overlay ?? ""} aria-label={`PDF Viewer: ${title}`}>
      {/* Toolbar */}
      <div className={styles.toolbar ?? ""}>
        <button
          type="button"
          className={styles.closeBtn ?? ""}
          onClick={onClose}
          title="Close (Esc)"
        >
          ✕
        </button>
        <span className={styles.toolbarTitle ?? ""}>{title}</span>
        <div className={styles.toolbarControls ?? ""}>
          <button
            type="button"
            className={styles.navBtn ?? ""}
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage <= 1}
            title="Previous page (←)"
          >
            ‹
          </button>
          <span className={styles.pageCounter ?? ""}>
            {loading ? "…" : `${currentPage} / ${numPages}`}
          </span>
          <button
            type="button"
            className={styles.navBtn ?? ""}
            onClick={() => setCurrentPage((p) => Math.min(p + 1, numPages))}
            disabled={currentPage >= numPages}
            title="Next page (→)"
          >
            ›
          </button>
          <button
            type="button"
            className={styles.zoomBtn ?? ""}
            onClick={() => setZoomIdx((z) => Math.max(z - 1, 0))}
            disabled={zoomIdx === 0}
            title="Zoom out (-)"
          >
            −
          </button>
          <span className={styles.zoomLevel ?? ""}>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className={styles.zoomBtn ?? ""}
            onClick={() => setZoomIdx((z) => Math.min(z + 1, ZOOM_LEVELS.length - 1))}
            disabled={zoomIdx === ZOOM_LEVELS.length - 1}
            title="Zoom in (+)"
          >
            +
          </button>
          <button
            type="button"
            className={styles.zoomBtn ?? ""}
            onClick={() => setZoomIdx(DEFAULT_ZOOM_IDX)}
            title="Reset zoom"
          >
            ↺
          </button>
        </div>
      </div>

      <div className={styles.body ?? ""}>
        {/* Thumbnail sidebar */}
        <div className={styles.sidebar ?? ""}>
          {!loading &&
            Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                className={`${styles.thumbWrapper ?? ""} ${pageNum === currentPage ? (styles.thumbActive ?? "") : ""}`}
                onClick={() => setCurrentPage(pageNum)}
                title={`Page ${pageNum}`}
              >
                <canvas
                  ref={(el) => {
                    thumbCanvasRefs.current[pageNum - 1] = el;
                  }}
                  className={styles.thumbCanvas ?? ""}
                />
                <span className={styles.thumbLabel ?? ""}>{pageNum}</span>
              </button>
            ))}
        </div>

        {/* Main content area */}
        <div className={styles.main ?? ""}>
          {loading && <p className={styles.loadingMsg ?? ""}>Loading PDF…</p>}
          {error && <p className={styles.errorMsg ?? ""}>{error}</p>}
          {!loading && !error && (
            <div className={styles.canvasWrapper ?? ""}>
              <canvas ref={mainCanvasRef} className={styles.mainCanvas ?? ""} />
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
