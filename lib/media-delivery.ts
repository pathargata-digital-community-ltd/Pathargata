const CLOUDINARY_IMAGE_UPLOAD_PREFIX = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)/i;

/**
 * Returns a small, cacheable delivery variant for feed cards.
 * Only Cloudinary image URLs are transformed; originals and other providers
 * remain untouched for compatibility and full-resolution detail viewing.
 */
export function getFeedImageUri(uri: string, dataSaver = false): string {
  if (!uri || !CLOUDINARY_IMAGE_UPLOAD_PREFIX.test(uri)) return uri;
  return uri.replace(
    CLOUDINARY_IMAGE_UPLOAD_PREFIX,
    dataSaver
      ? "$1f_auto,q_auto:eco,w_480,c_limit/"
      : "$1f_auto,q_auto,w_720,c_limit/",
  );
}
