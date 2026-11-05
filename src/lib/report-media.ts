export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export interface ReportImage { id: string; path: string; position: number; mimeType: string; sizeBytes: number }
export function validImage(file: { type: string; size: number }) { return IMAGE_TYPES.includes(file.type) && file.size > 0 && file.size <= IMAGE_MAX_BYTES; }
export function replaceImage<T>(items: T[], index: number, item: T): T[] { return items.map((old, i) => i === index ? item : old); }
export async function decodeImage(file: File) {
  if (!validImage(file)) throw new Error("image");
  if (typeof createImageBitmap === "function") {
    const image = await createImageBitmap(file); image.close(); return;
  }
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => image.naturalWidth > 0 ? resolve() : reject(new Error("image"));
      image.onerror = () => reject(new Error("image"));
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}