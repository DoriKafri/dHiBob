"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

interface SignaturePadProps {
  /** Called with PNG data URL whenever the signature changes */
  onChange: (dataUrl: string | null) => void;
}

const FONTS = [
  { name: "Dancing Script", css: "'Dancing Script', cursive" },
  { name: "Great Vibes", css: "'Great Vibes', cursive" },
  { name: "Pacifico", css: "'Pacifico', cursive" },
  { name: "Caveat", css: "'Caveat', cursive" },
];

export function SignaturePad({ onChange }: SignaturePadProps) {
  const [mode, setMode] = useState<"draw" | "type">("draw");

  return (
    <div>
      {/* Google Fonts for typed signatures */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Dancing+Script&family=Great+Vibes&family=Pacifico&family=Caveat&display=swap"
        rel="stylesheet"
      />

      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => { setMode("draw"); onChange(null); }}
          className={`px-4 py-1.5 text-sm rounded-md font-medium transition ${
            mode === "draw"
              ? "bg-primary-600 text-white"
              : "bg-gray-100 dark:bg-charcoal-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-charcoal-600"
          }`}
        >
          Draw
        </button>
        <button
          type="button"
          onClick={() => { setMode("type"); onChange(null); }}
          className={`px-4 py-1.5 text-sm rounded-md font-medium transition ${
            mode === "type"
              ? "bg-primary-600 text-white"
              : "bg-gray-100 dark:bg-charcoal-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-charcoal-600"
          }`}
        >
          Type
        </button>
      </div>

      {mode === "draw" ? (
        <DrawPad onChange={onChange} />
      ) : (
        <TypePad onChange={onChange} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Draw mode                                                          */
/* ------------------------------------------------------------------ */

function DrawPad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const hasStrokesRef = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const getPressure = (e: React.MouseEvent | React.TouchEvent): number => {
    if ("touches" in e) {
      const touch = e.touches[0];
      if (touch && typeof (touch as any).force === "number" && (touch as any).force > 0) {
        return (touch as any).force;
      }
    }
    if ("pressure" in e && typeof (e as any).pressure === "number" && (e as any).pressure > 0) {
      return (e as any).pressure;
    }
    return 0.5; // default pressure
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPoint.current = getPos(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || !canvasRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d")!;
    const point = getPos(e);
    const pressure = getPressure(e);

    ctx.strokeStyle = "#1a1a1a";
    // Pressure-sensitive line width: thicker on press, thinner on lift
    ctx.lineWidth = 1 + pressure * 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    if (lastPoint.current) {
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    }
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPoint.current = point;
    hasStrokesRef.current = true;
    setHasStrokes(true);
  };

  const endDraw = () => {
    isDrawing.current = false;
    lastPoint.current = null;
    // Use ref instead of state to avoid stale closure on first stroke
    if (canvasRef.current && hasStrokesRef.current) {
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clear = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    hasStrokesRef.current = false;
    setHasStrokes(false);
    onChange(null);
  };

  // Set canvas size on mount
  useEffect(() => {
    if (canvasRef.current) {
      const parent = canvasRef.current.parentElement;
      if (parent) {
        canvasRef.current.width = parent.clientWidth;
        canvasRef.current.height = 150;
      }
    }
  }, []);

  return (
    <div>
      <div className="relative border-2 border-dashed border-gray-300 dark:border-charcoal-600 rounded-lg bg-white dark:bg-charcoal-900 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair touch-none dark:invert"
          style={{ height: 150 }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        <div className="absolute bottom-0 left-4 right-4 border-t border-gray-300 dark:border-charcoal-500" style={{ bottom: 30 }} />
      </div>
      <div className="flex gap-2 mt-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={!hasStrokes}>
          <Eraser size={14} className="mr-1" /> Clear
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Type mode                                                          */
/* ------------------------------------------------------------------ */

function TypePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const [text, setText] = useState("");
  const [selectedFont, setSelectedFont] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const renderToCanvas = useCallback(() => {
    if (!text.trim() || !canvasRef.current) {
      onChange(null);
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    canvas.width = 400;
    canvas.height = 100;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const font = FONTS[selectedFont];
    ctx.font = `40px ${font.css}`;
    ctx.fillStyle = "#1a1a1a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    onChange(canvas.toDataURL("image/png"));
  }, [text, selectedFont, onChange]);

  useEffect(() => {
    // Small delay to let fonts load
    const timer = setTimeout(renderToCanvas, 100);
    return () => clearTimeout(timer);
  }, [renderToCanvas]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type your full name..."
        className="w-full px-3 py-2 border border-gray-300 dark:border-charcoal-600 rounded-md bg-white dark:bg-charcoal-900 text-charcoal-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
      />

      <div className="grid grid-cols-2 gap-2">
        {FONTS.map((font, i) => (
          <button
            key={font.name}
            type="button"
            onClick={() => setSelectedFont(i)}
            className={`p-3 border rounded-md text-center transition ${
              i === selectedFont
                ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                : "border-gray-200 dark:border-charcoal-600 hover:border-gray-300 dark:hover:border-charcoal-500"
            }`}
          >
            <span
              style={{ fontFamily: font.css, fontSize: 22 }}
              className="text-charcoal-900 dark:text-white"
            >
              {text || "Your Name"}
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{font.name}</p>
          </button>
        ))}
      </div>

      {/* Hidden canvas for rendering to PNG */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
