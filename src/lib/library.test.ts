import { describe, expect, it } from "vitest";
import type { ImageEntry } from "./api";
import {
  EMPTY_LIBRARY,
  addToFavorites,
  addToSeries,
  createSeries,
  deleteSeries,
  forgetFolders,
  rememberFolders,
  moveInSeries,
  privacyOf,
  setPrivacy,
  removeFromFavorites,
  removeFromSeries,
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

  it("takes several images out of the favorites at once", () => {
    let lib = toggleFavorite(EMPTY_LIBRARY, a);
    lib = toggleFavorite(lib, b);
    lib = toggleFavorite(lib, c);
    lib = removeFromFavorites(lib, [a, c, img("/z/not-a-favorite.jpg")]);
    expect(lib.favorites.map((i) => i.path)).toEqual([b.path]);
  });

  it("takes images out of one series and leaves the others and the favorites alone", () => {
    let lib = createSeries(EMPTY_LIBRARY, "s1", "Resa", [a, b, c]);
    lib = createSeries(lib, "s2", "Hem", [a]);
    lib = toggleFavorite(lib, a);
    lib = removeFromSeries(lib, "s1", [a, c]);
    expect(lib.series[0].images.map((i) => i.path)).toEqual([b.path]);
    expect(lib.series[1].images.map((i) => i.path)).toEqual([a.path]);
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

  it("moves an image to a new place in a series", () => {
    const lib = createSeries(EMPTY_LIBRARY, "s1", "Resa", [a, b, c]);
    const order = (l: typeof lib) => l.series[0].images.map((i) => i.path);
    expect(order(moveInSeries(lib, "s1", 0, 2))).toEqual([b.path, a.path, c.path]);
    expect(order(moveInSeries(lib, "s1", 0, 3))).toEqual([b.path, c.path, a.path]);
    expect(order(moveInSeries(lib, "s1", 2, 0))).toEqual([c.path, a.path, b.path]);
    expect(moveInSeries(lib, "s1", 1, 1).series[0]).toBe(lib.series[0]);
    expect(order(moveInSeries(lib, "s1", 1, 2))).toEqual([a.path, b.path, c.path]);
  });

  it("hides and locks the favorites or a series, and keeps that when an image is trashed", () => {
    let lib = createSeries(toggleFavorite(EMPTY_LIBRARY, a), "s1", "Resa", [a, b]);
    lib = setPrivacy(lib, { kind: "series", id: "s1" }, { hidden: true });
    lib = setPrivacy(lib, { kind: "series", id: "s1" }, { locked: true });
    lib = setPrivacy(lib, { kind: "favorites" }, { locked: true });
    lib = removeImage(lib, a.path);
    expect(privacyOf(lib, { kind: "series", id: "s1" })).toMatchObject({ hidden: true, locked: true });
    expect(privacyOf(lib, { kind: "favorites" })).toEqual({ locked: true });
    expect(privacyOf(lib, { kind: "folders" })).toEqual({});
  });

  it("adds dropped images without removing ones already there", () => {
    let lib = addToFavorites(toggleFavorite(EMPTY_LIBRARY, a), [a, b]);
    expect(lib.favorites.map((i) => i.path)).toEqual([a.path, b.path]);
    lib = addToSeries(createSeries(lib, "s1", "Resa", [b]), "s1", [b, c]);
    expect(lib.series[0].images.map((i) => i.path)).toEqual([b.path, c.path]);
  });

  it("numbers new series names that are already taken", () => {
    let lib = createSeries(EMPTY_LIBRARY, "s1", "Resa", []);
    expect(uniqueSeriesName(lib, "Studio")).toBe("Studio");
    expect(uniqueSeriesName(lib, "Resa")).toBe("Resa 2");
    lib = createSeries(lib, "s2", "Resa 2", []);
    expect(uniqueSeriesName(lib, "Resa")).toBe("Resa 3");
  });

  it("remembers opened folders in order and forgets them", () => {
    let lib = rememberFolders(EMPTY_LIBRARY, ["/Downloads"]);
    lib = rememberFolders(lib, ["/Arkiv"]);
    lib = rememberFolders(lib, ["/Downloads"]);
    expect(lib.recent).toEqual([["/Downloads"], ["/Arkiv"]]);
    lib = rememberFolders(lib, ["/b", "/a"]);
    expect(rememberFolders(lib, ["/a", "/b"])).toBe(lib);
    lib = forgetFolders(lib, ["/Downloads"]);
    expect(lib.recent).toEqual([["/Arkiv"], ["/b", "/a"]]);
  });

  it("keeps the full screen look a series was saved with", () => {
    const look = { transition: "fade" as const, keepZoom: false, pinSize: "puzzle" as const, frame: true, background: true, rounded: true, captionPlace: "above" as const, captionEffect: "fade" as const, captionSize: "normal" as const, screen: "margins" as const };
    const lib = createSeries(EMPTY_LIBRARY, "p", "Pussel", [a, b], look);
    expect(lib.series[0].look).toEqual(look);
    expect(createSeries(EMPTY_LIBRARY, "q", "Utan", [a]).series[0]).not.toHaveProperty("look");
  });
});
