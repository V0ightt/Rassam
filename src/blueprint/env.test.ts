import { describe, it, expect } from "vitest";

import { extractEnvRefs, isSecretLikeName } from "./env";
import type { Language } from "./types";

const refs = (content: string, language: Language | null, path = "src/file"): Array<[string, number]> =>
  extractEnvRefs(path, content, language).map((ref) => [ref.name, ref.line]);

describe("isSecretLikeName", () => {
  it.each([
    "GITHUB_TOKEN",
    "CLIENT_SECRET",
    "DB_PASSWORD",
    "MYSQL_PASSWD",
    "OPENAI_API_KEY",
    "STRIPE_APIKEY",
    "JWT_PRIVATE_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "AWS_CREDENTIAL",
    "BASIC_AUTH",
    "AUTHORIZATION",
    "OAUTH_CLIENT_ID",
    "SENTRY_DSN",
    "DATABASE_URL",
    "AZURE_CONNECTION_STRING",
    "AWS_ACCESS_KEY_ID",
    "COOKIE_SIGNING_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "SESSION_KEY",
    "github_token",
    "apiKey",
    "x-api-key",
    "Authorization",
  ])("flags %s", (name) => {
    expect(isSecretLikeName(name)).toBe(true);
  });

  it.each([
    "NODE_ENV",
    "PORT",
    "PWD",
    "AUTHOR",
    "GIT_AUTHOR_NAME",
    "CERT_AUTHORITY",
    "LOG_LEVEL",
    "KEYBOARD_LAYOUT",
    "MAX_TOKENS",
    "LLM_MAX_OUTPUT_TOKENS",
    "TOKEN_LIMIT",
    "ADSNAME",
    "OLLAMA_BASE_URL",
  ])("does not flag %s", (name) => {
    expect(isSecretLikeName(name)).toBe(false);
  });

  it("treats public prefixes as non-secret unless the rest is clearly a secret", () => {
    expect(isSecretLikeName("NEXT_PUBLIC_API_KEY")).toBe(false);
    expect(isSecretLikeName("NEXT_PUBLIC_AUTH_URL")).toBe(false);
    expect(isSecretLikeName("VITE_PUBLIC_MAPBOX_TOKEN")).toBe(false);
    expect(isSecretLikeName("NEXT_PUBLIC_SENTRY_DSN")).toBe(false);
    expect(isSecretLikeName("NEXT_PUBLIC_CLIENT_SECRET")).toBe(true);
    expect(isSecretLikeName("VITE_PUBLIC_DB_PASSWORD")).toBe(true);
    expect(isSecretLikeName("NEXT_PUBLIC_DATABASE_URL")).toBe(true);
  });
});

describe("extractEnvRefs: JavaScript / TypeScript", () => {
  it("finds dot, bracket, import.meta, Deno and Bun reads with exact lines", () => {
    const content = [
      "const a = process.env.GITHUB_TOKEN;",
      "const b = process.env[\"OPENAI_API_KEY\"];",
      "const c = process.env['PORT'] ?? 3000;",
      "",
      "const d = import.meta.env.VITE_API_URL;",
      "const e = Deno.env.get(\"DENO_KEY\");",
      "const f = Bun.env.BUN_SECRET;",
      "const g = process.env?.OPTIONAL;",
      "const h = `${process.env.IN_TEMPLATE}/x`;",
    ].join("\n");
    expect(refs(content, "typescript")).toEqual([
      ["GITHUB_TOKEN", 1],
      ["OPENAI_API_KEY", 2],
      ["PORT", 3],
      ["VITE_API_URL", 5],
      ["DENO_KEY", 6],
      ["BUN_SECRET", 7],
      ["OPTIONAL", 8],
      ["IN_TEMPLATE", 9],
    ]);
  });

  it("sets file and secretLike", () => {
    const result = extractEnvRefs("src/a.ts", "process.env.GITHUB_TOKEN; process.env.PORT;", "typescript");
    expect(result).toEqual([
      { file: "src/a.ts", name: "GITHUB_TOKEN", line: 1, secretLike: true },
      { file: "src/a.ts", name: "PORT", line: 1, secretLike: false },
    ]);
  });

  it("handles single-line and multi-line destructuring with aliases and defaults", () => {
    const content = [
      "const { A, B: b, C = \"d\" } = process.env;",
      "const {",
      "  DATABASE_URL,",
      "  REDIS_URL: redis,",
      "  REGION = \"eu, west\",",
      "  ...rest",
      "} = process.env;",
      "let { VITE_MODE } = import.meta.env;",
      "const { length } = process.env.PATH_LIST;",
    ].join("\n");
    expect(refs(content, "javascript")).toEqual([
      ["A", 1],
      ["B", 1],
      ["C", 1],
      ["DATABASE_URL", 3],
      ["REDIS_URL", 4],
      ["REGION", 5],
      ["VITE_MODE", 8],
      ["PATH_LIST", 9],
    ]);
  });

  it("ignores comments but not strings that look like comments", () => {
    const content = [
      "// process.env.COMMENTED",
      "const url = \"http://example.com\"; const x = process.env.AFTER_URL;",
      "/* process.env.BLOCK",
      "   process.env.BLOCK_TWO */ const y = process.env.AFTER_BLOCK;",
      "const z = process.env.REAL; // process.env.TRAILING",
      "/**",
      " * @example process.env.DOC",
      " */",
      "const w = process.env.LAST;",
    ].join("\n");
    expect(refs(content, "typescript")).toEqual([
      ["AFTER_URL", 2],
      ["AFTER_BLOCK", 4],
      ["REAL", 5],
      ["LAST", 9],
    ]);
  });

  it("skips writes, dedupes per (name, line) and sorts by line then name", () => {
    const content = [
      "process.env.NODE_ENV = \"test\";",
      "process.env[\"WRITTEN\"] = \"1\";",
      "if (process.env.MODE === \"x\" && process.env.MODE) {}",
      "const v = process.env.ZED || process.env.ALPHA;",
    ].join("\n");
    expect(refs(content, "typescript")).toEqual([
      ["MODE", 3],
      ["ALPHA", 4],
      ["ZED", 4],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(refs("// c\r\n\r\nconst a = process.env.CRLF_VAR;\r\n", "typescript")).toEqual([["CRLF_VAR", 3]]);
  });

  it("uses the JS patterns when the language is unknown", () => {
    const content = ["x = os.getenv(\"PY_TWO\")", "y = process.env.JS_ONE", "// process.env.COMMENTED"].join("\n");
    expect(refs(content, null)).toEqual([["JS_ONE", 2]]);
  });

  it("returns [] for empty content", () => {
    expect(extractEnvRefs("a.ts", "", "typescript")).toEqual([]);
  });
});

describe("extractEnvRefs: other languages", () => {
  it("python", () => {
    const content = [
      "import os",
      "from os import environ",
      "# os.getenv(\"COMMENTED\")",
      "a = os.environ[\"DB_PASSWORD\"]",
      "b = os.environ.get('API_KEY', 'x')",
      "c = os.getenv(\"HOME_DIR\")  # os.getenv(\"TRAILING\")",
      "d = environ.get(\"FROM_IMPORT\")",
      "e = environ['BRACKET']",
      "os.environ[\"WRITTEN\"] = \"1\"",
      "url = \"http://host/#fragment\"; f = os.getenv(\"AFTER_HASH\")",
    ].join("\n");
    expect(refs(content, "python")).toEqual([
      ["DB_PASSWORD", 4],
      ["API_KEY", 5],
      ["HOME_DIR", 6],
      ["FROM_IMPORT", 7],
      ["BRACKET", 8],
      ["AFTER_HASH", 10],
    ]);
  });

  it("go", () => {
    const content = [
      "package main",
      "// os.Getenv(\"COMMENTED\")",
      "func main() {",
      "  a := os.Getenv(\"GITHUB_TOKEN\")",
      "  b, ok := os.LookupEnv(\"PORT\")",
      "  /* os.Getenv(\"BLOCK\") */",
      "}",
    ].join("\n");
    expect(refs(content, "go")).toEqual([
      ["GITHUB_TOKEN", 4],
      ["PORT", 5],
    ]);
  });

  it("rust", () => {
    const content = [
      "use std::env;",
      "fn main<'a>() {",
      "    let a = env::var(\"DATABASE_URL\").unwrap();",
      "    let b = std::env::var(\"STD_VAR\");",
      "    let c = env::var_os(\"OS_VAR\");",
      "    let d = env!(\"CARGO_PKG_VERSION\");",
      "    let e = option_env!(\"BUILD_SHA\");",
      "    let q = '\"'; let f = env::var(\"AFTER_CHAR\"); // env::var(\"COMMENTED\")",
      "}",
    ].join("\n");
    expect(refs(content, "rust")).toEqual([
      ["DATABASE_URL", 3],
      ["STD_VAR", 4],
      ["OS_VAR", 5],
      ["CARGO_PKG_VERSION", 6],
      ["BUILD_SHA", 7],
      ["AFTER_CHAR", 8],
    ]);
  });

  it("java and kotlin", () => {
    const java = ["class A {", "  String a = System.getenv(\"JAVA_HOME\");", "  // System.getenv(\"NOPE\")", "}"].join("\n");
    expect(refs(java, "java")).toEqual([["JAVA_HOME", 2]]);
    const kotlin = ["val a = System.getenv(\"KT_TOKEN\")", "val b = System.getenv()[\"KT_MAP\"]"].join("\n");
    expect(refs(kotlin, "kotlin")).toEqual([
      ["KT_TOKEN", 1],
      ["KT_MAP", 2],
    ]);
  });

  it("ruby", () => {
    const content = [
      "# ENV[\"COMMENTED\"]",
      "a = ENV[\"RAILS_ENV\"]",
      "b = ENV.fetch(\"SECRET_KEY_BASE\")",
      "c = ENV.fetch('PORT', 3000)",
      "ENV[\"WRITTEN\"] = \"1\"",
    ].join("\n");
    expect(refs(content, "ruby")).toEqual([
      ["RAILS_ENV", 2],
      ["SECRET_KEY_BASE", 3],
      ["PORT", 4],
    ]);
  });

  it("csharp", () => {
    const content = [
      "// Environment.GetEnvironmentVariable(\"NOPE\")",
      "var a = Environment.GetEnvironmentVariable(\"ASPNETCORE_ENVIRONMENT\");",
    ].join("\n");
    expect(refs(content, "csharp")).toEqual([["ASPNETCORE_ENVIRONMENT", 2]]);
  });

  it("php", () => {
    const content = [
      "<?php",
      "# getenv('HASH_COMMENT')",
      "// getenv('SLASH_COMMENT')",
      "$a = getenv('APP_KEY');",
      "$b = $_ENV['DB_HOST'];",
      "$c = $_SERVER['APP_SECRET'];",
      "$d = $_SERVER['argv'];",
      "$e = $_SERVER['REQUEST_METHOD'];",
      "$f = env('MAIL_PASSWORD');",
    ].join("\n");
    expect(refs(content, "php")).toEqual([
      ["APP_KEY", 4],
      ["DB_HOST", 5],
      ["APP_SECRET", 6],
      ["MAIL_PASSWORD", 9],
    ]);
  });

  it("c, c++ and swift", () => {
    expect(refs("char *h = getenv(\"HOME\"); // getenv(\"NOPE\")", "c")).toEqual([["HOME", 1]]);
    expect(refs("auto h = std::getenv(\"CXX_VAR\");", "cpp")).toEqual([["CXX_VAR", 1]]);
    expect(refs("let k = ProcessInfo.processInfo.environment[\"SWIFT_KEY\"]", "swift")).toEqual([["SWIFT_KEY", 1]]);
  });

  it("does not apply JS patterns to other languages", () => {
    expect(refs("x = \"process.env.NOT_PY\"", "python")).toEqual([]);
  });
});
