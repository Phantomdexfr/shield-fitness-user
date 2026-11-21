// Shrinks a picked image to a JPEG data URL (long side <= 1280 px) so a photo is small enough to keep on the device.
// DOM only (canvas); kept out of src/shared. Returns null when the file cannot be read as an image.

const MAX_SIDE = 1280;

export async function shrinkImage(file: File): Promise<{ mime: string; data: string } | null> {
  if (!file.type.startsWith('image/')) return null;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const data = canvas.toDataURL('image/jpeg', 0.82);
    return data.startsWith('data:image/jpeg') ? { mime: 'image/jpeg', data } : null;
  } catch {
    return null;
  }
}
