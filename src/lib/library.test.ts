import { describe, expect, it } from "vitest";
import type { ImageEntry } from "./api";
import {
  EMPTY_LIBRARY,
  createSeries,
  deleteSeries,
  removeImage,
  renameSeries,
  toggleFavorite,
  toggleInSeries,
  uniqueSeriesName,
} from "./library";

const img = (path: string): ImageEntry => ({ path, name: path.split("/").pop()!, width: 3, height: 2, size: 1, modified: 0 });
const a = img("/x/a.jpg");
const b = img("/x/b.jpg");
const c = img("/y/c.jpg");

describe("library", () => {
  it("toggles favorites and keeps the order they were added", () => {
    let lib = toggleFavorite(EMPTY_LIBRARY, b);
    lib = toggleFavorite(lib, a);
    expect(lib.favorites.map((i) => i.path)).toEqual([b.path, a.path]);
    lib = toggleFavorite(lib, b);
    expect(lib.favorites.map((i) => i.path)).toEqual([a.path]);
  });

  it("creates, renames and deletes series", () => {
    let lib = createSeries(EMPTY_LIBRARY, "s1", "Resa", [a, b, a]);
    expect(lib.series[0].images.map((i) => i.path)).toEqual([a.path, b.path]);
    lib = renameSeries(lib, "s1", "Resa 2025");
    expect(lib.series[0].name).toBe("Resa 2025");
    lib = deleteSeries(lib, "s1");
    expect(lib.series).toEqual([]);
  });

  it("adds an image to the end of a series and removes it again", () => {
    let lib = createSeries(EMPTY_LIBRARY, "s1", "Resa", [a]);
    lib = toggleInSeries(lib, "s1", c);
    expect(lib.series[0].images.map((i) => i.path)).toEqual([a.path, c.path]);
    lib = toggleInSeries(lib, "s1", a);
    expect(lib.series[0].images.map((i) => i.path)).toEqual([c.path]);
  });

  it("forgets a trashed image in favorites and every series", () => {
    let lib = toggleFavorite(EMPTY_LIBRARY, a);
    lib = createSeries(lib, "s1", "Ett", [a, b]);
    lib = createSeries(lib, "s2", "Två", [a]);
    lib = removeImage(lib, a.path);
    expect(lib.favorites).toEqual([]);
    expect(lib.series.map((s) => s.images.length)).toEqual([1, 0]);
  });

  it("numbers new series names that are already taken", () => {
    let lib = createSeries(EMPTY_LIBRARY, "s1", "Resa", []);
    expect(uniqueSeriesName(lib, "Studio")).toBe("Studio");
    expect(uniqueSeriesName(lib, "Resa")).toBe("Resa 2");
    lib = createSeries(lib, "s2", "Resa 2", []);
    expect(uniqueSeriesName(lib, "Resa")).toBe("Resa 3");
  });
});
