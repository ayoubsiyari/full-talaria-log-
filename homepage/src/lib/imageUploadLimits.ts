import constants from "../../../shared/constants.json";

/** Max raw image file size before client-side compression (site-wide). */
export const MAX_IMAGE_UPLOAD_MB = constants.limits.max_image_upload_mb;

export const MAX_IMAGE_UPLOAD_BYTES = MAX_IMAGE_UPLOAD_MB * 1024 * 1024;

/** Max stored data-URL length for images embedded in JSON payloads. */
export const MAX_IMAGE_DATA_URL_LEN = constants.limits.max_image_data_url_chars;

export const IMAGE_UPLOAD_FORMAT_HINT = `JPEG, PNG, GIF, or WebP · max ${MAX_IMAGE_UPLOAD_MB} MB`;

export function imageUploadTooLargeError(fileSizeBytes: number): string {
  const mb = (fileSizeBytes / (1024 * 1024)).toFixed(1);
  return `Image too large (${mb} MB). Maximum size is ${MAX_IMAGE_UPLOAD_MB} MB.`;
}

export function imageDataUrlTooLargeError(): string {
  return `Image too large. Maximum size is ${MAX_IMAGE_UPLOAD_MB} MB.`;
}
