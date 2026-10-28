import { describe, expect, it } from "vitest";
import type { ImageEntry } from "./api";
import { buildWebPage, pagePictures, webName } from "./webpage";

const image = (name: string, width: number, height: number): ImageEntry => ({
  path: `/Bilder/${name}`,
  name,
  width,
  height,
  size: 1,
  modified: 0,
});

describe("webName", () => {
  it("makes plain folder names from any title", () => {
    expect(webName("Sommaren på Öland 2026!")).toBe("sommaren-pa-oland-2026");
    expect(webName("  ")).toBe("bilder");
  });
});

describe("pagePictures", () => {
  it("numbers the copies and never makes them larger than the original", () => {
    const { pictures, files } = pagePictures(
      [image("Strand.JPG", 6000, 4000), image("liten.png", 800, 600)],
      () => undefined,
    );
    expect(files).toEqual([
      { path: "/Bilder/Strand.JPG", file: "bilder/001-strand.jpg", size: 2048 },
      { path: "/Bilder/liten.png", file: "bilder/002-liten.jpg", size: 800 },
    ]);
    expect(pictures[0]).toMatchObject({ width: 2048, height: 1365, alt: "Strand" });
    expect(pictures[1]).toMatchObject({ width: 800, height: 600 });
  });
});

describe("buildWebPage", () => {
  it("escapes titles and headings and links each picture to its copy", () => {
    const { pictures } = pagePictures([image("a.jpg", 300, 200)], () => ({
      heading: { text: "Kväll <vid> sjön", level: 2 },
    }));
    const html = buildWebPage('Resa & "mer"', pictures, { frame: "mat", shadow: "drop", rounded: false });
    expect(html).toContain("<title>Resa &amp; &quot;mer&quot;</title>");
    expect(html).toContain("Kväll &lt;vid&gt; sjön");
    expect(html).toContain('href="bilder/001-a.jpg"');
    expect(html).not.toContain("<vid>");
  });
});
