import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  openExternal: vi.fn(async () => {}),
}));

vi.mock("electron", () => ({
  app: { getPath: vi.fn() },
  BrowserWindow: class {},
  clipboard: { readText: vi.fn(), writeText: vi.fn() },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  shell: {
    openExternal: electronMocks.openExternal,
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
    trashItem: vi.fn(),
  },
}));

import { registerIpcHandlers } from "../electron/ipc";

type Handler = (...args: any[]) => any;

function registeredHandlers(): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: Handler) => {
      handlers.set(channel, handler);
    }),
    on: vi.fn(),
  };

  registerIpcHandlers(
    ipcMain as any,
    {} as any,
    {} as any,
    () => null,
  );
  return handlers;
}

describe("desktop:openExternal IPC", () => {
  beforeEach(() => {
    electronMocks.openExternal.mockClear();
  });

  it("opens validated web URLs with the external shell", async () => {
    const handler = registeredHandlers().get("desktop:openExternal");

    await handler?.({}, "https://example.com/docs");

    expect(electronMocks.openExternal).toHaveBeenCalledWith(
      "https://example.com/docs",
    );
  });

  it("rejects local paths before invoking the external shell", async () => {
    const handler = registeredHandlers().get("desktop:openExternal");

    await expect(handler?.({}, "file:///tmp/private.txt")).rejects.toThrow(
      "protocol is not allowed",
    );
    expect(electronMocks.openExternal).not.toHaveBeenCalled();
  });
});
