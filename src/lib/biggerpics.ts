/**
 * bigger.pics, a free upscaler that runs in a window of its own. The app opens it, hands it the picture
 * when it says it is ready, and gets the enlarged picture back when the user sends it back.
 * Only messages from bigger.pics' own origin are listened to.
 */

export const BIGGER_PICS_URL = "https://bigger.pics/";
export const BIGGER_PICS_ORIGIN = "https://app.bigger.pics";

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
): Promise<BiggerPicsResult | null> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (result: BiggerPicsResult | null, error?: unknown) => {
      if (done) return;
      done = true;
      host.removeEventListener("message", onMessage);
      clearInterval(watch);
      if (error !== undefined) reject(error);
      else resolve(result);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== BIGGER_PICS_ORIGIN || typeof event.data !== "object" || event.data === null) return;
      const data = event.data as { type?: string; blob?: Blob; width?: number; height?: number; context?: unknown };
      if (data.type === "bigger-pics-ready") {
        const source = event.source as Window | null;
        picture.url().then(
          (url) =>
            source?.postMessage(
              { type: "bigger-pics-image", url, name: picture.name, format: picture.format, context: picture.context },
              BIGGER_PICS_ORIGIN,
            ),
          (error) => finish(null, error),
        );
      } else if (data.type === "bigger-pics-result" && data.context === picture.context && data.blob instanceof Blob) {
        finish({ blob: data.blob, width: data.width ?? 0, height: data.height ?? 0 });
      }
    };
    host.addEventListener("message", onMessage);
    // Closing the window without sending the picture back ends the wait; a result posted just before
    // closing still gets a moment to arrive.
    const watch = setInterval(() => {
      if (popup.closed) setTimeout(() => finish(null), 500);
    }, 500);
  });
}
