import { describe, expect, it } from "vitest";
import { COMMANDS, booleanFlag, commandHelp, findCommand, generalHelp, numberFlag, parseArgs, stringFlag, suggest } from "./args";
import { UsageError, captureIo } from "./io";
import { main } from "./main";

describe("parseArgs", () => {
  it("parses a command with defaults", () => {
    const args = parseArgs(["check"]);
    expect(args.command).toBe("check");
    expect(args.positionals).toEqual([]);
    expect(stringFlag(args, "format")).toBe("text");
    expect(stringFlag(args, "failOn")).toBe("error");
    expect(stringFlag(args, "approveLabel")).toBe("rassam:approved");
    expect(args.flags.color).toBe(true);
    expect(booleanFlag(args, "github")).toBe(false);
  });

  it("supports --flag value, --flag=value and camelCases keys", () => {
    const args = parseArgs(["check", "--base", "origin/main", "--fail-on=warning", "--budget", "7", "--sarif-output=out/r.sarif"]);
    expect(stringFlag(args, "base")).toBe("origin/main");
    expect(stringFlag(args, "failOn")).toBe("warning");
    expect(numberFlag(args, "budget")).toBe(7);
    expect(stringFlag(args, "sarifOutput")).toBe("out/r.sarif");
  });

  it("supports boolean flags, --no-flag and --flag=false", () => {
    const args = parseArgs(["check", "--github", "--comment", "--no-color", "--verbose=false", "--approved=true"]);
    expect(booleanFlag(args, "github")).toBe(true);
    expect(booleanFlag(args, "comment")).toBe(true);
    expect(args.flags.color).toBe(false);
    expect(booleanFlag(args, "verbose")).toBe(false);
    expect(booleanFlag(args, "approved")).toBe(true);
  });

  it("collects positionals and honors --", () => {
    expect(parseArgs(["impact", "a.ts", "b.ts", "--format", "json"]).positionals).toEqual(["a.ts", "b.ts"]);
    expect(parseArgs(["explain", "--", "--weird-name.ts"]).positionals).toEqual(["--weird-name.ts"]);
  });

  it("keeps values that contain = or start with a dash", () => {
    const args = parseArgs(["verify", "api", "--note=a=b", "--by", "-anon-"]);
    expect(stringFlag(args, "note")).toBe("a=b");
    expect(stringFlag(args, "by")).toBe("-anon-");
  });

  it("recognizes help and version in any position", () => {
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(parseArgs(["help"]).help).toBe(true);
    expect(parseArgs(["check", "--help"])).toMatchObject({ command: "check", help: true });
    expect(parseArgs(["--version"]).version).toBe(true);
    expect(parseArgs(["-v"]).version).toBe(true);
    // Help never fails on missing positionals.
    expect(parseArgs(["explain", "-h"]).help).toBe(true);
  });

  it("rejects unknown commands and options with a suggestion", () => {
    expect(() => parseArgs(["chekc"])).toThrow(/Did you mean "check"/);
    expect(() => parseArgs(["check", "--bse", "x"])).toThrow(/Did you mean --base/);
    expect(() => parseArgs(["check", "-x"])).toThrow(UsageError);
    expect(() => parseArgs(["--base", "x", "check"])).toThrow(/must come after a command/);
    expect(() => parseArgs(["check", "--no-base"])).toThrow(/Unknown option/);
  });

  it("validates values, choices and positional counts", () => {
    expect(() => parseArgs(["check", "--base"])).toThrow(/needs a value/);
    expect(() => parseArgs(["check", "--budget", "many"])).toThrow(/expects a number/);
    expect(() => parseArgs(["check", "--format", "xml"])).toThrow(/must be one of text, markdown, json, sarif/);
    expect(() => parseArgs(["check", "--github=maybe"])).toThrow(/expects true or false/);
    expect(() => parseArgs(["explain"])).toThrow(/expects <path>/);
    expect(() => parseArgs(["explain", "a", "b"])).toThrow(/at most 1/);
    expect(() => parseArgs(["schema", "extra"])).toThrow(/no positional arguments/);
  });

  it("lets the last occurrence of a flag win", () => {
    expect(stringFlag(parseArgs(["graph", "--format", "dot", "--format=json"]), "format")).toBe("json");
  });
});

describe("help text", () => {
  it("lists every command in the general help", () => {
    const help = generalHelp("1.2.3");
    for (const command of COMMANDS) expect(help).toContain(command.name);
    expect(help).toContain("rassam 1.2.3");
  });

  it("documents every flag of every command", () => {
    for (const command of COMMANDS) {
      const help = commandHelp(command);
      expect(help).toContain(`Usage: rassam ${command.name}`);
      for (const flag of command.flags) expect(help).toContain(flag.type === "boolean" && flag.default === true ? `--no-${flag.name}` : `--${flag.name}`);
    }
    expect(commandHelp(findCommand("check")!)).toContain("Exit codes: 0 ok, 1 findings");
  });

  it("suggests only close matches", () => {
    expect(suggest("inti", ["init", "check"])).toBe("init");
    expect(suggest("zzzzzz", ["init", "check"])).toBeUndefined();
  });
});

describe("main dispatch", () => {
  it("prints help and version with exit code 0", async () => {
    const help = captureIo();
    expect(await main(["--help"], help)).toBe(0);
    expect(help.text()).toContain("Usage: rassam <command>");

    const version = captureIo();
    expect(await main(["--version"], version)).toBe(0);
    expect(version.text()).toMatch(/^\d+\.\d+\.\d+\n$/);

    const command = captureIo();
    expect(await main(["check", "--help"], command)).toBe(0);
    expect(command.text()).toContain("--fail-on <level>");
  });

  it("exits 2 with usage on stderr for no command or bad usage", async () => {
    const none = captureIo();
    expect(await main([], none)).toBe(2);
    expect(none.text()).toBe("");
    expect(none.errText()).toContain("Usage: rassam <command>");

    const bad = captureIo();
    expect(await main(["check", "--format", "xml"], bad)).toBe(2);
    expect(bad.errText()).toContain('Run "rassam check --help"');
  });

  it("prints the JSON schema", async () => {
    const io = captureIo();
    expect(await main(["schema"], io)).toBe(0);
    const schema = JSON.parse(io.text()) as { title: string; properties: Record<string, unknown> };
    expect(schema.title).toBe("Rassam Blueprint");
    expect(schema.properties).toHaveProperty("components");
  });
});
