"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import PlayTTS from "../components/PlayTTS";
import ModelSelector, { ModelSelectorButton, PROVIDERS } from "../components/ModelSelector";

// Drawing stroke type
type DrawingStroke = {
  points: { x: number; y: number }[];
  color: string;
  width: number;
};

// Image Viewer Modal Component with Drawing Support
function ImageViewer({
  src,
  alt,
  onClose,
  onAnnotatedImage,
}: {
  src: string;
  alt: string;
  onClose: () => void;
  onAnnotatedImage?: (dataUrl: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<DrawingStroke | null>(null);
  const [brushColor, setBrushColor] = useState("#ef4444"); // Red default
  const [brushWidth, setBrushWidth] = useState(4);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const BRUSH_COLORS = [
    "#ef4444", // Red
    "#f97316", // Orange
    "#eab308", // Yellow
    "#22c55e", // Green
    "#3b82f6", // Blue
    "#8b5cf6", // Purple
    "#ec4899", // Pink
    "#ffffff", // White
    "#000000", // Black
  ];

  // Load image and get dimensions
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      setImageLoaded(true);
    };
    img.src = src;
  }, [src]);

  // Reset position when zoom changes
  useEffect(() => {
    if (zoom === 1) {
      setPosition({ x: 0, y: 0 });
    }
  }, [zoom]);

  // Draw strokes on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageLoaded) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all strokes
    const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;
    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  }, [strokes, currentStroke, imageLoaded]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isDrawingMode) {
          setIsDrawingMode(false);
        } else {
          onClose();
        }
      } else if (e.key === "+" || e.key === "=") {
        if (!isDrawingMode) setZoom((z) => Math.min(z + 0.25, 5));
      } else if (e.key === "-") {
        if (!isDrawingMode) setZoom((z) => Math.max(z - 0.25, 0.25));
      } else if (e.key === "0") {
        if (!isDrawingMode) {
          setZoom(1);
          setPosition({ x: 0, y: 0 });
        }
      } else if (e.key === "d" || e.key === "D") {
        setIsDrawingMode((m) => !m);
      } else if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setStrokes((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isDrawingMode]);

  // Get canvas coordinates from mouse event
  const getCanvasCoords = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  // Handle mouse wheel zoom (only when not drawing)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (isDrawingMode) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.min(Math.max(z + delta, 0.25), 5));
  }, [isDrawingMode]);

  // Handle mouse down
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isDrawingMode) {
      const coords = getCanvasCoords(e);
      if (coords) {
        setIsDrawing(true);
        setCurrentStroke({
          points: [coords],
          color: brushColor,
          width: brushWidth,
        });
      }
    } else if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [isDrawingMode, zoom, position, getCanvasCoords, brushColor, brushWidth]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDrawingMode && isDrawing) {
      const coords = getCanvasCoords(e);
      if (coords && currentStroke) {
        setCurrentStroke({
          ...currentStroke,
          points: [...currentStroke.points, coords],
        });
      }
    } else if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDrawingMode, isDrawing, isDragging, dragStart, getCanvasCoords, currentStroke]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (isDrawing && currentStroke && currentStroke.points.length > 1) {
      setStrokes((prev) => [...prev, currentStroke]);
    }
    setIsDrawing(false);
    setCurrentStroke(null);
    setIsDragging(false);
  }, [isDrawing, currentStroke]);

  // Download image
  const handleDownload = useCallback(async () => {
    try {
      // For data URLs, create a link directly
      if (src.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = src;
        const extension = src.includes("image/png") ? "png" : src.includes("image/gif") ? "gif" : "jpg";
        link.download = `image-${Date.now()}.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // For URLs, fetch and download
        const response = await fetch(src);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const extension = blob.type.includes("png") ? "png" : blob.type.includes("gif") ? "gif" : "jpg";
        link.download = `image-${Date.now()}.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Failed to download image:", error);
    }
  }, [src]);

  // Copy image to clipboard
  const handleCopy = useCallback(async () => {
    setCopyStatus("copying");
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = src;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");
      ctx.drawImage(img, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error("Failed to create blob"));
        }, "image/png");
      });

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);

      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch (error) {
      console.error("Failed to copy image:", error);
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 2000);
    }
  }, [src]);

  // Export annotated image
  const handleExportAnnotated = useCallback(async () => {
    if (!onAnnotatedImage || strokes.length === 0) return;

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = src;
      });

      // Create canvas with image
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");
      
      // Draw original image
      ctx.drawImage(img, 0, 0);
      
      // Draw all strokes
      for (const stroke of strokes) {
        if (stroke.points.length < 2) continue;
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }

      // Export as data URL
      const dataUrl = canvas.toDataURL("image/png");
      onAnnotatedImage(dataUrl);
      onClose();
    } catch (error) {
      console.error("Failed to export annotated image:", error);
    }
  }, [src, strokes, onAnnotatedImage, onClose]);

  // Clear all drawings
  const handleClearDrawings = useCallback(() => {
    setStrokes([]);
    setCurrentStroke(null);
  }, []);

  // Undo last stroke
  const handleUndo = useCallback(() => {
    setStrokes((prev) => prev.slice(0, -1));
  }, []);

  // Calculate display dimensions
  const displayDimensions = useMemo(() => {
    if (!imageLoaded) return { width: 0, height: 0 };
    const maxWidth = window.innerWidth * 0.9;
    const maxHeight = window.innerHeight * 0.85;
    const scale = Math.min(maxWidth / imageDimensions.width, maxHeight / imageDimensions.height, 1);
    return {
      width: imageDimensions.width * scale,
      height: imageDimensions.height * scale,
    };
  }, [imageLoaded, imageDimensions]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDrawingMode) onClose();
      }}
      style={{ animation: "fade-in 0.15s ease-out" }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors z-20"
        aria-label="Close"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Main Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--color-surface-elevated)]/90 border border-[var(--color-border)] backdrop-blur-sm z-20">
        {/* Drawing mode toggle */}
        <button
          onClick={() => setIsDrawingMode(!isDrawingMode)}
          className={`p-1.5 rounded-lg transition-colors ${
            isDrawingMode
              ? "bg-[var(--color-brand)] text-white"
              : "hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          }`}
          title="Toggle drawing mode (D)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            <path d="M2 2l7.586 7.586" />
            <circle cx="11" cy="11" r="2" />
          </svg>
        </button>

        <div className="w-px h-5 bg-[var(--color-border)]" />

        {!isDrawingMode && (
          <>
            {/* Zoom out */}
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
              className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
              title="Zoom out (-)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>

            {/* Zoom indicator */}
            <span className="text-sm text-[var(--color-text)] font-medium min-w-[4rem] text-center">
              {Math.round(zoom * 100)}%
            </span>

            {/* Zoom in */}
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.25, 5))}
              className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
              title="Zoom in (+)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>

            {/* Reset zoom */}
            <button
              onClick={() => {
                setZoom(1);
                setPosition({ x: 0, y: 0 });
              }}
              className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
              title="Reset zoom (0)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>

            <div className="w-px h-5 bg-[var(--color-border)]" />
          </>
        )}

        {isDrawingMode && (
          <>
            {/* Color picker */}
            <div className="relative">
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors"
                title="Brush color"
              >
                <div
                  className="w-5 h-5 rounded-full border-2 border-white/50"
                  style={{ backgroundColor: brushColor }}
                />
              </button>
              {showColorPicker && (
                <div className="absolute top-full left-0 mt-2 p-2 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)] shadow-lg grid grid-cols-3 gap-1">
                  {BRUSH_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => {
                        setBrushColor(color);
                        setShowColorPicker(false);
                      }}
                      className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                        brushColor === color ? "border-white" : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Brush size */}
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="2"
                max="20"
                value={brushWidth}
                onChange={(e) => setBrushWidth(parseInt(e.target.value))}
                className="w-20"
                style={{ accentColor: brushColor }}
              />
              <span className="text-xs text-[var(--color-text-muted)] w-6">{brushWidth}px</span>
            </div>

            <div className="w-px h-5 bg-[var(--color-border)]" />

            {/* Undo */}
            <button
              onClick={handleUndo}
              disabled={strokes.length === 0}
              className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
              title="Undo (Ctrl+Z)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
              </svg>
            </button>

            {/* Clear */}
            <button
              onClick={handleClearDrawings}
              disabled={strokes.length === 0}
              className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
              title="Clear all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
              </svg>
            </button>

            <div className="w-px h-5 bg-[var(--color-border)]" />
          </>
        )}

        {/* Download */}
        <button
          onClick={handleDownload}
          className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
          title="Download image"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>

        {/* Copy to clipboard */}
        <button
          onClick={handleCopy}
          disabled={copyStatus === "copying"}
          className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
          title="Copy to clipboard"
        >
          {copyStatus === "copied" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : copyStatus === "error" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>

        {/* Send annotated image to chat */}
        {onAnnotatedImage && strokes.length > 0 && (
          <>
            <div className="w-px h-5 bg-[var(--color-border)]" />
            <button
              onClick={handleExportAnnotated}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[var(--color-brand)] text-white text-sm font-medium hover:brightness-110 transition-all"
              title="Send annotated image to chat"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Ask about this
            </button>
          </>
        )}
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{
          width: displayDimensions.width,
          height: displayDimensions.height,
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          className="absolute inset-0 w-full h-full object-contain rounded-lg select-none"
          style={{
            transform: isDrawingMode ? "none" : `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
            transition: isDragging ? "none" : "transform 0.1s ease-out",
            cursor: isDrawingMode ? "crosshair" : (zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default"),
          }}
          draggable={false}
        />

        {/* Drawing canvas overlay */}
        {imageLoaded && (
          <canvas
            ref={canvasRef}
            width={imageDimensions.width}
            height={imageDimensions.height}
            className="absolute inset-0 w-full h-full rounded-lg"
            style={{
              pointerEvents: isDrawingMode ? "auto" : "none",
              cursor: isDrawingMode ? "crosshair" : "default",
              transform: isDrawingMode ? "none" : `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
              transition: isDragging ? "none" : "transform 0.1s ease-out",
            }}
          />
        )}
      </div>

      {/* Drawing mode indicator */}
      {isDrawingMode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-[var(--color-brand)]/90 text-white text-sm font-medium backdrop-blur-sm">
          Drawing mode • Press D or Esc to exit
        </div>
      )}

      {/* Alt text / caption (only when not drawing) */}
      {!isDrawingMode && alt && alt !== "Generated image" && alt !== "Attached image" && !alt.startsWith("Attached image") && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-[var(--color-surface-elevated)]/90 border border-[var(--color-border)] backdrop-blur-sm max-w-[80vw]">
          <p className="text-sm text-[var(--color-text-secondary)] text-center truncate">{alt}</p>
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      {!isDrawingMode && (
        <div className="absolute bottom-4 right-4 text-xs text-white/50">
          <span className="hidden sm:inline">D to draw • Scroll to zoom • Esc to close</span>
        </div>
      )}
    </div>
  );
}

type ImageContentPart = {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
};
type TextContentPart = { type: "text"; text: string };
type ContentPart = TextContentPart | ImageContentPart;

type AttachedImage = {
  id: string;
  dataUrl: string;
  name: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[]; // Array of image data URLs for display
  speechContent?: string | null;
  createdAt: number;
  optimistic?: boolean;
};

type DebugLogEntry = {
  timestamp: string;
  scope: string;
  detail: string;
};

function normalizeDebugLog(raw: unknown): DebugLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as { timestamp?: unknown }).timestamp === "string" &&
        typeof (entry as { scope?: unknown }).scope === "string" &&
        typeof (entry as { detail?: unknown }).detail === "string"
      ) {
        return {
          timestamp: (entry as { timestamp: string }).timestamp,
          scope: (entry as { scope: string }).scope,
          detail: (entry as { detail: string }).detail,
        };
      }
      return null;
    })
    .filter((entry): entry is DebugLogEntry => Boolean(entry));
}

function parseChatApiResponse(payload: unknown): {
  content: string | null;
  speechContent: string | null;
  error: string | null;
  debugLog: DebugLogEntry[];
} {
  if (typeof payload !== "object" || payload === null) {
    return { content: null, speechContent: null, error: null, debugLog: [] };
  }
  const rawContent = "content" in payload ? (payload as { content?: unknown }).content : undefined;
  const rawSpeechContent = "speechContent" in payload ? (payload as { speechContent?: unknown }).speechContent : undefined;
  const rawError = "error" in payload ? (payload as { error?: unknown }).error : undefined;
  const rawDebug = "debugLog" in payload ? (payload as { debugLog?: unknown }).debugLog : undefined;
  return {
    content: typeof rawContent === "string" ? rawContent : null,
    speechContent: typeof rawSpeechContent === "string" ? rawSpeechContent : null,
    error: typeof rawError === "string" ? rawError : null,
    debugLog: normalizeDebugLog(rawDebug),
  };
}

function parseTranscriptionResponse(payload: unknown): { text: string | null; error: string | null } {
  if (typeof payload !== "object" || payload === null) {
    return { text: null, error: null };
  }
  const rawText = "text" in payload ? (payload as { text?: unknown }).text : undefined;
  const rawError = "error" in payload ? (payload as { error?: unknown }).error : undefined;
  return {
    text: typeof rawText === "string" ? rawText : null,
    error: typeof rawError === "string" ? rawError : null,
  };
}

const DEBUG_STORAGE_KEY = "bm_debug_mode";
const DEBUG_EVENT_NAME = "bm_debug_mode_changed";

// Maximum file size for images (10MB original, will be compressed)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
// Supported image types
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
// Target max dimension for compressed images (reduced to ensure smaller payloads)
const MAX_IMAGE_DIMENSION = 768;
// Target quality for JPEG compression (reduced for smaller size)
const IMAGE_QUALITY = 0.7;
// Maximum base64 size after compression (~500KB)
const MAX_COMPRESSED_SIZE = 500 * 1024;

// Models that support vision (image inputs) - derived from PROVIDERS
const VISION_CAPABLE_MODELS = new Set(
  PROVIDERS.flatMap((p) => p.models.filter((m) => m.supportsVision).map((m) => m.id))
);

// Compress/resize image to reduce payload size
function compressImage(dataUrl: string, maxDimension: number = MAX_IMAGE_DIMENSION, quality: number = IMAGE_QUALITY): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      
      // Calculate new dimensions maintaining aspect ratio
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      
      // Create canvas and draw resized image
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to JPEG for better compression (unless it's a GIF which might be animated)
      const mimeType = dataUrl.startsWith("data:image/gif") ? "image/png" : "image/jpeg";
      let compressed = canvas.toDataURL(mimeType, quality);
      
      // If still too large, reduce quality further
      let currentQuality = quality;
      while (compressed.length > MAX_COMPRESSED_SIZE && currentQuality > 0.3) {
        currentQuality -= 0.1;
        compressed = canvas.toDataURL(mimeType, currentQuality);
      }
      
      // If still too large after quality reduction, reduce dimensions
      if (compressed.length > MAX_COMPRESSED_SIZE) {
        const scaleFactor = Math.sqrt(MAX_COMPRESSED_SIZE / compressed.length);
        const newWidth = Math.round(width * scaleFactor);
        const newHeight = Math.round(height * scaleFactor);
        
        const smallerCanvas = document.createElement("canvas");
        smallerCanvas.width = newWidth;
        smallerCanvas.height = newHeight;
        const smallerCtx = smallerCanvas.getContext("2d");
        if (smallerCtx) {
          smallerCtx.drawImage(canvas, 0, 0, newWidth, newHeight);
          compressed = smallerCanvas.toDataURL(mimeType, 0.6);
        }
      }
      
      console.log(`[Image Compression] Original: ${(dataUrl.length / 1024).toFixed(1)}KB, Compressed: ${(compressed.length / 1024).toFixed(1)}KB`);
      resolve(compressed);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

export default function ChatWorkspace({ threadId }: { threadId: string | null }) {
  const [modelId, setModelId] = useState<string>("gemini-2.5-flash-lite");
  const [imageModelId, setImageModelId] = useState<string>("google/gemini-2.5-flash-image");
  const [inputValue, setInputValue] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [speakEnabled, setSpeakEnabled] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [autoSendTranscription, setAutoSendTranscription] = useState<boolean>(true);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showChatModelSelector, setShowChatModelSelector] = useState(false);
  const [showImageModelSelector, setShowImageModelSelector] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const debugLogsRef = useRef<Map<string, DebugLogEntry[]>>(new Map());
  const [debugLogVersion, setDebugLogVersion] = useState<number>(0);
  const hydratedThreadsRef = useRef<Set<string>>(new Set());

  const clampPlaybackRate = useCallback((rate: number) => {
    if (!Number.isFinite(rate)) return 1;
    return Math.min(1.5, Math.max(0.75, rate));
  }, []);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const messageCacheRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const stopTTSRef = useRef<(() => void) | null>(null);

  const appendDebugLogs = useCallback(
    (targetThreadId: string, entries: DebugLogEntry[]) => {
      if (!targetThreadId || entries.length === 0) return;
      const existing = debugLogsRef.current.get(targetThreadId) ?? [];
      debugLogsRef.current.set(targetThreadId, [...existing, ...entries]);
      setDebugLogVersion((v) => v + 1);
    },
    []
  );

  const addLocalDebugEntry = useCallback(
    (scope: string, detail: string, conversationOverride?: string) => {
      const targetId = conversationOverride ?? threadId;
      if (!debugMode || !targetId) return;
      appendDebugLogs(targetId, [{ timestamp: new Date().toISOString(), scope, detail }]);
    },
    [appendDebugLogs, debugMode, threadId]
  );

  const currentLogCount = useMemo(() => {
    if (!threadId) return 0;
    return debugLogsRef.current.get(threadId)?.length ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, debugLogVersion]);

  // Check if current model supports vision (image inputs)
  const modelSupportsVision = useMemo(() => {
    return VISION_CAPABLE_MODELS.has(modelId);
  }, [modelId]);

  // Check if send button should be disabled due to unsupported images
  const imagesBlockSend = useMemo(() => {
    return attachedImages.length > 0 && !modelSupportsVision;
  }, [attachedImages.length, modelSupportsVision]);

  const handleDownloadLogs = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!threadId) {
      alert("Select a conversation to download logs.");
      return;
    }
    const logs = debugLogsRef.current.get(threadId);
    if (!logs || logs.length === 0) {
      alert("No logs available for this conversation yet.");
      return;
    }
    const lines = logs.map((entry) => {
      const ts = new Date(entry.timestamp).toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZoneName: 'short'
      });
      return `[${ts}] [${entry.scope}] ${entry.detail}`;
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mentorai-chat-log-${threadId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [threadId]);

  // Sync debug mode preference from Settings/localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const readPreference = () => {
      try {
        const stored = localStorage.getItem(DEBUG_STORAGE_KEY);
        setDebugMode(stored === "true");
      } catch {
        setDebugMode(false);
      }
    };
    readPreference();
    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled: boolean }>).detail;
      if (typeof detail?.enabled === "boolean") {
        setDebugMode(detail.enabled);
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === DEBUG_STORAGE_KEY) {
        readPreference();
      }
    };
    window.addEventListener(DEBUG_EVENT_NAME, handleCustom);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(DEBUG_EVENT_NAME, handleCustom);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Hydrate existing messages into the debug log once per thread when debug mode is enabled
  // Logs are isolated per chat via the threadId key in the Map
  useEffect(() => {
    if (!debugMode || !threadId) return;
    if (hydratedThreadsRef.current.has(threadId)) return;
    if (messages.length === 0) return;
    
    // Add a log entry indicating the chat was opened
    appendDebugLogs(threadId, [{
      timestamp: new Date().toISOString(),
      scope: "session",
      detail: `Opened conversation: ${threadId}`,
    }]);
    
    const entries: DebugLogEntry[] = messages.map((m) => ({
      timestamp: new Date(m.createdAt).toISOString(),
      scope: m.role === "user" ? "user_message" : "assistant_message",
      detail: m.content,
    }));
    appendDebugLogs(threadId, entries);
    hydratedThreadsRef.current.add(threadId);
  }, [appendDebugLogs, debugMode, messages, threadId]);

  // Stop TTS when threadId changes
  useEffect(() => {
    // Call the stopTTS function from ChatPanel which handles both audio element and Web Speech API
    if (stopTTSRef.current) {
      stopTTSRef.current();
    }
    // Also clear the last spoken text so audio doesn't auto-resume
  }, [threadId]);

  const sendMessage = useCallback(async (messageText?: string) => {
    if (isLoading) return;
    const text = (messageText ?? inputValue).trim();
    const hasImages = attachedImages.length > 0;
    if (!text && !hasImages) return;
    if (!threadId) return;
    const targetThreadId = threadId;
    
    // Capture current attached images and clear them
    const imagesToSend = [...attachedImages];
    const imageUrls = imagesToSend.map(img => img.dataUrl);
    
    addLocalDebugEntry("client", `User message sent: ${text}${hasImages ? ` (with ${imagesToSend.length} images)` : ""}`, targetThreadId);
    const now = Date.now();
    const tempId = `local_${now}`;
    const userMsg: ChatMessage = { 
      id: tempId, 
      role: "user", 
      content: text || "(Image)", 
      images: imageUrls.length > 0 ? imageUrls : undefined,
      createdAt: now, 
      optimistic: true 
    };
    setMessages((prev) => {
      const next = [...prev, userMsg];
      if (threadId) messageCacheRef.current.set(threadId, next);
      return next;
    });
    setInputValue("");
    setAttachedImages([]);

    try {
      setIsLoading(true);
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: threadId, role: "user", content: text || "(Image attached)" }),
          keepalive: true,
        });
        if (res.ok) {
          const payload = (await res.json()) as
            | { message: { id: string; role: "user" | "assistant"; content: string; createdAt: string } }
            | undefined;
          const saved = payload?.message;
          if (saved) {
            const normalized: ChatMessage = {
              id: saved.id,
              role: saved.role,
              content: saved.content,
              images: imageUrls.length > 0 ? imageUrls : undefined,
              createdAt: new Date(saved.createdAt).getTime(),
            };
            setMessages((prev) => {
              const next = prev.map((msg) => (msg.id === userMsg.id ? normalized : msg));
              if (threadId) messageCacheRef.current.set(threadId, next);
              return next;
            });
          }
        }
      } catch {}

      // Build message content - use multimodal format if there are images
      let messageContent: string | ContentPart[];
      if (imagesToSend.length > 0) {
        const contentParts: ContentPart[] = [];
        // Add text first if present
        if (text) {
          contentParts.push({ type: "text", text });
        }
        // Add images
        for (const img of imagesToSend) {
          contentParts.push({
            type: "image_url",
            image_url: { url: img.dataUrl, detail: "auto" },
          });
        }
        messageContent = contentParts;
      } else {
        messageContent = text;
      }

      // Build conversation history, converting stored messages to API format
      // NOTE: We don't include images from old messages to keep payload size manageable
      // Only the current message will have images
      const historyMessages = messages.map(({ role, content, images }) => {
        // For messages with images, just include text and a note about the image
        if (images && images.length > 0) {
          const imageNote = `[${images.length} image${images.length > 1 ? 's' : ''} attached]`;
          return { role, content: content ? `${content}\n${imageNote}` : imageNote };
        }
        return { role, content };
      });

      const requestBody = JSON.stringify({
        modelId,
        imageModelId,
        messages: [
          ...historyMessages,
          { role: "user", content: messageContent },
        ],
        conversationId: threadId,
        debug: debugMode,
      });
      
      // Log payload size for debugging
      const payloadSizeKB = (requestBody.length / 1024).toFixed(1);
      console.log(`[Chat Request] Payload size: ${payloadSizeKB}KB`);
      addLocalDebugEntry("client", `Sending request (${payloadSizeKB}KB payload)`, targetThreadId);
      
      // Don't use keepalive for large payloads (it has a 64KB limit in some browsers)
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
        // keepalive removed - it limits body size to 64KB
      });
      
      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`Server error (${resp.status}): ${errorText.slice(0, 200)}`);
      }
      
      const payload: unknown = await resp.json();
      const { content: assistantContent, error: assistantError, debugLog } = parseChatApiResponse(payload);
      if (targetThreadId && debugLog.length > 0) {
        appendDebugLogs(targetThreadId, debugLog);
      }
      const content = assistantContent ?? assistantError ?? "(no response)";
      if (assistantError) {
        addLocalDebugEntry("server_error", assistantError, targetThreadId);
        const aiMsg: ChatMessage = {
          id: `a_${Date.now()}`,
          role: "assistant",
          content,
          createdAt: Date.now(),
        };
        setMessages((prev) => {
          const next = [...prev, aiMsg];
          if (threadId) messageCacheRef.current.set(threadId, next);
          return next;
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addLocalDebugEntry("client_error", message, targetThreadId);
      const aiMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: `Error: ${message}`,
        createdAt: Date.now(),
      };
      setMessages((prev) => {
        const next = [...prev, aiMsg];
        if (threadId) messageCacheRef.current.set(threadId, next);
        return next;
      });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, inputValue, threadId, addLocalDebugEntry, modelId, imageModelId, messages, debugMode, appendDebugLogs, attachedImages]);

  const sendForTranscription = useCallback(async (audioBlob: Blob) => {
    try {
      const form = new FormData();
      form.append("file", audioBlob, "clip.webm");

      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const payload: unknown = await res.json();
      const { text, error } = parseTranscriptionResponse(payload);

      if (!res.ok) throw new Error(error || "Transcription failed");

      const transcript = (text || "").trim();
      if (!transcript) {
        return alert("No speech detected.");
      }

      if (autoSendTranscription) {
        await sendMessage(transcript);
      } else {
        setInputValue(transcript);
      }
    } catch (e) {
      console.error(e);
      alert("Transcription error. See console.");
    }
  }, [autoSendTranscription, sendMessage]);

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    
    if (stopTTSRef.current) {
      stopTTSRef.current();
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await sendForTranscription(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      alert("Microphone permission denied or unavailable.");
    }
  }, [isRecording, sendForTranscription]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;
    try {
      mediaRecorderRef.current?.stop();
    } finally {
      setIsRecording(false);
    }
  }, [isRecording]);

  // Handle image file selection
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      // Validate file type
      if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        alert(`Unsupported file type: ${file.type}. Please use JPEG, PNG, GIF, or WebP.`);
        return;
      }

      // Validate file size
      if (file.size > MAX_IMAGE_SIZE) {
        alert(`File too large: ${file.name}. Maximum size is 10MB.`);
        return;
      }

      // Read file and convert to base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          try {
            // Compress the image to reduce payload size
            const compressed = await compressImage(dataUrl);
            setAttachedImages((prev) => [
              ...prev,
              {
                id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                dataUrl: compressed,
                name: file.name,
              },
            ]);
          } catch (err) {
            console.error("Failed to compress image:", err);
            // Fall back to original if compression fails
            setAttachedImages((prev) => [
              ...prev,
              {
                id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                dataUrl,
                name: file.name,
              },
            ]);
          }
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // Remove an attached image
  const removeAttachedImage = useCallback((id: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  // Handle paste event for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        if (file.size > MAX_IMAGE_SIZE) {
          alert("Pasted image is too large. Maximum size is 10MB.");
          continue;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
          const dataUrl = event.target?.result as string;
          if (dataUrl) {
            try {
              const compressed = await compressImage(dataUrl);
              setAttachedImages((prev) => [
                ...prev,
                {
                  id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                  dataUrl: compressed,
                  name: "Pasted image",
                },
              ]);
            } catch {
              setAttachedImages((prev) => [
                ...prev,
                {
                  id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                  dataUrl,
                  name: "Pasted image",
                },
              ]);
            }
          }
        };
        reader.readAsDataURL(file);
      }
    }
  }, []);

  // Handle drag events for image drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the drop zone entirely
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      // Only accept images
      if (!file.type.startsWith("image/")) {
        return;
      }

      // Validate file type
      if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        alert(`Unsupported file type: ${file.type}. Please use JPEG, PNG, GIF, or WebP.`);
        return;
      }

      // Validate file size
      if (file.size > MAX_IMAGE_SIZE) {
        alert(`File too large: ${file.name}. Maximum size is 10MB.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          try {
            const compressed = await compressImage(dataUrl);
            setAttachedImages((prev) => [
              ...prev,
              {
                id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                dataUrl: compressed,
                name: file.name,
              },
            ]);
          } catch {
            setAttachedImages((prev) => [
              ...prev,
              {
                id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                dataUrl,
                name: file.name,
              },
            ]);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage();
  };

  // Load messages for selected thread from server
  useEffect(() => {
    let cancelled = false;
    setInputValue("");
    setIsLoading(false);
    if (!threadId) {
      setMessages([]);
      return () => {};
    }
    const cached = messageCacheRef.current.get(threadId);
    if (cached) {
      setMessages(cached);
    } else {
      setMessages([]);
    }

    const load = async () => {
      if (!threadId) return;
      try {
        const res = await fetch(`/api/messages?conversationId=${encodeURIComponent(threadId)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { messages: Array<{ id: string; role: "user" | "assistant"; content: string; speechContent?: string | null; createdAt: string }> };
        if (cancelled) return;
        const normalized = (data.messages || []).map((m) => ({ ...m, createdAt: new Date(m.createdAt).getTime() } as ChatMessage));
        setMessages((prev) => {
          // Build a map of previous messages that have images (to preserve them)
          const prevImagesMap = new Map<string, string[]>();
          prev.forEach((m) => {
            if (m.images && m.images.length > 0) {
              prevImagesMap.set(m.id, m.images);
              // Also map by content for messages that got new IDs from server
              prevImagesMap.set(`content:${m.content}:${m.createdAt}`, m.images);
            }
          });
          
          // Merge images from previous state into normalized messages
          const normalizedWithImages = normalized.map((m) => {
            const directImages = prevImagesMap.get(m.id);
            const contentImages = prevImagesMap.get(`content:${m.content}:${m.createdAt}`);
            const images = directImages || contentImages;
            return images ? { ...m, images } : m;
          });
          
          const pendingLocals = prev.filter((m) => m.optimistic && m.id.startsWith("local_"));
          if (pendingLocals.length === 0) {
            messageCacheRef.current.set(threadId, normalizedWithImages);
            return normalizedWithImages;
          }
          const merged = [...normalizedWithImages, ...pendingLocals].sort((a, b) => a.createdAt - b.createdAt);
          messageCacheRef.current.set(threadId, merged);
          return merged;
        });
      } catch {
        // ignore
      }
    };

    load();
    const id = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [threadId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Load persisted settings
  useEffect(() => {
    try {
      const rawSpeak = localStorage.getItem("bm_speak_enabled");
      if (rawSpeak != null) setSpeakEnabled(rawSpeak === "true");
      const rawRate = localStorage.getItem("bm_playback_rate");
      if (rawRate != null) {
        const parsed = clampPlaybackRate(parseFloat(rawRate));
        setPlaybackRate(parsed);
      }
      const rawAutoSend = localStorage.getItem("bm_auto_send_transcription");
      if (rawAutoSend != null) setAutoSendTranscription(rawAutoSend === "true");
    } catch {
      // ignore
    }
  }, [clampPlaybackRate]);

  useEffect(() => {
    try {
      localStorage.setItem("bm_speak_enabled", String(speakEnabled));
    } catch {
      // ignore
    }
  }, [speakEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem("bm_playback_rate", String(playbackRate));
    } catch {
      // ignore
    }
  }, [playbackRate]);

  useEffect(() => {
    try {
      localStorage.setItem("bm_auto_send_transcription", String(autoSendTranscription));
    } catch {
      // ignore
    }
  }, [autoSendTranscription]);

  return (
    <div className="flex flex-col h-full">
      {/* Chat Messages */}
      <div className="flex-1 overflow-hidden">
        <ChatPanel 
          messages={messages} 
          isLoading={isLoading} 
          enableAudio={speakEnabled} 
          playbackRate={playbackRate}
          onStopTTSRef={stopTTSRef}
          onAnnotatedImage={(dataUrl) => {
            // Add annotated image to attached images
            setAttachedImages((prev) => [
              ...prev,
              {
                id: `annotated_${Date.now()}`,
                dataUrl,
                name: "Annotated image",
              },
            ]);
          }}
        />
      </div>

      {/* Input Area */}
      <div 
        ref={dropZoneRef}
        className={`flex-shrink-0 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface)]/80 backdrop-blur-sm transition-colors ${
          isDragging ? "bg-[var(--color-brand)]/10 border-[var(--color-brand)]" : ""
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="px-4 md:px-8 lg:px-12 py-4 relative">
          {/* Drop overlay */}
          {isDragging && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-brand)]/10 border-2 border-dashed border-[var(--color-brand)] rounded-xl m-2 z-10 pointer-events-none">
              <div className="flex flex-col items-center gap-2 text-[var(--color-brand)]">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span className="font-medium">Drop images here</span>
              </div>
            </div>
          )}
          {/* Settings toggle row */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
              Chat settings
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
                className={`transition-transform ${showSettings ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            
            <div className="flex items-center gap-4">
              {/* Audio toggle */}
              <button
                onClick={() => setSpeakEnabled(!speakEnabled)}
                className="flex items-center gap-1.5 text-xs transition-colors"
                style={{ color: speakEnabled ? 'var(--color-brand)' : 'var(--color-text-muted)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  {speakEnabled && (
                    <>
                      <path d="M19.07 4.93a10 10 0 010 14.14" />
                      <path d="M15.54 8.46a5 5 0 010 7.07" />
                    </>
                  )}
                </svg>
                Audio {speakEnabled ? "on" : "off"}
              </button>
            </div>
          </div>

          {/* Collapsible settings panel */}
          {showSettings && (
            <div className="mb-4 p-4 rounded-xl bg-[var(--color-surface-elevated)]/60 border border-[var(--color-border)] space-y-4 overflow-hidden" style={{ animation: "slide-down-expand 0.25s cubic-bezier(0.16, 1, 0.3, 1)" }}>
              {/* Model selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Chat Model</label>
                  <ModelSelectorButton
                    modelId={modelId}
                    onClick={() => setShowChatModelSelector(true)}
                    mode="chat"
                    className="w-full justify-between"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Image Model</label>
                  <ModelSelectorButton
                    modelId={imageModelId}
                    onClick={() => setShowImageModelSelector(true)}
                    mode="image"
                    className="w-full justify-between"
                  />
                </div>
              </div>

              {/* Audio settings */}
              <div className="pt-3 border-t border-[var(--color-border)]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text-secondary)]">Playback speed</div>
                    <div className="text-xs text-[var(--color-text-muted)]">{playbackRate.toFixed(2)}x</div>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="1.5"
                    step="0.05"
                    value={playbackRate}
                    onChange={(e) => setPlaybackRate(clampPlaybackRate(parseFloat(e.target.value)))}
                    className="w-32"
                    style={{ accentColor: 'var(--color-brand)' }}
                    disabled={!speakEnabled}
                  />
                </div>
              </div>

              {/* Voice input settings */}
              <div className="pt-3 border-t border-[var(--color-border)]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text-secondary)]">Auto-send voice input</div>
                    <div className="text-xs text-[var(--color-text-muted)]">Send immediately after transcription</div>
                  </div>
                  <button
                    role="switch"
                    aria-checked={autoSendTranscription}
                    onClick={() => setAutoSendTranscription(!autoSendTranscription)}
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                    style={{ backgroundColor: autoSendTranscription ? 'var(--color-brand)' : 'var(--color-surface-hover)' }}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        autoSendTranscription ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Debug section */}
              {debugMode && (
                <div className="pt-3 border-t border-[var(--color-border)]">
                  <button
                    onClick={handleDownloadLogs}
                    disabled={!threadId || currentLogCount === 0}
                    className="w-full rounded-lg border border-dashed border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] disabled:opacity-50 hover:bg-[var(--color-surface-hover)]/50 transition-colors"
                  >
                    Download logs ({currentLogCount} entries)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Image previews */}
          {attachedImages.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachedImages.map((img) => (
                <div
                  key={img.id}
                  className="relative group rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="w-20 h-20 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachedImage(img.id)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                    aria-label="Remove image"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1 py-0.5 truncate">
                    {img.name}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />

          {/* Input form */}
          <form onSubmit={handleSubmit} className="relative">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              rows={1}
              placeholder={threadId ? "Send a message or paste an image..." : "Select a conversation to start"}
              className="w-full rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border)] px-4 py-3 pr-32 text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/50 focus:border-transparent resize-none"
              disabled={!threadId}
              style={{ minHeight: "48px", maxHeight: "200px" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 200) + "px";
              }}
            />

            {/* Action buttons */}
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              {/* Image upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!threadId}
                className="relative p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Attach image"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                {attachedImages.length > 0 && (
                  <span 
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-xs flex items-center justify-center font-medium"
                    style={{ backgroundColor: 'var(--color-brand)' }}
                  >
                    {attachedImages.length}
                  </span>
                )}
              </button>

              {/* Voice input */}
              <button
                type="button"
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                onTouchCancel={stopRecording}
                disabled={!threadId}
                className={`p-2 rounded-lg transition-colors ${
                  isRecording 
                    ? "bg-red-500 text-white animate-pulse" 
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={isRecording ? "Recording..." : "Hold to talk"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>

              {/* Send button */}
              <div className="relative group">
                <button
                  type="submit"
                  disabled={!threadId || (!inputValue.trim() && attachedImages.length === 0) || isLoading || imagesBlockSend}
                  className="p-2 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--color-brand)' }}
                  onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                  onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                >
                  {isLoading ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" className="animate-spin">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 70" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  )}
                </button>
                {imagesBlockSend && (
                  <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-64 z-50">
                    <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg px-3 py-2 shadow-lg text-xs text-[var(--color-text-secondary)]">
                      The selected model does not support image inputs. Please choose Grok, Gemini, or Claude models to send images.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </form>

          <p className="mt-2 text-xs text-center text-[var(--color-text-muted)]">
            Press Enter to send, Shift+Enter for new line • Paste or attach images
          </p>
        </div>
      </div>

      {/* Model Selector Modals */}
      <ModelSelector
        isOpen={showChatModelSelector}
        onClose={() => setShowChatModelSelector(false)}
        selectedModelId={modelId}
        onSelectModel={setModelId}
        mode="chat"
      />
      <ModelSelector
        isOpen={showImageModelSelector}
        onClose={() => setShowImageModelSelector(false)}
        selectedModelId={imageModelId}
        onSelectModel={setImageModelId}
        mode="image"
      />
    </div>
  );
}

function ChatPanel({
  messages,
  isLoading,
  enableAudio,
  playbackRate,
  onStopTTSRef,
  onAnnotatedImage,
}: {
  messages: ChatMessage[];
  isLoading: boolean;
  enableAudio: boolean;
  playbackRate: number;
  onStopTTSRef?: React.MutableRefObject<(() => void) | null>;
  onAnnotatedImage?: (dataUrl: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastSpokenRef = useRef<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const animatedMessagesRef = useRef<Set<string>>(new Set());
  const [playBlocked, setPlayBlocked] = useState<boolean>(false);
  const [isAtBottom, setIsAtBottom] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [viewerImage, setViewerImage] = useState<{ src: string; alt: string } | null>(null);

  const openImageViewer = useCallback((src: string, alt: string) => {
    setViewerImage({ src, alt });
  }, []);

  const closeImageViewer = useCallback(() => {
    setViewerImage(null);
  }, []);

  const convertMathDelimiters = useCallback((input: string) => {
    return input
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, content) => `$$${content}$$`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, content) => `$${content}$`);
  }, []);

  const latestAssistantText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") {
        return messages[i].speechContent || messages[i].content;
      }
    }
    return "";
  }, [messages]);

  const speakWithWebSpeech = useCallback((text: string, rate: number) => {
    try {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.rate = rate;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
    } catch {}
  }, []);

  const stopTTS = useCallback(() => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
      }
      setIsPlaying(false);
      lastSpokenRef.current = "";
    } catch {}
  }, []);

  useEffect(() => {
    if (onStopTTSRef) {
      onStopTTSRef.current = stopTTS;
    }
    return () => {
      if (onStopTTSRef) {
        onStopTTSRef.current = null;
      }
    };
  }, [stopTTS, onStopTTSRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (isAtBottom) {
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
      } else if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }
    
    if (messages.length === 0) {
      animatedMessagesRef.current.clear();
    }
  }, [messages, isLoading, isAtBottom]);

  useEffect(() => {
    if (!enableAudio) return;
    if (typeof window === "undefined") return;
    const text = (latestAssistantText || "").trim();
    if (!text || text === lastSpokenRef.current) return;
    let revoked = false;
    const tryPlayTts = async () => {
      try {
        const resp = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, playbackRate }),
        });
        if (!resp.ok) {
          speakWithWebSpeech(text, playbackRate);
          lastSpokenRef.current = text;
          return;
        }
        const blob = await resp.blob();
        if (revoked) return;
        const url = URL.createObjectURL(blob);
        try { audioRef.current?.pause(); } catch {}
        if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = url;
        const audio = new Audio();
        audio.src = url;
        audioRef.current = audio;
        audio.autoplay = true;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (currentUrlRef.current === url) currentUrlRef.current = null;
          setIsPlaying(false);
        };
        audio.onplay = () => setIsPlaying(true);
        audio.onpause = () => setIsPlaying(false);
        try {
          setPlayBlocked(false);
          await audio.play();
          setIsPlaying(true);
        } catch {
          setPlayBlocked(true);
          setIsPlaying(false);
        }
        audio.playbackRate = playbackRate;
        lastSpokenRef.current = text;
      } catch {
        speakWithWebSpeech(text, playbackRate);
        lastSpokenRef.current = text;
      }
    };
    tryPlayTts();
    return () => {
      revoked = true;
      setIsPlaying(false);
    };
  }, [latestAssistantText, speakWithWebSpeech, enableAudio, playbackRate]);

  useEffect(() => {
    if (!enableAudio) {
      setPlayBlocked(false);
      setIsPlaying(false);
      stopTTS();
    }
  }, [enableAudio, stopTTS]);

  useEffect(() => {
    return () => {
      stopTTS();
    };
  }, [stopTTS]);

  // Empty state
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6" style={{ backgroundColor: 'color-mix(in srgb, var(--color-brand) 20%, transparent)' }}>
          <svg className="w-8 h-8" style={{ color: 'var(--color-brand)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <h2 className="text-xl font-display font-semibold text-[var(--color-text)] mb-2">Start a conversation</h2>
        <p className="text-sm text-[var(--color-text-muted)] max-w-md">Ask me anything — math, science, coding, writing, or any topic you want to explore.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {/* Play blocked banner */}
      {playBlocked && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={() => {
              if (!audioRef.current) return;
              audioRef.current
                .play()
                .then(() => setPlayBlocked(false))
                .catch(() => {});
            }}
            className="px-4 py-2 rounded-xl text-white text-sm font-semibold shadow-lg transition-colors"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            Play response
          </button>
        </div>
      )}

      {/* Stop button */}
      {isPlaying && enableAudio && (
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={stopTTS}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
            Stop
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
        onScroll={() => {
          const el = containerRef.current;
          if (!el) return;
          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          setIsAtBottom(distanceFromBottom < 48);
        }}
      >
        <div className="px-4 md:px-8 lg:px-12 py-6 space-y-6">
          {messages.map((m) => {
            const isNewMessage = !animatedMessagesRef.current.has(m.id);
            if (isNewMessage) {
              animatedMessagesRef.current.add(m.id);
            }
            
            return (
              <div
                key={m.id}
                className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                style={isNewMessage ? { animation: "fade-in-message 0.3s ease-out" } : undefined}
              >
                {/* Avatar for assistant */}
                {m.role === "assistant" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-brand)' }}>
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                )}

                {/* Message bubble */}
                <div
                  className={`max-w-[90%] md:max-w-[85%] lg:max-w-[80%] rounded-2xl px-4 py-3 ${
                    m.role === "user"
                      ? "text-white"
                      : "bg-[var(--color-surface-elevated)]/80 text-[var(--color-text)] border border-[var(--color-border)]/50"
                  }`}
                  style={m.role === "user" ? { backgroundColor: 'var(--color-brand)' } : undefined}
                >
                  {/* Display attached images for user messages */}
                  {m.role === "user" && m.images && m.images.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {m.images.map((imgUrl, idx) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={idx}
                          src={imgUrl}
                          alt={`Attached image ${idx + 1}`}
                          className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-white/20 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => openImageViewer(imgUrl, `Attached image ${idx + 1}`)}
                        />
                      ))}
                    </div>
                  )}
                  
                  {m.role === "assistant" && m.speechContent && !enableAudio ? (
                    <>
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                          urlTransform={(value) => value}
                          components={markdownComponents(m.role, openImageViewer)}
                        >
                          {convertMathDelimiters(m.speechContent)}
                        </ReactMarkdown>
                      </div>
                      {m.content && m.content !== m.speechContent && (
                        <>
                          <hr className="my-3 border-[var(--color-border)]" />
                          <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                              urlTransform={(value) => value}
                              components={markdownComponents(m.role, openImageViewer)}
                            >
                              {convertMathDelimiters(m.content)}
                            </ReactMarkdown>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        urlTransform={(value) => value}
                        components={markdownComponents(m.role, openImageViewer)}
                      >
                        {convertMathDelimiters(m.content)}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>

                {/* Play button for assistant messages */}
                {m.role === "assistant" && m.content && enableAudio && (
                  <PlayTTS
                    text={m.speechContent || m.content}
                    className="flex-shrink-0 p-2 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors self-start"
                    playbackRate={playbackRate}
                  />
                )}

                {/* Avatar for user */}
                {m.role === "user" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-surface-hover)] flex items-center justify-center">
                    <svg className="w-4 h-4 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-brand)' }}>
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="bg-[var(--color-surface-elevated)]/80 border border-[var(--color-border)]/50 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-[var(--color-text-muted)] animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Image Viewer Modal */}
      {viewerImage && (
        <ImageViewer
          src={viewerImage.src}
          alt={viewerImage.alt}
          onClose={closeImageViewer}
          onAnnotatedImage={onAnnotatedImage}
        />
      )}
    </div>
  );
}

// Markdown components for rendering
function markdownComponents(role: "user" | "assistant", onImageClick?: (src: string, alt: string) => void) {
  const isUser = role === "user";
  return {
    p: (props: React.HTMLAttributes<HTMLParagraphElement>) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
    ul: (props: React.HTMLAttributes<HTMLUListElement>) => <ul className="list-disc ml-5 my-2 space-y-1" {...props} />,
    ol: (props: React.HTMLAttributes<HTMLOListElement>) => <ol className="list-decimal ml-5 my-2 space-y-1" {...props} />,
    li: (props: React.HTMLAttributes<HTMLLIElement>) => <li className="leading-relaxed" {...props} />,
    a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a
        className={isUser ? "text-white underline" : "underline"}
        style={!isUser ? { color: 'var(--color-brand)' } : undefined}
        rel="noopener noreferrer"
        target="_blank"
        {...props}
      />
    ),
    img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
      const srcString = typeof src === "string" ? src : "";
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt || "Generated image"}
          className="max-w-full h-auto rounded-lg my-2 border border-[var(--color-border)] cursor-pointer hover:opacity-90 transition-opacity"
          loading="lazy"
          onClick={() => onImageClick?.(srcString, alt || "Image")}
          {...props}
        />
      );
    },
    strong: (props: React.HTMLAttributes<HTMLElement>) => <strong className="font-semibold" {...props} />,
    em: (props: React.HTMLAttributes<HTMLElement>) => <em className="italic" {...props} />,
    code: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
      <code
        className={`${isUser ? "bg-white/20" : "bg-[var(--color-surface)]"} rounded px-1.5 py-0.5 font-mono text-[0.9em]`}
        {...props}
      >
        {children}
      </code>
    ),
    pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
      <pre className={`${isUser ? "bg-white/15" : "bg-[var(--color-surface)]"} overflow-x-auto rounded-lg p-3 my-2`} {...props} />
    ),
    blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
      <blockquote className={`${isUser ? "border-white/40" : "border-[var(--color-border)]"} border-l-2 pl-3 my-2 italic`} {...props} />
    ),
    hr: (props: React.HTMLAttributes<HTMLHRElement>) => <hr className="border-[var(--color-border)] my-3" {...props} />,
    table: (props: React.HTMLAttributes<HTMLTableElement>) => (
      <div className="overflow-x-auto my-2">
        <table className="table-auto border-collapse text-sm" {...props} />
      </div>
    ),
    th: (props: React.HTMLAttributes<HTMLTableCellElement>) => <th className="border border-[var(--color-border)] px-2 py-1" {...props} />,
    td: (props: React.HTMLAttributes<HTMLTableCellElement>) => <td className="border border-[var(--color-border)] px-2 py-1 align-top" {...props} />,
  };
}
