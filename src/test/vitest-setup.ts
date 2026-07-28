if (!window.visualViewport) {
  Object.defineProperty(window, 'visualViewport', {
    writable: true,
    value: {
      width: window.innerWidth,
      height: window.innerHeight,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  })
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
