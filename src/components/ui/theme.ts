// Theme and surface preferences. Stored per browser; the boot script in the
// root layout applies them before first paint so there is no flash.

import { useCallback, useSyncExternalStore } from "react";

import { SOLID_STORAGE_KEY, THEME_STORAGE_KEY } from "./theme-boot";

export type Theme = "dark" | "light";

const CHANGE_EVENT = "rassam:appearance";

function root(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.documentElement;
}

export function currentTheme(): Theme {
  return root()?.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme): void {
  root()?.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Persisting the preference is a convenience only.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function solidSurfaces(): boolean {
  return root()?.getAttribute("data-solid") === "true";
}

export function setSolidSurfaces(solid: boolean): void {
  const element = root();
  if (!element) return;
  if (solid) element.setAttribute("data-solid", "true");
  else element.removeAttribute("data-solid");
  try {
    window.localStorage.setItem(SOLID_STORAGE_KEY, solid ? "true" : "false");
  } catch {
    // Persisting the preference is a convenience only.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Current theme and surface preference, with setters. The server snapshot is the dark default. */
export function useAppearance() {
  const theme = useSyncExternalStore<Theme>(subscribe, currentTheme, () => "dark");
  const solid = useSyncExternalStore(subscribe, solidSurfaces, () => false);
  const toggleTheme = useCallback(() => setTheme(currentTheme() === "dark" ? "light" : "dark"), []);
  return { theme, solid, setTheme, toggleTheme, setSolidSurfaces };
}
