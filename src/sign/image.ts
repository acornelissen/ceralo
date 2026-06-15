import { dataUrlToBytes, pngBytesToDataUrl } from "./pad";
import type { StampImage } from "./stamp";

// Importing a signature from an image file. The bytes come from Rust (open_image);
// here we validate the type from its magic bytes and normalise to a transparent
// PNG via a canvas, so the rest of the pipeline (model, save) stays PNG-only.

export type ImageType = "png" | "jpeg";

/** Identify a supported raster image from its leading bytes, or null. */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  return null;
}

/** A PNG `data:` URL for the given bytes and image type, for an <img> source. */
function imageDataUrl(bytes: Uint8Array, type: ImageType): string {
  if (type === "png") {
    return pngBytesToDataUrl(bytes);
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

/**
 * Load image bytes and rasterise them to a transparent-background PNG at a given
 * placement width (height follows the image's aspect ratio). Browser-only: it
 * needs a real Image and canvas, so it is exercised live rather than in jsdom.
 */
export async function importImageAsStamp(bytes: Uint8Array, width: number): Promise<StampImage> {
  const type = detectImageType(bytes);
  if (!type) {
    throw new Error("Unsupported image: only PNG and JPEG can be imported.");
  }

  const image = await loadImage(imageDataUrl(bytes, type));
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not read the image.");
  }
  context.drawImage(image, 0, 0);

  const aspect = image.naturalHeight / image.naturalWidth;
  return {
    pngBytes: dataUrlToBytes(canvas.toDataURL("image/png")),
    width,
    height: width * aspect,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the image."));
    image.src = src;
  });
}
