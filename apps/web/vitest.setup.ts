import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, vi } from "vitest";

afterEach(() => {
  cleanup();
});

const originalConsoleError = console.error;

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    originalConsoleError(...(args as []));
    throw new Error(
      `Unexpected console.error: ${args.map((a) => String(a)).join(" ")}`,
    );
  });

  if (typeof window !== "undefined") {
    if (!window.matchMedia) {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }),
      });
    }

    if (typeof globalThis.ResizeObserver === "undefined") {
      globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    }

    if (typeof window.requestAnimationFrame === "undefined") {
      window.requestAnimationFrame = (cb: FrameRequestCallback) =>
        window.setTimeout(() => cb(Date.now()), 0);
    }
    if (typeof window.cancelAnimationFrame === "undefined") {
      window.cancelAnimationFrame = (id: number) => clearTimeout(id);
    }
  }
});
