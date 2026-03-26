import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSystemMessage } from "./ai";

test("buildSystemMessage includes requested file lines for line-specific questions", () => {
  const system = buildSystemMessage(
    null,
    null,
    null,
    null,
    {
      path: "chatbot.py",
      resolvedPath: "chatbot.py",
      content: "line one\nline two\nline three",
      resolutionStrategy: "exact",
    },
    "what is in line 2 in chatbot.py?",
    null,
  );

  assert.match(system, /REQUESTED FILE LINES \(chatbot\.py\):/);
  assert.match(system, /2: line two/);
});
