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

export function createPad(surface: HTMLElement, handlers: PadHandlers): {
  destroy: () => void;
  setVisual: (pointer: PadPointer) => void;
} {
  const crosshair = document.createElement('div');
  crosshair.className = 'pad-crosshair';
  crosshair.setAttribute('aria-hidden', 'true');

  const cursor = document.createElement('div');
  cursor.className = 'pad-cursor';
  cursor.setAttribute('aria-hidden', 'true');

  surface.append(crosshair, cursor);

  let pointerId: number | null = null;

  const toNorm = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = surface.getBoundingClientRect();
    const x = (clientX - rect.left) / Math.max(rect.width, 1);
    const y = (clientY - rect.top) / Math.max(rect.height, 1);
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  };

  const paint = (norm: { x: number; y: number }, active: boolean): void => {
    surface.classList.toggle('is-active', active);
    crosshair.style.setProperty('--pad-x', `${String(norm.x * 100)}%`);
    crosshair.style.setProperty('--pad-y', `${String(norm.y * 100)}%`);
    cursor.style.setProperty('--pad-x', `${String(norm.x * 100)}%`);
    cursor.style.setProperty('--pad-y', `${String(norm.y * 100)}%`);
    cursor.classList.toggle('is-on', active);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (pointerId !== null) {
      return;
    }
    pointerId = event.pointerId;
    surface.setPointerCapture(event.pointerId);
    const norm = toNorm(event.clientX, event.clientY);
    paint(norm, true);
    handlers.onEngage(norm);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) {
      return;
    }
    const norm = toNorm(event.clientX, event.clientY);
    paint(norm, true);
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
    paint(norm, false);
    handlers.onRelease();
  };

  surface.addEventListener('pointerdown', onPointerDown);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerup', endPointer);
  surface.addEventListener('pointercancel', endPointer);

  paint({ x: 0.5, y: 0.5 }, false);

  return {
    destroy: () => {
      surface.removeEventListener('pointerdown', onPointerDown);
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerup', endPointer);
      surface.removeEventListener('pointercancel', endPointer);
      crosshair.remove();
      cursor.remove();
    },
    setVisual: (pointer) => {
      paint({ x: pointer.x, y: pointer.y }, pointer.active);
    },
  };
}
