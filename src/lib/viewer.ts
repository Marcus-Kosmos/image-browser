import { useCallback, useState } from "react";

/** How the next image comes in when stepping in full screen. */
export type ViewerTransition =
  | "none"
  | "fade"
  | "slide-left"
  | "slide-right"
  | "rise"
  | "cascade"
  | "parallax"
  | "auto";
export type ViewerEffect = Exclude<ViewerTransition, "auto">;

export const VIEWER_TRANSITIONS: ViewerTransition[] = [
  "none",
  "fade",
  "slide-left",
  "slide-right",
  "rise",
  "cascade",
  "parallax",
  "auto",
];

export const VIEWER_TRANSITION_LABELS: Record<ViewerTransition, string> = {
  none: "Ingen övergång",
  fade: "Tona fram",
  "slide-left": "Glid in från vänster",
  "slide-right": "Glid in från höger",
  rise: "Glid upp",
  cascade: "Kaskad",
  parallax: "Parallax",
  auto: "Växla automatiskt",
};

export interface ViewerSettings {
  transition: ViewerTransition;
  /** Draw the folder's frame and shadow around the picture. */
  frame: boolean;
  /** Use the folder's background color instead of black. */
  background: boolean;
}

export const DEFAULT_VIEWER_SETTINGS: ViewerSettings = { transition: "fade", frame: false, background: false };

const STORAGE = "image-browser:viewer";

/** A calm fade every so often, so not every step slides. */
const AUTO_CYCLE: ViewerEffect[] = ["fade", "slide-right", "rise", "fade", "slide-left", "parallax", "fade", "cascade"];

/** The effect for the `step`th image shown since the viewer opened. */
export function resolveTransition(transition: ViewerTransition, step: number): ViewerEffect {
  return transition === "auto" ? AUTO_CYCLE[step % AUTO_CYCLE.length] : transition;
}

function load(): ViewerSettings {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return { ...DEFAULT_VIEWER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // Fall back to defaults if storage is unavailable or the value is corrupt.
  }
  return DEFAULT_VIEWER_SETTINGS;
}

/** Full screen look, the same for every folder. */
export function useViewerSettings() {
  const [settings, setSettings] = useState(load);
  const update = useCallback((change: Partial<ViewerSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...change };
      try {
        localStorage.setItem(STORAGE, JSON.stringify(next));
      } catch {
        // A convenience; ignore storage failures.
      }
      return next;
    });
  }, []);
  return { settings, update };
}
