import type { ImageEntry, WebHost, WebPictureFile } from "./api";
import type { Frame, Heading, ImageSettings, Shadow } from "./settings";
import { prefersDarkText } from "./theme";

/** A picture on the web page: its file in the page's folder, its shape and what was set for it. */
export interface WebPicture {
  file: string;
  width: number;
  height: number;
  alt: string;
  settings?: ImageSettings;
}

export interface WebPageLook {
  background?: string;
  frame: Frame;
  shadow: Shadow;
  rounded: boolean;
}

/** Row height the pictures aim for before the rows are stretched to fill the width. */
const ROW_HEIGHT = 320;
const HEADING_SIZE: Record<1 | 2 | 3, string> = { 1: "2.25rem", 2: "1.6rem", 3: "1.2rem" };

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function headingHtml(heading: Heading, className: string) {
  const style = [
    `font-size:${HEADING_SIZE[heading.level]}`,
    heading.color ? `color:${heading.color}` : "",
    heading.font ? `font-family:${escape(JSON.stringify(heading.font))},var(--font)` : "",
  ]
    .filter(Boolean)
    .join(";");
  return `<h${heading.level} class="${className}" style="${style}">${escape(heading.text)}</h${heading.level}>`;
}

/** CSS for the frame around each picture, as in the app. */
function frameCss(frame: Frame) {
  switch (frame) {
    case "line":
      return "border:1px solid color-mix(in oklab, var(--fg) 35%, transparent);";
    case "mat":
      return "padding:5%;background:#fbfaf7;border:1px solid rgb(0 0 0 / .08);";
    case "black":
      return "padding:3%;background:#111;";
    default:
      return "";
  }
}

/**
 * A self-contained web page showing the pictures in rows that fill the width, like the app's map,
 * with its background, frames, headings and a full-screen view to step through them.
 */
export function buildWebPage(title: string, pictures: WebPicture[], look: WebPageLook): string {
  const background = look.background ?? "#ffffff";
  const fg = prefersDarkText(background) ? "#18181b" : "#fafafa";
  const items = pictures
    .map((p, i) => {
      // Growing in step with the shape keeps every picture in a row equally tall, like the app's rows.
      const ratio = p.width / Math.max(1, p.height);
      const grow = ratio.toFixed(4);
      const basis = Math.round(ratio * ROW_HEIGHT);
      const page = p.settings?.pageHeading ? headingHtml(p.settings.pageHeading, "page-heading") : "";
      const caption = p.settings?.heading ? headingHtml(p.settings.heading, "caption") : "";
      return (
        page +
        `<figure style="flex:${grow} 1 ${basis}px">${caption}` +
        `<a class="pic" href="${escape(p.file)}" data-i="${i}" style="aspect-ratio:${p.width}/${p.height}">` +
        `<img src="${escape(p.file)}" alt="${escape(p.alt)}" width="${p.width}" height="${p.height}" loading="lazy"></a></figure>`
      );
    })
    .join("\n");
  const shadow =
    look.shadow === "drop"
      ? "box-shadow:0 10px 30px -8px rgb(0 0 0 / .45);"
      : look.shadow === "inset"
        ? "box-shadow:inset 0 0 24px rgb(0 0 0 / .6);"
        : "";
  const radius = look.rounded ? "border-radius:14px;" : "";
  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
:root{--bg:${background};--fg:${fg};--font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font)}
header{padding:48px 24px 8px;max-width:1600px;margin:0 auto}
header h1{margin:0;font-size:2.5rem;font-weight:600}
main{display:flex;flex-wrap:wrap;gap:12px;padding:24px;max-width:1600px;margin:0 auto}
main::after{content:"";flex-grow:999999}
figure{margin:0;min-width:0;display:flex;flex-direction:column;justify-content:flex-end}
.page-heading{flex-basis:100%;margin:32px 0 4px;font-weight:600}
.caption{margin:0 0 6px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pic{display:block;position:relative;overflow:hidden;${frameCss(look.frame)}${radius}${look.shadow === "drop" ? shadow : ""}}
.pic img{display:block;width:100%;height:100%;object-fit:cover;${look.rounded && look.frame !== "none" ? "border-radius:8px;" : ""}}
${look.shadow === "inset" ? `.pic::after{content:"";position:absolute;inset:0;pointer-events:none;${shadow}}` : ""}
#view{position:fixed;inset:0;background:rgb(0 0 0 / .94);display:none;align-items:center;justify-content:center;z-index:10}
#view.open{display:flex}
#view img{max-width:94vw;max-height:90vh;object-fit:contain}
#view button{position:absolute;background:none;border:0;color:#fff;font-size:40px;padding:16px;cursor:pointer;opacity:.75}
#view button:hover{opacity:1}
#prev{left:8px}#next{right:8px}#close{top:8px;right:8px;font-size:32px}
@media (max-width:600px){main{gap:8px;padding:12px}header{padding:32px 12px 0}header h1{font-size:1.8rem}main figure{flex-basis:100%!important}}
</style>
</head>
<body>
<header><h1>${escape(title)}</h1></header>
<main>
${items}
</main>
<div id="view" role="dialog" aria-modal="true" aria-label="Bild">
<button id="prev" aria-label="Föregående">&#8249;</button><img alt=""><button id="next" aria-label="Nästa">&#8250;</button><button id="close" aria-label="Stäng">&#215;</button>
</div>
<script>
(function(){
var links=[].slice.call(document.querySelectorAll(".pic")),view=document.getElementById("view"),img=view.querySelector("img"),at=0;
function show(i){at=(i+links.length)%links.length;img.src=links[at].getAttribute("href");img.alt=links[at].querySelector("img").alt;view.classList.add("open")}
function close(){view.classList.remove("open")}
links.forEach(function(a,i){a.addEventListener("click",function(e){e.preventDefault();show(i)})});
document.getElementById("prev").onclick=function(){show(at-1)};
document.getElementById("next").onclick=function(){show(at+1)};
document.getElementById("close").onclick=close;
view.addEventListener("click",function(e){if(e.target===view)close()});
document.addEventListener("keydown",function(e){if(!view.classList.contains("open"))return;if(e.key==="Escape")close();else if(e.key==="ArrowLeft")show(at-1);else if(e.key==="ArrowRight")show(at+1)});
})();
</script>
</body>
</html>
`;
}

/** A name safe as a folder or file name on any web host: plain letters, digits and dashes. */
export function webName(name: string): string {
  const plain = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return plain || "bilder";
}

/** Longest side of the pictures on the page: sharp on large screens, quick to load. */
export const WEB_PICTURE_SIDE = 2048;

/**
 * The page's pictures in order, each with its copy's file name in the page's folder and the size it is made at.
 * Pictures are never made larger than the original.
 */
export function pagePictures(
  images: ImageEntry[],
  settingsOf: (image: ImageEntry) => ImageSettings | undefined,
): { pictures: WebPicture[]; files: WebPictureFile[] } {
  const pictures: WebPicture[] = [];
  const files: WebPictureFile[] = [];
  images.forEach((image, i) => {
    const longest = Math.max(image.width, image.height, 1);
    const size = Math.min(WEB_PICTURE_SIDE, longest);
    const scale = size / longest;
    const stem = image.name.replace(/\.[^.]+$/, "");
    const file = `bilder/${String(i + 1).padStart(3, "0")}-${webName(stem)}.jpg`;
    pictures.push({
      file,
      width: Math.max(1, Math.round(image.width * scale)),
      height: Math.max(1, Math.round(image.height * scale)),
      alt: stem,
      settings: settingsOf(image),
    });
    files.push({ path: image.path, file, size });
  });
  return { pictures, files };
}

const HOST_KEY = "image-browser:web-host";

export function loadWebHost(): WebHost | null {
  try {
    const raw = localStorage.getItem(HOST_KEY);
    return raw ? (JSON.parse(raw) as WebHost) : null;
  } catch {
    return null;
  }
}

export function saveWebHost(host: WebHost) {
  localStorage.setItem(HOST_KEY, JSON.stringify(host));
}
