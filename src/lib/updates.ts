import { useEffect, useRef } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";

/** A version that can be installed. */
export interface FoundUpdate {
  version: string;
  notes?: string | null;
}

/** A pull request build, to try a change before it is merged. */
export interface TestVersion {
  tag: string;
  title: string;
  date: string;
}

const demo = !isTauri();
/** Which test version is installed, if any; cleared again when a main version is installed. */
const TEST_KEY = "imagime:test-version";
/** How long between automatic checks while the app stays open. */
const CHECK_EVERY_MS = 30 * 60 * 1000;

export async function currentVersion(): Promise<string> {
  return demo ? "0.1.0" : getVersion();
}

export async function canUpdate(): Promise<boolean> {
  return demo ? false : invoke<boolean>("can_update");
}

/**
 * Looks for a version to install: the test version `tag`, or else the newest main version. With
 * `anyVersion` it is offered even when it is older than this one (to go back from a test version).
 */
export async function checkUpdate(tag: string | null = null, anyVersion = false): Promise<FoundUpdate | null> {
  if (demo) return null;
  return invoke<FoundUpdate | null>("check_update", { tag, anyVersion });
}

/** Installs what the last check found and restarts into it; the promise only settles on failure. */
export async function installUpdate(tag: string | null, onProgress: (share: number | null) => void): Promise<void> {
  const unlisten = await listen<{ done: number; total: number | null }>("update-progress", (e) =>
    onProgress(e.payload.total ? Math.min(1, e.payload.done / e.payload.total) : null),
  );
  try {
    rememberTestVersion(tag);
    await invoke("install_update");
  } catch (e) {
    rememberTestVersion(installedTestVersion());
    throw e;
  } finally {
    unlisten();
  }
}

export async function testVersions(): Promise<TestVersion[]> {
  return demo ? [] : invoke<TestVersion[]>("test_versions");
}

export function installedTestVersion(): string | null {
  try {
    return localStorage.getItem(TEST_KEY);
  } catch {
    return null;
  }
}

function rememberTestVersion(tag: string | null) {
  try {
    if (tag) localStorage.setItem(TEST_KEY, tag);
    else localStorage.removeItem(TEST_KEY);
  } catch {
    // Only used to offer the way back to the main version.
  }
}

/**
 * Looks for a newer main version a little after start and then at most every half hour when the window
 * comes back, and calls `onFound` once for each new version. `onMenu` runs for the app menu's
 * "Sök efter uppdateringar…".
 */
export function useUpdateCheck(onFound: (update: FoundUpdate) => void, onMenu: () => void) {
  const found = useRef(onFound);
  const menu = useRef(onMenu);
  found.current = onFound;
  menu.current = onMenu;

  useEffect(() => {
    if (demo) return;
    let last = 0;
    let told = "";
    let stopped = false;
    const look = async () => {
      if (Date.now() - last < CHECK_EVERY_MS) return;
      last = Date.now();
      try {
        if (!(await canUpdate())) return;
        const update = await checkUpdate();
        if (!stopped && update && update.version !== told) {
          told = update.version;
          found.current(update);
        }
      } catch {
        // No network or no release yet: the menu item still says what went wrong.
      }
    };
    const first = setTimeout(look, 4000);
    window.addEventListener("focus", look);
    const unlisten = listen("open-updates", () => menu.current());
    return () => {
      stopped = true;
      clearTimeout(first);
      window.removeEventListener("focus", look);
      unlisten.then((stop) => stop());
    };
  }, []);
}
