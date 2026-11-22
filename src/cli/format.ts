// JSON output shared by commands that support --format json.

export function renderJsonText(value: unknown): string {
  return `${JSON.stringify(value ?? null, null, 2)}\n`;
}
