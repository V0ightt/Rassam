import { describe, expect, it } from "vitest";
import { diffBlueprints } from "./blueprint-diff";
import { blueprintSchema, componentSchema, parseBlueprint } from "./schema";
import { STATUS_PATH, isStale, parseSystemStatus, serializeSystemStatus, summarizeStatus, systemStatusSchema, type SystemStatus } from "./status";

const blueprint = blueprintSchema.parse({
  version: "0.1",
  system: { name: "Shop" },
  components: [
    { id: "web", name: "Web", paths: ["web/**"], runtime: { health: { url: "https://shop.example/health" } } },
    { id: "api", name: "API", paths: ["api/**"], runtime: { health: { url: "http://localhost:3000/ready", method: "HEAD", expectStatus: 204, timeoutMs: 2000 }, deployment: { environment: "production" } } },
    { id: "worker", name: "Worker", paths: ["worker/**"], runtime: { workflow: { file: ".github/workflows/worker.yml" } } },
    { id: "docs", name: "Docs", paths: ["docs/**"] },
  ],
});

const status = (components: SystemStatus["components"]): SystemStatus => ({ version: 1, checkedAt: "2026-03-01T10:00:00Z", components });

describe("component runtime in the blueprint", () => {
  it("accepts health, deployment and workflow sources", () => {
    expect(blueprint.components[1].runtime).toEqual({
      health: { url: "http://localhost:3000/ready", method: "HEAD", expectStatus: 204, timeoutMs: 2000 },
      deployment: { environment: "production" },
    });
    expect(blueprint.components[3].runtime).toBeUndefined();
    expect(parseBlueprint(JSON.parse(JSON.stringify(blueprint))).ok).toBe(true);
  });

  it("rejects malformed runtime declarations", () => {
    const component = (runtime: unknown) => componentSchema.safeParse({ id: "a", name: "A", paths: ["a/**"], runtime }).success;
    expect(component({})).toBe(true);
    expect(component({ health: { url: "ftp://example.com" } })).toBe(false);
    expect(component({ health: { url: "javascript:alert(1)" } })).toBe(false);
    expect(component({ health: { url: `https://example.com/${"a".repeat(500)}` } })).toBe(false);
    expect(component({ health: { url: "https://example.com", method: "POST" } })).toBe(false);
    expect(component({ health: { url: "https://example.com", expectStatus: 99 } })).toBe(false);
    expect(component({ health: { url: "https://example.com", expectStatus: 200.5 } })).toBe(false);
    expect(component({ health: { url: "https://example.com", timeoutMs: 50 } })).toBe(false);
    expect(component({ health: { url: "https://example.com", timeoutMs: 30001 } })).toBe(false);
    expect(component({ health: { url: "https://example.com", headers: {} } })).toBe(false);
    expect(component({ deployment: {} })).toBe(false);
    expect(component({ workflow: { file: "a".repeat(201) } })).toBe(false);
    expect(component({ probe: true })).toBe(false);
  });

  it("is reported by the blueprint diff without counting as weakening", () => {
    const head = blueprintSchema.parse({
      ...blueprint,
      components: blueprint.components.map((component) => (component.id === "docs" ? { ...component, runtime: { deployment: { environment: "pages" } } } : component)),
    });
    const changes = diffBlueprints(blueprint, head);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "component-changed", target: "docs", weakens: false, summary: 'Component "docs" changed: runtime' });
    expect(diffBlueprints(blueprint, blueprintSchema.parse(JSON.parse(JSON.stringify(blueprint))))).toEqual([]);
  });
});

describe("system status", () => {
  it("parses valid status text", () => {
    const text = JSON.stringify({
      version: 1,
      checkedAt: "2026-03-01T10:00:00Z",
      commit: "abc1234",
      components: { web: { state: "up", source: "health-check", latencyMs: 120, url: "https://shop.example/health", detail: "200 OK" } },
    });
    const result = parseSystemStatus(`﻿${text}`);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.status?.components.web).toMatchObject({ state: "up", latencyMs: 120 });
    expect(STATUS_PATH).toBe(".rassam/status.json");
  });

  it("reports issues instead of throwing", () => {
    expect(parseSystemStatus("{ nope")).toMatchObject({ ok: false, issues: [{ path: "(root)" }] });
    expect(parseSystemStatus("{ nope").issues[0].message).toContain("Invalid JSON");
    expect(parseSystemStatus("null").ok).toBe(false);
    const wrong = parseSystemStatus(JSON.stringify({ version: 2, checkedAt: "2026-03-01", components: {} }));
    expect(wrong.ok).toBe(false);
    expect(wrong.status).toBeUndefined();
    expect(wrong.issues[0].path).toBe("version");
    const badState = parseSystemStatus(JSON.stringify({ version: 1, checkedAt: "2026-03-01", components: { web: { state: "on-fire", source: "manual" } } }));
    expect(badState.issues[0].path).toBe("components.web.state");
  });

  it("is strict about unknown keys, sources, ids and long details", () => {
    const base = { version: 1, checkedAt: "2026-03-01T10:00:00Z" };
    const ok = (value: unknown) => systemStatusSchema.safeParse(value).success;
    expect(ok({ ...base, components: {} })).toBe(true);
    expect(ok({ ...base, components: {}, extra: 1 })).toBe(false);
    expect(ok({ ...base, components: { web: { state: "up", source: "guess" } } })).toBe(false);
    expect(ok({ ...base, components: { web: { state: "up", source: "manual", secret: "x" } } })).toBe(false);
    expect(ok({ ...base, components: { web: { state: "up", source: "manual", detail: "x".repeat(301) } } })).toBe(false);
    expect(ok({ ...base, components: { "not an id": { state: "up", source: "manual" } } })).toBe(false);
    expect(ok({ version: 1, components: {} })).toBe(false);
  });

  it("serializes deterministically and round-trips", () => {
    const value: SystemStatus = {
      version: 1,
      checkedAt: "2026-03-01T10:00:00Z",
      commit: "abc1234",
      components: {
        web: { source: "health-check", state: "up", latencyMs: 80 },
        api: { detail: "503", state: "down", source: "health-check" },
      },
    };
    const text = serializeSystemStatus(value);
    expect(text.endsWith("}\n")).toBe(true);
    expect(text.indexOf('"api"')).toBeLessThan(text.indexOf('"web"'));
    expect(text.indexOf('"state": "down"')).toBeLessThan(text.indexOf('"detail": "503"'));
    expect(parseSystemStatus(text).status).toEqual(value);
    const reordered: SystemStatus = { components: { api: value.components.api, web: value.components.web }, commit: "abc1234", checkedAt: value.checkedAt, version: 1 };
    expect(serializeSystemStatus(reordered)).toBe(text);
  });

  it("summarizes only components that declare runtime", () => {
    expect(summarizeStatus(status({ web: { state: "up", source: "health-check" }, api: { state: "up", source: "deployment" }, worker: { state: "up", source: "workflow" } }), blueprint)).toEqual({
      up: 3,
      degraded: 0,
      down: 0,
      unknown: 0,
      monitored: 3,
      overall: "operational",
    });
    // "docs" declares no runtime: its entry is ignored. "worker" has no entry: unknown.
    expect(summarizeStatus(status({ web: { state: "up", source: "health-check" }, api: { state: "degraded", source: "health-check" }, docs: { state: "down", source: "manual" } }), blueprint)).toEqual({
      up: 1,
      degraded: 1,
      down: 0,
      unknown: 1,
      monitored: 3,
      overall: "degraded",
    });
    expect(summarizeStatus(status({ web: { state: "down", source: "health-check" }, api: { state: "degraded", source: "health-check" } }), blueprint).overall).toBe("outage");
    expect(summarizeStatus(status({}), blueprint)).toMatchObject({ unknown: 3, monitored: 3, overall: "unknown" });
    expect(summarizeStatus(null, blueprint)).toMatchObject({ unknown: 3, overall: "unknown" });
    expect(summarizeStatus(status({ web: { state: "up", source: "manual" } }), null)).toMatchObject({ monitored: 0, overall: "unknown" });
  });

  it("detects stale status", () => {
    const value = status({});
    expect(isStale(value, new Date("2026-03-01T10:29:00Z"))).toBe(false);
    expect(isStale(value, new Date("2026-03-01T10:31:00Z"))).toBe(true);
    expect(isStale(value, "2026-03-01T10:06:00Z", 5)).toBe(true);
    expect(isStale(value, Date.parse("2026-03-01T10:04:00Z"), 5)).toBe(false);
    expect(isStale({ ...value, checkedAt: "yesterday-ish" }, new Date("2026-03-01T10:00:00Z"))).toBe(true);
    expect(isStale(value, "not a date")).toBe(true);
  });
});
