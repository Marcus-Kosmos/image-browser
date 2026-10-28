import { afterEach, describe, expect, it, vi } from "vitest";
import { BIGGER_PICS_ORIGIN, isBiggerPicsOrigin, upscaleWithBiggerPics } from "./biggerpics";

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
    host.send(BIGGER_PICS_ORIGIN, { type: "bigger-pics-result", blob, width: 8, height: 8, context: "/Annan.png" });
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

  it("takes the result as bytes or an address, from any bigger.pics site", async () => {
    const host = new FakeHost();
    const popup = { closed: false };
    const waiting = upscaleWithBiggerPics(popup as unknown as Window, picture, host as unknown as Window);
    host.send("https://bigger.pics", { type: "bigger-pics-result", blob: new Uint8Array([1, 2, 3]) });
    const result = await waiting;
    expect(result?.blob.size).toBe(3);
  });

  it("stops waiting when told to", async () => {
    const host = new FakeHost();
    const popup = { closed: false };
    const stop = new AbortController();
    const waiting = upscaleWithBiggerPics(popup as unknown as Window, picture, host as unknown as Window, stop.signal);
    stop.abort();
    await expect(waiting).resolves.toBeNull();
    expect(host.listeners).toHaveLength(0);
  });
});

describe("isBiggerPicsOrigin", () => {
  it("accepts bigger.pics and its subdomains over https only", () => {
    expect(isBiggerPicsOrigin("https://bigger.pics")).toBe(true);
    expect(isBiggerPicsOrigin("https://app.bigger.pics")).toBe(true);
    expect(isBiggerPicsOrigin("http://app.bigger.pics")).toBe(false);
    expect(isBiggerPicsOrigin("https://evilbigger.pics")).toBe(false);
    expect(isBiggerPicsOrigin("https://bigger.pics.evil.example")).toBe(false);
  });
});
