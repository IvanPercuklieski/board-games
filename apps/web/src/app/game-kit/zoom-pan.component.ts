import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ButtonComponent } from '../ui/button/button.component';
import { IconButtonComponent } from '../ui/button/icon-button.component';
import { FIT, panBy, zoomAt, type Size, type ZoomView } from './zoom-math';

let nextId = 0;

const BUTTON_STEP = 1.4;
const KEY_PAN = 48;
/** Movement (px) after which a press counts as a drag, not a click. */
const DRAG_THRESHOLD = 5;

/**
 * Lets players zoom (wheel, pinch, + / − buttons, keyboard) and pan (drag, arrow keys) any
 * content. At the smallest zoom the content fits the frame exactly. Clicks inside still work,
 * except right after a drag. Button and keyboard zooms animate (not with reduced motion).
 */
@Component({
  selector: 'bt-zoom-pan',
  imports: [ButtonComponent, IconButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #viewport
      class="viewport"
      tabindex="0"
      role="group"
      [attr.aria-label]="label() + ', zoom ' + percent() + '%'"
      [attr.aria-describedby]="hintId"
      [style.touch-action]="view().scale > min() ? 'none' : 'pan-y'"
      [class.dragging]="dragging()"
      (wheel)="onWheel($event)"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="onPointerUp($event)"
      (keydown)="onKey($event)"
    >
      <div class="content" [class.animate]="animate()" [style.transform]="transform()">
        <ng-content />
      </div>
    </div>
    <p class="bt-visually-hidden" [id]="hintId">
      Plus and minus keys zoom, arrow keys move, 0 fits the whole board.
    </p>
    <div class="controls">
      <button
        bt-icon-button
        variant="secondary"
        size="sm"
        icon="plus"
        label="Zoom in"
        [disabled]="view().scale >= max()"
        (click)="step(1)"
      ></button>
      <button
        bt-icon-button
        variant="secondary"
        size="sm"
        icon="minus"
        label="Zoom out"
        [disabled]="view().scale <= min()"
        (click)="step(-1)"
      ></button>
      <button
        bt-button
        variant="secondary"
        size="sm"
        [disabled]="view().scale <= min()"
        (click)="fit()"
      >
        Fit
      </button>
    </div>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }
    .viewport {
      overflow: hidden;
      border-radius: var(--bt-radius-lg);
      cursor: grab;
      outline: none;
    }
    .viewport:focus-visible {
      box-shadow: var(--bt-focus-ring);
    }
    .viewport.dragging {
      cursor: grabbing;
    }
    .content {
      transform-origin: 0 0;
    }
    .content.animate {
      transition: transform var(--bt-duration-base) var(--bt-ease-standard);
    }
    .controls {
      position: absolute;
      right: var(--bt-space-3);
      bottom: var(--bt-space-3);
      display: flex;
      gap: var(--bt-space-1);
      padding: var(--bt-space-1);
      border-radius: var(--bt-radius-md);
      background: color-mix(in srgb, var(--bt-color-surface-raised) 85%, transparent);
      box-shadow: var(--bt-shadow-sm);
    }
  `,
})
export class ZoomPanComponent {
  /** What is being zoomed, e.g. "Island map". */
  readonly label = input.required<string>();
  readonly min = input(1);
  readonly max = input(3);

  protected readonly hintId = `bt-zoom-hint-${nextId++}`;
  protected readonly view = signal<ZoomView>(FIT);
  protected readonly animate = signal(false);
  protected readonly dragging = signal(false);
  protected readonly percent = computed(() => Math.round(this.view().scale * 100));
  protected readonly transform = computed(() => {
    const { scale, x, y } = this.view();
    return `translate(${x}px, ${y}px) scale(${scale})`;
  });

  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');
  private readonly destroyRef = inject(DestroyRef);
  /** Active pointers (one: pan, two: pinch), in viewport coordinates. */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pressStart: { x: number; y: number } | null = null;
  private moved = false;

  constructor() {
    // Capture phase (templates can't): the click that ends a drag must not reach a target inside.
    const onClick = (event: Event) => this.onClickCapture(event);
    afterNextRender(() => {
      const el = this.viewport().nativeElement;
      el.addEventListener('click', onClick, true);
      this.destroyRef.onDestroy(() => el.removeEventListener('click', onClick, true));
    });
  }

  /** Zooms in (1) or out (-1) one step around the centre. */
  protected step(direction: 1 | -1) {
    const size = this.size();
    this.apply(
      zoomAt(
        this.view(),
        direction > 0 ? BUTTON_STEP : 1 / BUTTON_STEP,
        { x: size.width / 2, y: size.height / 2 },
        size,
        this.min(),
        this.max(),
      ),
      true,
    );
  }

  protected fit() {
    this.apply(FIT, true);
  }

  protected onWheel(event: WheelEvent) {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    this.apply(zoomAt(this.view(), factor, this.local(event), this.size(), this.min(), this.max()));
  }

  protected onPointerDown(event: PointerEvent) {
    this.pointers.set(event.pointerId, this.local(event));
    if (this.pointers.size === 1) {
      this.pressStart = this.local(event);
      this.moved = false;
    }
  }

  protected onPointerMove(event: PointerEvent) {
    const before = this.pointers.get(event.pointerId);
    if (!before) return;
    const now = this.local(event);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const other = a === before ? b! : a!;
      const factor = distance(now, other) / Math.max(1, distance(before, other));
      const mid = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 };
      this.apply(zoomAt(this.view(), factor, mid, this.size(), this.min(), this.max()));
      this.moved = true;
    } else if (this.pressStart) {
      if (!this.moved && distance(now, this.pressStart) < DRAG_THRESHOLD) return;
      if (!this.moved) {
        this.moved = true;
        this.dragging.set(true);
        this.viewport().nativeElement.setPointerCapture?.(event.pointerId);
      }
      this.apply(
        panBy(this.view(), now.x - before.x, now.y - before.y, this.size(), this.min(), this.max()),
      );
    }
    this.pointers.set(event.pointerId, now);
  }

  protected onPointerUp(event: PointerEvent) {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size === 0) {
      this.pressStart = null;
      this.dragging.set(false);
    }
  }

  /** A drag ends with a click on whatever is under the pointer: swallow that one. */
  private onClickCapture(event: Event) {
    if (!this.moved) return;
    this.moved = false;
    event.stopPropagation();
    event.preventDefault();
  }

  protected onKey(event: KeyboardEvent) {
    if (event.target !== this.viewport().nativeElement) return; // keys on buttons inside
    const pan = (dx: number, dy: number) =>
      this.apply(panBy(this.view(), dx, dy, this.size(), this.min(), this.max()), true);
    const actions: Record<string, () => void> = {
      '+': () => this.step(1),
      '=': () => this.step(1),
      '-': () => this.step(-1),
      '0': () => this.fit(),
      ArrowLeft: () => pan(KEY_PAN, 0),
      ArrowRight: () => pan(-KEY_PAN, 0),
      ArrowUp: () => pan(0, KEY_PAN),
      ArrowDown: () => pan(0, -KEY_PAN),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  private apply(view: ZoomView, animate = false) {
    this.animate.set(animate);
    this.view.set(view);
  }

  private size(): Size {
    const el = this.viewport().nativeElement;
    return { width: el.clientWidth, height: el.clientHeight };
  }

  private local(event: { clientX: number; clientY: number }) {
    const rect = this.viewport().nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
