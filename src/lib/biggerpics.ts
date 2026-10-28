/**
 * bigger.pics, a free upscaler that runs in a window of its own. The app opens it, hands it the picture
 * when it says it is ready, and gets the enlarged picture back when the user sends it back.
 * Only messages from bigger.pics' own sites are listened to.
 */

export const BIGGER_PICS_URL = "https://bigger.pics/";
export const BIGGER_PICS_ORIGIN = "https://app.bigger.pics";

/** bigger.pics itself or one of its subdomains, over https. */
export function isBiggerPicsOrigin(origin: string): boolean {
  return origin === "https://bigger.pics" || /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.bigger\.pics$/.test(origin);
}

/** The picture in a result, which may come as a Blob, raw bytes or a data:/blob: address. */
async function toBlob(picture: unknown): Promise<Blob | null> {
  if (picture instanceof Blob) return picture;
  if (picture instanceof ArrayBuffer || ArrayBuffer.isView(picture)) return new Blob([picture as BlobPart]);
  if (typeof picture === "string" && /^(data|blob):/.test(picture)) {
    const response = await fetch(picture);
    return response.ok ? response.blob() : null;
  }
  return null;
}

/** Opens bigger.pics. Must run in the click itself, or the window is blocked. */
export function openBiggerPics(): Window | null {
  return window.open(BIGGER_PICS_URL, "_blank");
}

export interface BiggerPicsPicture {
  /** A data: URL or https:// address of the picture. */
  url: () => Promise<string>;
  name: string;
  format: "png" | "jpeg";
  /** Comes back with the result, so it is known to be this picture. */
  context: string;
}

export interface BiggerPicsResult {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Hands the picture to the bigger.pics window once it is ready and waits for it to come back.
 * Resolves to null when the window is closed without sending the picture back.
 */
export function upscaleWithBiggerPics(
  popup: Window,
  picture: BiggerPicsPicture,
  host: Window = window,
  /** Ends the wait early, resolving to null; used when the picture arrived another way. */
  signal?: AbortSignal,
): Promise<BiggerPicsResult | null> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (result: BiggerPicsResult | null, error?: unknown) => {
      if (done) return;
      done = true;
      host.removeEventListener("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
      clearInterval(watch);
      if (error !== undefined) reject(error);
      else resolve(result);
    };
    const onMessage = (event: MessageEvent) => {
      if (!isBiggerPicsOrigin(event.origin) || typeof event.data !== "object" || event.data === null) return;
      const data = event.data as {
        type?: string;
        blob?: unknown;
        url?: unknown;
        width?: number;
        height?: number;
        context?: unknown;
      };
      if (data.type === "bigger-pics-ready") {
        const source = event.source as Window | null;
        picture.url().then(
          (url) =>
            source?.postMessage(
              { type: "bigger-pics-image", url, name: picture.name, format: picture.format, context: picture.context },
              event.origin,
            ),
          (error) => finish(null, error),
        );
      } else if (
        data.type === "bigger-pics-result" &&
        (data.context === undefined || data.context === picture.context)
      ) {
        toBlob(data.blob ?? data.url).then(
          (blob) => blob && finish({ blob, width: data.width ?? 0, height: data.height ?? 0 }),
          (error) => finish(null, error),
        );
      }
    };
    const onAbort = () => finish(null);
    host.addEventListener("message", onMessage);
    signal?.addEventListener("abort", onAbort);
    if (signal?.aborted) onAbort();
    // Closing the window without sending the picture back ends the wait; a result posted just before
    // closing still gets a moment to arrive.
    const watch = setInterval(() => {
      if (popup.closed) setTimeout(() => finish(null), 500);
    }, 500);
  });
}
