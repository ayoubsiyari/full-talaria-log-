/**
 * Strategy Lab V9 — safe image upload (max 2 MB per image), size stats, compression.
 */

import { strategyImageUrl } from "./strategyLabV9Mappers";

export { strategyImageUrl };

/** Max raw file size before processing (2 MB). */
export const STRATEGY_IMAGE_MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Max stored data-URL size after compression (~2 MB binary as base64). */
export const STRATEGY_IMAGE_MAX_DATA_URL_BYTES = 2_800_000;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const BLOCKED_NAME = /\.(svg|html?|htm|js|mjs|cjs|php|exe|bat|cmd|sh|dll|zip|rar|7z|pdf)$/i;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Approximate decoded byte size of a data URL string. */
export function dataUrlByteSize(dataUrl: string): number {
  if (!dataUrl || typeof dataUrl !== "string") return 0;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  const b64 = dataUrl.slice(comma + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

async function readFileHead(file: File, n = 16): Promise<Uint8Array> {
  const buf = await file.slice(0, n).arrayBuffer();
  return new Uint8Array(buf);
}

function detectImageMime(head: Uint8Array): string | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47)
    return "image/png";
  if (head.length >= 3 && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return "image/gif";
  if (
    head.length >= 12 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function safeBaseName(name: string): string {
  const base = String(name || "image")
    .replace(/[/\\]/g, "")
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .slice(0, 120);
  return base || "image.jpg";
}

export type ImageValidationResult =
  | { ok: true; mime: string }
  | { ok: false; error: string };

/** Validate file type/size before read — blocks disguised scripts/HTML/SVG. */
export async function validateStrategyImageFile(file: File): Promise<ImageValidationResult> {
  if (!file || typeof file.size !== "number") {
    return { ok: false, error: "Invalid file." };
  }
  if (file.size > STRATEGY_IMAGE_MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `Each image must be 2 MB or smaller (this file is ${formatBytes(file.size)}).`,
    };
  }
  if (BLOCKED_NAME.test(file.name)) {
    return { ok: false, error: "This file type is not allowed. Use JPG, PNG, WebP, or GIF only." };
  }
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
    return { ok: false, error: "SVG images are not allowed for security reasons." };
  }

  const head = await readFileHead(file, 32);
  const probe = new TextDecoder().decode(head.slice(0, 24)).toLowerCase();
  if (probe.includes("<!doctype") || probe.includes("<html") || probe.includes("<script")) {
    return { ok: false, error: "File content is not a safe image." };
  }

  const sniffed = detectImageMime(head);
  if (!sniffed || !ALLOWED_MIME.has(sniffed)) {
    return { ok: false, error: "Only JPG, PNG, WebP, and GIF images are allowed." };
  }
  if (file.type && file.type.startsWith("image/") && !ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: "This image format is not supported." };
  }

  return { ok: true, mime: sniffed };
}

export type ProcessedStrategyImage = {
  src: string;
  name: string;
  bytes: number;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Could not decode image — file may be corrupt or unsafe."));
    img.onload = () => resolve(img);
    img.src = src;
  });
}

/**
 * Validate, resize, and compress to JPEG data URL ≤ 2 MB.
 */
export async function processStrategyImageFile(
  file: File,
  opts?: {
    maxW?: number;
    maxH?: number;
    onProgress?: (pct: number) => void;
  },
): Promise<ProcessedStrategyImage> {
  const validation = await validateStrategyImageFile(file);
  if (!validation.ok) throw new Error(validation.error);

  const maxW = opts?.maxW ?? 1600;
  const maxH = opts?.maxH ?? 1200;
  const onProgress = opts?.onProgress;

  onProgress?.(8);
  const dataUrl = await readFileAsDataUrl(file);
  onProgress?.(22);

  const img = await loadImage(dataUrl);
  if (img.naturalWidth > 8000 || img.naturalHeight > 8000) {
    throw new Error("Image dimensions are too large (max 8000px).");
  }

  const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(img, 0, 0, w, h);

  onProgress?.(45);
  let quality = 0.88;
  let out = canvas.toDataURL("image/jpeg", quality);
  let attempts = 0;
  while (dataUrlByteSize(out) > STRATEGY_IMAGE_MAX_DATA_URL_BYTES && quality > 0.35 && attempts < 12) {
    quality -= 0.08;
    out = canvas.toDataURL("image/jpeg", quality);
    attempts += 1;
    onProgress?.(45 + Math.min(40, attempts * 4));
  }

  if (dataUrlByteSize(out) > STRATEGY_IMAGE_MAX_DATA_URL_BYTES) {
    throw new Error(
      `Image is still too large after compression (${formatBytes(dataUrlByteSize(out))}). Try a smaller screenshot.`,
    );
  }

  onProgress?.(100);
  const name = safeBaseName(file.name).replace(/\.[^.]+$/, "") + ".jpg";
  return { src: out, name, bytes: dataUrlByteSize(out) };
}

export function collectStrategyImageStats(
  canvasNodes: unknown,
  galleryImages?: unknown,
): { imageCount: number; imageBytes: number } {
  let imageCount = 0;
  let imageBytes = 0;
  const add = (entry: unknown) => {
    const src = strategyImageUrl(entry);
    if (!src.startsWith("data:image/")) return;
    imageCount += 1;
    imageBytes += dataUrlByteSize(src);
  };

  if (Array.isArray(galleryImages)) galleryImages.forEach(add);
  if (Array.isArray(canvasNodes)) {
    for (const node of canvasNodes) {
      if (!node || typeof node !== "object") continue;
      const data = (node as { data?: { images?: unknown } }).data;
      if (!data || !Array.isArray(data.images)) continue;
      data.images.forEach(add);
    }
  }
  return { imageCount, imageBytes };
}
