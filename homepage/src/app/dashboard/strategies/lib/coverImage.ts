export function compressCoverImageFile(
  file: File,
  opts: { maxWidth?: number; maxDataUrlChars?: number } = {}
): Promise<string> {
  const maxWidth = opts.maxWidth ?? 1280;
  const maxDataUrlChars = opts.maxDataUrlChars ?? 750_000;

  if (!file || !file.type.startsWith("image/")) {
    return Promise.reject(new Error("Please choose an image file (JPEG, PNG, GIF, or WebP)."));
  }

  const objUrl = URL.createObjectURL(file);

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
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process image."));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        let q = 0.88;
        let out = canvas.toDataURL("image/jpeg", q);
        while (out.length > maxDataUrlChars && q > 0.42) {
          q -= 0.06;
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
