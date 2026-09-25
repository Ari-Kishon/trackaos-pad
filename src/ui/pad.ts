export type PadPointer = {
  readonly x: number;
  readonly y: number;
  readonly active: boolean;
};

export type PadHandlers = {
  onEngage: (norm: { x: number; y: number }) => void;
  onMove: (norm: { x: number; y: number }) => void;
  onRelease: () => void;
};

type Norm = { x: number; y: number };

export function createPad(surface: HTMLElement, handlers: PadHandlers): {
  destroy: () => void;
  setVisual: (pointer: PadPointer) => void;
} {
  const crossV = document.createElement('div');
  crossV.className = 'pad-cross-v';
  crossV.setAttribute('aria-hidden', 'true');

  const crossH = document.createElement('div');
  crossH.className = 'pad-cross-h';
  crossH.setAttribute('aria-hidden', 'true');

  const cursor = document.createElement('div');
  cursor.className = 'pad-cursor';
  cursor.setAttribute('aria-hidden', 'true');

  surface.append(crossV, crossH, cursor);

  let pointerId: number | null = null;
  let rect = surface.getBoundingClientRect();
  let pending: Norm | null = null;
  let pendingActive = false;
  let rafId = 0;
  let painted: Norm = { x: 0.5, y: 0.5 };
  let paintedActive = false;

  const refreshRect = (): void => {
    rect = surface.getBoundingClientRect();
  };

  const toNorm = (clientX: number, clientY: number): Norm => {
    const w = Math.max(rect.width, 1);
    const h = Math.max(rect.height, 1);
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / w)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / h)),
    };
  };

  const applyPaint = (norm: Norm, active: boolean): void => {
    const xPx = norm.x * rect.width;
    const yPx = norm.y * rect.height;
    crossV.style.transform = `translate3d(${String(xPx)}px,0,0)`;
    crossH.style.transform = `translate3d(0,${String(yPx)}px,0)`;
    cursor.style.transform = `translate3d(${String(xPx)}px,${String(yPx)}px,0)`;
    if (active !== paintedActive) {
      surface.classList.toggle('is-active', active);
      cursor.classList.toggle('is-on', active);
      paintedActive = active;
    }
    painted = norm;
  };

  const flush = (): void => {
    rafId = 0;
    if (!pending) {
      return;
    }
    applyPaint(pending, pendingActive);
    pending = null;
  };

  const schedulePaint = (norm: Norm, active: boolean): void => {
    pending = norm;
    pendingActive = active;
    if (rafId === 0) {
      rafId = requestAnimationFrame(flush);
    }
  };

  const paintNow = (norm: Norm, active: boolean): void => {
    pending = null;
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    applyPaint(norm, active);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (pointerId !== null) {
      return;
    }
    event.preventDefault();
    pointerId = event.pointerId;
    refreshRect();
    surface.setPointerCapture(event.pointerId);
    const norm = toNorm(event.clientX, event.clientY);
    paintNow(norm, true);
    handlers.onEngage(norm);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) {
      return;
    }
    const norm = toNorm(event.clientX, event.clientY);
    schedulePaint(norm, true);
    handlers.onMove(norm);
  };

  const endPointer = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) {
      return;
    }
    pointerId = null;
    if (surface.hasPointerCapture(event.pointerId)) {
      surface.releasePointerCapture(event.pointerId);
    }
    const norm = toNorm(event.clientX, event.clientY);
    paintNow(norm, false);
    handlers.onRelease();
  };

  const onResize = (): void => {
    refreshRect();
    applyPaint(painted, paintedActive);
  };

  surface.addEventListener('pointerdown', onPointerDown);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerup', endPointer);
  surface.addEventListener('pointercancel', endPointer);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, true);

  paintNow({ x: 0.5, y: 0.5 }, false);

  return {
    destroy: () => {
      surface.removeEventListener('pointerdown', onPointerDown);
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerup', endPointer);
      surface.removeEventListener('pointercancel', endPointer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      if (rafId !== 0) {
        cancelAnimationFrame(rafId);
      }
      crossV.remove();
      crossH.remove();
      cursor.remove();
    },
    setVisual: (pointer) => {
      paintNow({ x: pointer.x, y: pointer.y }, pointer.active);
    },
  };
}
