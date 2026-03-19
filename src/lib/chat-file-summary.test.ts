import assert from "node:assert/strict";
import { test } from "node:test";

import { summarizeFileContent } from "./chat-file-summary";

test("summarizeFileContent for html keeps bottom script context", () => {
  const html = [
    "<!doctype html>",
    "<html>",
    "<head>",
    "<title>Iraq ASCII</title>",
    "</head>",
    "<body>",
    '<main id="app-root" class="page shell">',
    `${"HEADER_FILLER\n".repeat(400)}`,
    "</main>",
    "<script>",
    "const button = document.getElementById('run-button');",
    "button.addEventListener('click', () => console.log('BOTTOM_SCRIPT_MARKER'));",
    "document.addEventListener('DOMContentLoaded', init);",
    "</script>",
    "</body>",
    "</html>",
  ].join("\n");

  const summary = summarizeFileContent("pages/iraq-ascii.html", html, { maxChars: 2600 });

  assert.match(summary, /Iraq ASCII/);
  assert.match(summary, /app-root/);
  assert.match(summary, /BOTTOM_SCRIPT_MARKER/);
  assert.match(summary, /addEventListener\("click"\)/);
});
