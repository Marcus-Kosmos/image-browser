import { describe, expect, it } from "vitest";
import type { ImageEntry } from "./api";
import { NO_FILTER, filterImages, keepDuplicates, libraryIndex, possibleDuplicates } from "./filter";
import { EMPTY_LIBRARY, createSeries, setPrivacy, toggleFavorite } from "./library";

const NOW = new Date("2026-10-27T12:00:00").getTime();
const DAY = 24 * 60 * 60 * 1000;
const img = (name: string, modifiedDaysAgo: number): ImageEntry => ({
  path: `/Bilder/${name}`,
  name,
  width: 3,
  height: 2,
  size: 1,
  modified: (NOW - modifiedDaysAgo * DAY) / 1000,
});
const sea = img("hav.jpg", 400);
const forest = img("skog.jpg", 2);
const city = img("stad.jpg", 40);

describe("filter", () => {
  let lib = createSeries(toggleFavorite(EMPTY_LIBRARY, sea), "s1", "Sommar", [sea, forest]);
  lib = { ...lib, favorites: lib.favorites.map((i) => ({ ...i, added: NOW - 3 * DAY })) };
  const index = libraryIndex(lib, false);
  const names = (f: Partial<typeof NO_FILTER>) => filterImages([sea, forest, city], { ...NO_FILTER, ...f }, index, NOW).map((i) => i.name);

  it("matches names and tag names, ignoring case", () => {
    expect(names({ text: "SKOG" })).toEqual(["skog.jpg"]);
    expect(names({ text: "somm" })).toEqual(["hav.jpg", "skog.jpg"]);
    expect(names({})).toEqual(["hav.jpg", "skog.jpg", "stad.jpg"]);
  });

  it("keeps images that carry every chosen tag", () => {
    expect(names({ tags: ["series:s1"] })).toEqual(["hav.jpg", "skog.jpg"]);
    expect(names({ tags: ["series:s1", "favorites"] })).toEqual(["hav.jpg"]);
  });

  it("dates by when an image was added, else by the file", () => {
    // hav.jpg is a year old as a file but became a favorite three days ago.
    expect(names({ since: "week" })).toEqual(["hav.jpg", "skog.jpg"]);
    expect(names({ since: "month" })).toEqual(["hav.jpg", "skog.jpg"]);
    expect(names({ since: "year" })).toEqual(["hav.jpg", "skog.jpg", "stad.jpg"]);
  });

  it("leaves out the tags of hidden series unless they are shown", () => {
    const hidden = setPrivacy(lib, { kind: "series", id: "s1" }, { hidden: true });
    expect(libraryIndex(hidden, false).tags.get(forest.path)).toBeUndefined();
    expect(libraryIndex(hidden, true).tags.get(forest.path)?.map((t) => t.name)).toEqual(["Sommar"]);
  });
});

describe("newest first and duplicates", () => {
  const img = (name: string, size: number, modified: number): ImageEntry => ({
    path: `/p/${name}`,
    name,
    width: 100,
    height: 80,
    size,
    modified,
  });
  const a = img("a.jpg", 10, 300);
  const b = img("b.jpg", 20, 100);
  const aCopy = img("a kopia.jpg", 10, 200);
  const sameSize = img("c.jpg", 10, 50);
  const empty = libraryIndex(EMPTY_LIBRARY, true);

  it("sorts on when the file was last changed, newest first", () => {
    const sorted = filterImages([b, a, aCopy], { ...NO_FILTER, newestFirst: true }, empty);
    expect(sorted.map((i) => i.name)).toEqual(["a.jpg", "a kopia.jpg", "b.jpg"]);
  });

  it("compares contents only of pictures of the same size", () => {
    expect(possibleDuplicates([a, b, aCopy, sameSize]).map((i) => i.name)).toEqual(["a.jpg", "a kopia.jpg", "c.jpg"]);
  });

  it("keeps the copies, side by side", () => {
    const hashes = new Map([
      [a.path, "x"],
      [aCopy.path, "x"],
      [sameSize.path, "y"],
    ]);
    expect(keepDuplicates([a, b, sameSize, aCopy], hashes).map((i) => i.name)).toEqual(["a.jpg", "a kopia.jpg"]);
  });
});
