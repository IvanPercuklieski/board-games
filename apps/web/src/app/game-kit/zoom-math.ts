/** How content is shown in a viewport: scaled by `scale`, then moved by (`x`, `y`) pixels. */
export interface ZoomView {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const FIT: ZoomView = { scale: 1, x: 0, y: 0 };

/**
 * Keeps the scale within limits and the content covering the viewport: at scale 1 the content
 * fills it exactly, so it may only move by the extra size gained by zooming in.
 */
export function clampView(view: ZoomView, size: Size, min: number, max: number): ZoomView {
  const scale = Math.min(max, Math.max(min, view.scale));
  // `+ 0` turns -0 into 0 (it would show up as "-0px")
  const clamp = (value: number, extra: number) => Math.min(0, Math.max(-extra, value)) + 0;
  return {
    scale,
    x: clamp(view.x, size.width * (scale - 1)),
    y: clamp(view.y, size.height * (scale - 1)),
  };
}

/** Zooms by `factor`, keeping the content point under `at` (viewport pixels) in place. */
export function zoomAt(
  view: ZoomView,
  factor: number,
  at: { x: number; y: number },
  size: Size,
  min: number,
  max: number,
): ZoomView {
  const scale = Math.min(max, Math.max(min, view.scale * factor));
  const ratio = scale / view.scale;
  return clampView(
    { scale, x: at.x - (at.x - view.x) * ratio, y: at.y - (at.y - view.y) * ratio },
    size,
    min,
    max,
  );
}

export function panBy(
  view: ZoomView,
  dx: number,
  dy: number,
  size: Size,
  min: number,
  max: number,
) {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, size, min, max);
}
