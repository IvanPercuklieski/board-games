import { clampView, FIT, panBy, zoomAt } from './zoom-math';

const size = { width: 400, height: 300 };

describe('zoom math', () => {
  it('keeps the content covering the viewport', () => {
    expect(clampView({ scale: 1, x: 50, y: -20 }, size, 1, 3)).toEqual(FIT);
    expect(clampView({ scale: 2, x: -500, y: 10 }, size, 1, 3)).toEqual({
      scale: 2,
      x: -400,
      y: 0,
    });
    expect(clampView({ scale: 5, x: 0, y: 0 }, size, 1, 3).scale).toBe(3);
    expect(clampView({ scale: 0.5, x: 0, y: 0 }, size, 1, 3).scale).toBe(1);
  });

  it('zooms around a point, keeping that point still', () => {
    const view = zoomAt(FIT, 2, { x: 200, y: 150 }, size, 1, 3);
    expect(view).toEqual({ scale: 2, x: -200, y: -150 });
    // the content point that was at (200, 150) is still drawn there
    expect((200 - view.x) / view.scale).toBe(200);
  });

  it('zooming out to the minimum fits the whole content again', () => {
    const zoomed = zoomAt(FIT, 3, { x: 0, y: 0 }, size, 1, 3);
    expect(zoomAt(zoomed, 0.1, { x: 120, y: 80 }, size, 1, 3)).toEqual(FIT);
  });

  it('pans within the zoomed content only', () => {
    const zoomed = { scale: 2, x: -100, y: -100 };
    expect(panBy(zoomed, 30, -20, size, 1, 3)).toEqual({ scale: 2, x: -70, y: -120 });
    expect(panBy(zoomed, 500, -500, size, 1, 3)).toEqual({ scale: 2, x: 0, y: -300 });
    expect(panBy(FIT, 40, 40, size, 1, 3)).toEqual(FIT);
  });
});
