import { Component } from '@angular/core';
import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ZoomPanComponent } from './zoom-pan.component';

@Component({
  imports: [ZoomPanComponent],
  template: `
    <bt-zoom-pan label="Island map">
      <div style="width: 400px; height: 300px">
        <button type="button" (click)="clicks = clicks + 1">Spot</button>
      </div>
    </bt-zoom-pan>
  `,
})
class HostComponent {
  clicks = 0;
}

/** jsdom has no layout: give the viewport a real size. */
function sized(width = 400, height = 300) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: height,
  });
}

async function setup() {
  sized();
  const view = await render(HostComponent);
  const viewport = screen.getByRole('group', { name: /^Island map, zoom/ });
  const content = viewport.firstElementChild as HTMLElement;
  return { view, viewport, content };
}

describe('ZoomPanComponent', () => {
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)['clientWidth'];
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)['clientHeight'];
  });

  it('starts fitted and says so', async () => {
    const { viewport, content } = await setup();
    expect(viewport.getAttribute('aria-label')).toBe('Island map, zoom 100%');
    expect(content.style.transform).toBe('translate(0px, 0px) scale(1)');
    expect(screen.getByRole('button', { name: 'Zoom out' }).hasAttribute('disabled')).toBe(true);
  });

  it('zooms in and out around the centre with the buttons, and fits again', async () => {
    const { viewport, content } = await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(viewport.getAttribute('aria-label')).toBe('Island map, zoom 140%');
    expect(content.style.transform).toBe('translate(-80px, -60px) scale(1.4)');
    await userEvent.click(screen.getByRole('button', { name: 'Fit' }));
    expect(content.style.transform).toBe('translate(0px, 0px) scale(1)');
  });

  it('zooms with the keyboard and moves with the arrow keys', async () => {
    const { viewport, content } = await setup();
    viewport.focus();
    await userEvent.keyboard('++');
    expect(viewport.getAttribute('aria-label')).toBe('Island map, zoom 196%');
    const before = content.style.transform;
    await userEvent.keyboard('{ArrowRight}');
    expect(content.style.transform).not.toBe(before);
    await userEvent.keyboard('0');
    expect(content.style.transform).toBe('translate(0px, 0px) scale(1)');
  });

  it('does not zoom past the maximum', async () => {
    const { viewport } = await setup();
    for (let i = 0; i < 6; i++)
      await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(viewport.getAttribute('aria-label')).toBe('Island map, zoom 300%');
    expect(screen.getByRole('button', { name: 'Zoom in' }).hasAttribute('disabled')).toBe(true);
  });

  it('pans by dragging, and the drag does not click what is under the pointer', async () => {
    const { view, viewport, content } = await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    const spot = screen.getByRole('button', { name: 'Spot' });
    fireEvent.pointerDown(spot, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(spot, { pointerId: 1, clientX: 130, clientY: 110 });
    fireEvent.pointerUp(spot, { pointerId: 1, clientX: 130, clientY: 110 });
    fireEvent.click(spot);
    expect(content.style.transform).toBe('translate(-50px, -50px) scale(1.4)');
    expect(view.fixture.componentInstance.clicks).toBe(0);
    // a plain click still works
    fireEvent.pointerDown(spot, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(spot, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.click(spot);
    expect(view.fixture.componentInstance.clicks).toBe(1);
    expect(viewport).toBeTruthy();
  });
});
