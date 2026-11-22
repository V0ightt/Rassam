import { clsx, type ClassValue } from "clsx";

/** Class joiner for token-based components (no merging: token utilities such as `text-meta` and `text-fg` must both survive). */
export function cx(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
