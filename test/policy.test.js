import test from "node:test";
import assert from "node:assert/strict";
import {
  decisionFor,
  isSafeBashCommand,
  modeFromEvents,
  sandboxModeFor,
  sandboxModeFromEvents,
} from "../lib/index.js";

test("modeFromEvents reads the latest plugin-owned mode", () => {
  assert.equal(modeFromEvents([
    { type: "permission/preset", data: { preset: "default" } },
    { type: "permission/preset", data: { preset: "no-edit" } },
  ]), "no-edit");
  assert.equal(modeFromEvents([
    { type: "permission/preset", data: { preset: "workspace-write" } },
  ]), undefined);
});

test("custom modes own the sandbox bundle", () => {
  assert.equal(sandboxModeFor("default"), "workspace-write");
  assert.equal(sandboxModeFor("no-edit"), "danger-full-access");
  assert.equal(sandboxModeFor("auto"), "danger-full-access");
  assert.equal(sandboxModeFromEvents([
    { type: "sandbox/mode", data: { mode: "workspace-write" } },
    { type: "sandbox/mode", data: { mode: "danger-full-access" } },
  ]), "danger-full-access");
});

test("Default allows read tools and read-only Bash", () => {
  for (const name of ["read", "grep", "glob", "web_search", "lsp"]) {
    assert.deepEqual(decisionFor("default", { name, arguments: {} }), { kind: "allow" });
  }
  for (const command of ["cat file.txt", "ls -la", "git status", "git diff", "pwd | sed -n '1,5p'"]) {
    assert.deepEqual(decisionFor("default", { name: "bash", arguments: { command } }), { kind: "allow" });
  }
});

test("Default asks for mutations and unsafe Bash", () => {
  for (const name of ["edit", "write", "todo_write", "cordis_run"]) {
    assert.equal(decisionFor("default", { name, arguments: {} }).kind, "ask");
  }
  for (const command of [
    "npm install",
    "rm -rf dist",
    "echo hello > test.txt",
    "sed -i 's/a/b/' file.txt",
    "python -c 'open(\"x\", \"w\").write(\"x\")'",
  ]) {
    assert.equal(decisionFor("default", { name: "bash", arguments: { command } }).kind, "ask");
  }
});

test("No Edit never inspects Bash arguments and only asks for edit/write", () => {
  const exec = {
    name: "bash",
    get arguments() {
      throw new Error("No Edit must not inspect Bash arguments");
    },
  };
  assert.deepEqual(decisionFor("no-edit", exec), { kind: "allow" });
  assert.equal(decisionFor("no-edit", { name: "edit", arguments: {} }).kind, "ask");
  assert.equal(decisionFor("no-edit", { name: "write", arguments: {} }).kind, "ask");
  for (const name of ["read", "grep", "glob", "web_search", "bash", "cordis_run"]) {
    assert.deepEqual(decisionFor("no-edit", { name, arguments: {} }), { kind: "allow" });
  }
});

test("unset mode falls back to No Edit", () => {
  assert.equal(sandboxModeFor(undefined), "danger-full-access");
  assert.equal(decisionFor(undefined, { name: "bash", arguments: { command: "rm -rf /" } }).kind, "allow");
  assert.equal(decisionFor(undefined, { name: "edit", arguments: {} }).kind, "ask");
  assert.equal(decisionFor(undefined, { name: "write", arguments: {} }).kind, "ask");
});

test("Auto allows every tool", () => {
  for (const name of ["read", "edit", "write", "bash", "cordis_run", "unknown"]) {
    assert.deepEqual(decisionFor("auto", { name, arguments: { command: "rm -rf /" } }), { kind: "allow" });
  }
});

test("Bash classifier rejects shell composition and writes", () => {
  assert.equal(isSafeBashCommand("cat file | grep text"), true);
  assert.equal(isSafeBashCommand("cat file && rm file"), false);
  assert.equal(isSafeBashCommand("echo hello > file"), false);
  assert.equal(isSafeBashCommand("bash -c 'cat file'"), false);
});
