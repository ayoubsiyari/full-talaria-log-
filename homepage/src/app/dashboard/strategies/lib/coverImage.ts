import { MAX_IMAGE_DATA_URL_LEN } from "@/lib/imageUploadLimits";

export function compressCoverImageFile(
  file: File,
  opts: { maxEdge?: number; maxDataUrlChars?: number; quality?: number } = {}
): Promise<string> {
  const maxEdge = opts.maxEdge ?? 1920;
  const maxDataUrlChars = opts.maxDataUrlChars ?? MAX_IMAGE_DATA_URL_LEN;
  const startQuality = opts.quality ?? 0.92;

  if (!file || !file.type.startsWith("image/")) {
    return Promise.reject(new Error("Please choose an image file (JPEG, PNG, GIF, or WebP)."));
  }

  const objUrl = URL.createObjectURL(file);
  const preferPng = file.type === "image/png" || file.type === "image/gif";

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (!w || !h) {
          reject(new Error("Invalid image dimensions."));
          return;
        }
        const longest = Math.max(w, h);
        if (longest > maxEdge) {
          const r = maxEdge / longest;
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process image."));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        let usePng = preferPng;
        let q = startQuality;
        let out = usePng ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", q);
        while (out.length > maxDataUrlChars && usePng) {
          usePng = false;
          out = canvas.toDataURL("image/jpeg", q);
        }
        while (out.length > maxDataUrlChars && q > 0.5) {
          q -= 0.04;
          out = canvas.toDataURL("image/jpeg", q);
        }
        if (out.length > maxDataUrlChars) {
          reject(new Error("Image is still too large after compression. Try a smaller image."));
          return;
        }
        resolve(out);
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Could not process image."));
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error("Could not load image."));
    };
    img.src = objUrl;
  });
}
