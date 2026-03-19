const HTML_FILE_PATTERN = /\.html?$/i;
const SCRIPT_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/i;
const MARKDOWN_FILE_PATTERN = /\.mdx?$/i;

interface FileSummaryOptions {
  maxChars?: number;
}

function uniqueValues(values: Iterable<string>, limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

function matchValues(
  content: string,
  regex: RegExp,
  map: (match: RegExpExecArray) => string | string[] | null,
  limit: number,
): string[] {
  const values: string[] = [];
  const pattern = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const mapped = map(match);
    if (Array.isArray(mapped)) {
      values.push(...mapped);
    } else if (mapped) {
      values.push(mapped);
    }
  }

  return uniqueValues(values, limit);
}

function collapseWhitespace(value: string): string {
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function buildHeadTailExcerpt(content: string, headChars: number, tailChars: number): string {
  const normalized = collapseWhitespace(content);
  if (!normalized) return '(empty)';
  if (normalized.length <= headChars + tailChars + 80) {
    return normalized;
  }

  return [
    '[head]',
    normalized.slice(0, headChars).trim(),
    '...',
    '[tail]',
    normalized.slice(-tailChars).trim(),
  ].join('\n');
}

function clipSummary(summary: string, maxChars: number): string {
  if (summary.length <= maxChars) return summary;

  const headChars = Math.max(200, Math.floor(maxChars * 0.58));
  const tailChars = Math.max(160, maxChars - headChars - 16);

  return [
    summary.slice(0, headChars).trimEnd(),
    '...',
    summary.slice(-tailChars).trimStart(),
  ].join('\n');
}

function summarizeMarkdown(path: string, content: string, maxChars: number): string {
  const compact = maxChars <= 2600;
  const headings = matchValues(
    content,
    /^#{1,6}\s+(.+)$/gm,
    (match) => match[1].trim(),
    compact ? 6 : 10,
  );

  const sections = [
    `File: ${path}`,
    `Type: markdown`,
    `Chars: ${content.length}`,
  ];

  if (headings.length > 0) {
    sections.push(`Headings: ${headings.join(', ')}`);
  }

  sections.push(
    'Excerpt:',
    buildHeadTailExcerpt(content, compact ? 500 : 900, compact ? 700 : 1200),
  );

  return clipSummary(sections.join('\n'), maxChars);
}

function summarizeHtml(path: string, content: string, maxChars: number): string {
  const compact = maxChars <= 2600;
  const title = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim();
  const ids = matchValues(content, /\bid=(["'])([^"']+)\1/gi, (match) => match[2], compact ? 8 : 14);
  const classes = matchValues(
    content,
    /\bclass=(["'])([^"']+)\1/gi,
    (match) => match[2].split(/\s+/).filter(Boolean),
    compact ? 10 : 16,
  );
  const eventHints = uniqueValues([
    ...matchValues(
      content,
      /([A-Za-z0-9_$.]+)\.addEventListener\(\s*['"`]([^'"`]+)['"`]/g,
      (match) => `${match[1]}.addEventListener("${match[2]}")`,
      compact ? 6 : 10,
    ),
    ...matchValues(
      content,
      /\b(onclick|onchange|onsubmit|onload|oninput|onkeydown|onkeyup|onmouseenter|onmouseleave)\s*=/gi,
      (match) => match[1],
      compact ? 4 : 8,
    ),
  ], compact ? 8 : 12);

  const inlineScripts = Array.from(
    content.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi),
  )
    .map((match) => collapseWhitespace(match[1]))
    .filter(Boolean);

  const scriptIndexes = inlineScripts.length <= 2
    ? inlineScripts.map((_, index) => index)
    : compact
      ? [inlineScripts.length - 1]
      : [0, inlineScripts.length - 2, inlineScripts.length - 1];

  const sections = [
    `File: ${path}`,
    `Type: html`,
    `Chars: ${content.length}`,
  ];

  if (title) {
    sections.push(`Title: ${title}`);
  }
  if (ids.length > 0) {
    sections.push(`Key DOM ids: ${ids.join(', ')}`);
  }
  if (classes.length > 0) {
    sections.push(`Key DOM classes: ${classes.join(', ')}`);
  }
  if (eventHints.length > 0) {
    sections.push(`Event listener hints: ${eventHints.join(', ')}`);
  }

  if (scriptIndexes.length > 0) {
    sections.push('Inline scripts:');
    for (const index of scriptIndexes) {
      sections.push(
        `Script ${index + 1}:`,
        buildHeadTailExcerpt(
          inlineScripts[index],
          compact ? 260 : 520,
          compact ? 420 : 760,
        ),
      );
    }
  }

  sections.push(
    'HTML excerpt:',
    buildHeadTailExcerpt(content, compact ? 420 : 760, compact ? 700 : 1200),
  );

  return clipSummary(sections.join('\n'), maxChars);
}

function summarizeScript(path: string, content: string, maxChars: number): string {
  const compact = maxChars <= 2600;
  const exports = uniqueValues([
    ...matchValues(content, /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm, (match) => `function ${match[1]}`, 8),
    ...matchValues(content, /^\s*export\s+class\s+([A-Za-z0-9_$]+)/gm, (match) => `class ${match[1]}`, 6),
    ...matchValues(content, /^\s*export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm, (match) => `value ${match[1]}`, 8),
    ...matchValues(content, /^\s*export\s*\{([^}]+)\}/gm, (match) => `exports {${match[1].replace(/\s+/g, ' ').trim()}}`, 4),
  ], compact ? 8 : 12);

  const signatures = uniqueValues([
    ...matchValues(content, /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\([^)]*\)/gm, (match) => match[0], 10),
    ...matchValues(content, /^\s*(?:export\s+)?class\s+[A-Za-z0-9_$]+(?:\s+extends\s+[A-Za-z0-9_$]+)?/gm, (match) => match[0], 8),
    ...matchValues(content, /^\s*(?:export\s+)?(?:const|let|var)\s+[A-Za-z0-9_$]+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/gm, (match) => match[0], 10),
  ], compact ? 10 : 16);

  const sections = [
    `File: ${path}`,
    `Type: script`,
    `Chars: ${content.length}`,
  ];

  if (exports.length > 0) {
    sections.push(`Exports: ${exports.join(', ')}`);
  }
  if (signatures.length > 0) {
    sections.push('Key signatures:', ...signatures);
  }

  sections.push(
    'Code excerpt:',
    buildHeadTailExcerpt(content, compact ? 500 : 900, compact ? 800 : 1400),
  );

  return clipSummary(sections.join('\n'), maxChars);
}

function summarizeGeneric(path: string, content: string, maxChars: number): string {
  const compact = maxChars <= 2600;

  return clipSummary([
    `File: ${path}`,
    `Chars: ${content.length}`,
    'Excerpt:',
    buildHeadTailExcerpt(content, compact ? 600 : 1000, compact ? 900 : 1400),
  ].join('\n'), maxChars);
}

export function summarizeFileContent(
  path: string,
  content: string,
  options: FileSummaryOptions = {},
): string {
  const normalizedPath = path.toLowerCase();
  const maxChars = Math.max(1200, options.maxChars ?? 5000);

  if (HTML_FILE_PATTERN.test(normalizedPath)) {
    return summarizeHtml(path, content, maxChars);
  }

  if (SCRIPT_FILE_PATTERN.test(normalizedPath)) {
    return summarizeScript(path, content, maxChars);
  }

  if (MARKDOWN_FILE_PATTERN.test(normalizedPath)) {
    return summarizeMarkdown(path, content, maxChars);
  }

  return summarizeGeneric(path, content, maxChars);
}
