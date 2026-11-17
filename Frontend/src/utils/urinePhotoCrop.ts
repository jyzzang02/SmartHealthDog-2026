type Size = { width: number; height: number };
type PhotoLayout = { left: number; top: number; renderedScale: number };

export function getUrinePhotoCrop(image: Size, layout: PhotoLayout, frame: Size) {
  const { left, top, renderedScale: scale } = layout;
  if (!Number.isFinite(scale) || scale <= 0) return undefined;

  // Map only the visible photo pixels back to the original, excluding empty space.
  const x = Math.max(0, -left / scale);
  const y = Math.max(0, -top / scale);
  const right = Math.min(image.width, (frame.width - left) / scale);
  const bottom = Math.min(image.height, (frame.height - top) / scale);
  if (!(right - x >= 1 && bottom - y >= 1)) return undefined;
  return { x, y, width: right - x, height: bottom - y };
}
