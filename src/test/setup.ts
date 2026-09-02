import '@testing-library/jest-dom/vitest';

class ResizeObserverMock implements ResizeObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords(): ResizeObserverEntry[] { return []; }
}

Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverMock, writable: true });
Object.defineProperty(globalThis, 'requestAnimationFrame', {
  value: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0),
  writable: true,
});

