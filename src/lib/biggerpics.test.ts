import { afterEach, describe, expect, it, vi } from "vitest";
import { BIGGER_PICS_ORIGIN, upscaleWithBiggerPics } from "./biggerpics";

class FakeHost {
  listeners: ((e: MessageEvent) => void)[] = [];
  addEventListener(_: string, f: (e: MessageEvent) => void) {
    this.listeners.push(f);
  }
  removeEventListener(_: string, f: (e: MessageEvent) => void) {
    this.listeners = this.listeners.filter((g) => g !== f);
  }
  send(origin: string, data: unknown, source?: unknown) {
    for (const f of this.listeners) f({ origin, data, source } as MessageEvent);
  }
}

const picture = {
  url: async () => "data:image/png;base64,AAAA",
  name: "Hus.png",
  format: "png" as const,
  context: "/Bilder/Hus.png",
};

afterEach(() => vi.useRealTimers());

describe("upscaleWithBiggerPics", () => {
  it("hands over the picture when ready and takes back only its own result", async () => {
    const host = new FakeHost();
    const popup = { closed: false };
    const source = { postMessage: vi.fn() };
    const waiting = upscaleWithBiggerPics(popup as unknown as Window, picture, host as unknown as Window);

    host.send("https://evil.example", { type: "bigger-pics-ready" }, source);
    host.send(BIGGER_PICS_ORIGIN, { type: "bigger-pics-ready" }, source);
    await new Promise((r) => setTimeout(r, 0));
    expect(source.postMessage).toHaveBeenCalledTimes(1);
    expect(source.postMessage).toHaveBeenCalledWith(
      {
        type: "bigger-pics-image",
        url: "data:image/png;base64,AAAA",
        name: "Hus.png",
        format: "png",
        context: "/Bilder/Hus.png",
      },
      BIGGER_PICS_ORIGIN,
    );

    const blob = new Blob(["x"]);
    host.send("https://evil.example", { type: "bigger-pics-result", blob, context: picture.context });
    host.send(BIGGER_PICS_ORIGIN, { type: "bigger-pics-result", blob, width: 8, height: 8 });
    host.send(BIGGER_PICS_ORIGIN, {
      type: "bigger-pics-result",
      blob,
      width: 400,
      height: 300,
      context: picture.context,
    });
    await expect(waiting).resolves.toEqual({ blob, width: 400, height: 300 });
    expect(host.listeners).toHaveLength(0);
  });

  it("gives up when the window is closed without a result", async () => {
    vi.useFakeTimers();
    const host = new FakeHost();
    const popup = { closed: false };
    const waiting = upscaleWithBiggerPics(popup as unknown as Window, picture, host as unknown as Window);
    popup.closed = true;
    await vi.advanceTimersByTimeAsync(1100);
    await expect(waiting).resolves.toBeNull();
  });
});
