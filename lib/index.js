/**
 * dsh-access-mode: standalone access-mode policy for DeepSeek Harness.
 *
 * This package keeps the native permission-preset, approval, and sandbox
 * services, configuring their three mode bundles and adding one access gate
 * before the native execution pipeline performs approval, sandbox,
 * cancellation, and tool dispatch enforcement.
 */

export const name = "dsh-access-mode";
export const inject = [
  "commands",
  "permissionPresets",
  "tools",
];

export const MODE_VALUES = Object.freeze(["default", "no-edit", "auto"]);

export const MODE_LABELS = Object.freeze({
  default: "Default",
  "no-edit": "No Edit",
  auto: "Auto",
});

// These bundles are applied by the native permission-preset service. No Edit
// still asks before edit/write tools, but the approved operation must not be
// blocked by the workspace boundary; Auto is unrestricted by both gates.
export const MODE_SANDBOXES = Object.freeze({
  default: "workspace-write",
  "no-edit": "danger-full-access",
  auto: "danger-full-access",
});

const MODE_SET = new Set(MODE_VALUES);
const DEFAULT_MODE = "no-edit";
const MODE_EVENT = "permission/preset";
const SANDBOX_EVENT = "sandbox/mode";
const SAFE_TOOL_NAMES = new Set([
  "read",
  "grep",
  "glob",
  "search",
  "web_search",
  "web_fetch",
  "lsp",
  "ask_user_question",
  "skill",
]);
const SAFE_GIT_SUBCOMMANDS = new Set([
  "branch",
  "describe",
  "diff",
  "log",
  "ls-files",
  "remote",
  "rev-parse",
  "show",
  "status",
  "tag",
]);
const SAFE_SIMPLE_COMMANDS = new Set([
  "basename",
  "cat",
  "cut",
  "date",
  "df",
  "dirname",
  "du",
  "echo",
  "file",
  "find",
  "grep",
  "head",
  "ls",
  "printf",
  "pwd",
  "readlink",
  "rg",
  "sort",
  "stat",
  "tail",
  "tr",
  "true",
  "type",
  "uniq",
  "uname",
  "wc",
  "which",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function modeLabel(mode) {
  return MODE_LABELS[mode] ?? MODE_LABELS[DEFAULT_MODE];
}

function normalizeMode(value) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "default") return "default";
  if (normalized === "auto") return "auto";
  if (normalized === "no-edit" || normalized === "no edit" || normalized === "no_edit") {
    return "no-edit";
  }
  return undefined;
}

/** Read the canonical permission-preset event without copying the live session. */
export function modeFromEvents(events) {
  if (!Array.isArray(events)) return undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== MODE_EVENT) continue;
    const mode = normalizeMode(event.data?.preset);
    if (mode !== undefined) return mode;
  }
  return undefined;
}

export function sandboxModeFor(mode) {
  const effectiveMode = MODE_SET.has(mode) ? mode : DEFAULT_MODE;
  return MODE_SANDBOXES[effectiveMode];
}

export function sandboxModeFromEvents(events) {
  if (!Array.isArray(events)) return undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === SANDBOX_EVENT) return event.data?.mode;
  }
  return undefined;
}

function firstShellWord(segment) {
  const match = /^\s*([A-Za-z0-9_./+-]+)/.exec(segment);
  return match?.[1] ?? "";
}

function gitSubcommand(segment) {
  const words = segment.trim().split(/\s+/).filter(Boolean);
  if (words[0] !== "git") return undefined;
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    if (word === "--") return words[index + 1];
    if (word.startsWith("-")) continue;
    return word;
  }
  return undefined;
}

/**
 * Conservative Bash read-only classifier used only by Default mode.
 * No Edit mode intentionally never calls this function.
 */
export function isSafeBashCommand(command) {
  if (typeof command !== "string") return false;
  const trimmed = command.trim();
  if (trimmed.length === 0 || trimmed.length > 8192) return false;

  // Reject shell composition that can hide a write or a second command. A
  // simple read-only pipeline remains admissible.
  if (/[;&<>`\r\n]/.test(trimmed) || /\$\(/.test(trimmed)) return false;

  const segments = trimmed.split("|");
  for (const segment of segments) {
    const part = segment.trim();
    if (part.length === 0) return false;
    const first = firstShellWord(part);
    if (first === "git") {
      if (!SAFE_GIT_SUBCOMMANDS.has(gitSubcommand(part))) return false;
      continue;
    }
    if (first === "sed") {
      if (/(?:^|\s)(?:-i(?:\.[^\s]+)?|--in-place)(?:\s|$)/.test(part)) return false;
      continue;
    }
    if (first === "command") {
      if (!/^command\s+-v\s+[A-Za-z0-9_./+-]+$/.test(part)) return false;
      continue;
    }
    if (!SAFE_SIMPLE_COMMANDS.has(first)) return false;
  }
  return true;
}

function bashCommandOf(exec) {
  const args = exec?.arguments;
  return isObject(args) && typeof args.command === "string" ? args.command : undefined;
}

function ask(reason) {
  return { kind: "ask", reason };
}

/** Pure policy result before the native waterfall/approval pipeline. */
export function decisionFor(mode, exec) {
  const effectiveMode = MODE_SET.has(mode) ? mode : DEFAULT_MODE;
  const toolName = typeof exec?.name === "string" ? exec.name : "unknown";

  if (effectiveMode === "auto") return { kind: "allow" };

  if (effectiveMode === "no-edit") {
    if (toolName === "edit" || toolName === "write") {
      return ask(`No Edit mode requires approval for ${toolName}`);
    }
    // Deliberately do not inspect exec.arguments here. Bash is allowed at this
    // policy layer; native SandboxPolicy still governs its actual execution.
    return { kind: "allow" };
  }

  if (SAFE_TOOL_NAMES.has(toolName)) return { kind: "allow" };
  if (toolName === "bash" && isSafeBashCommand(bashCommandOf(exec))) {
    return { kind: "allow" };
  }
  return ask(`Default mode requires approval for ${toolName}`);
}

function currentMode(ctx, agent) {
  if (agent === undefined) return DEFAULT_MODE;
  const mode = normalizeMode(ctx.permissionPresets.current(agent.session.events));
  return mode ?? DEFAULT_MODE;
}

function commandResult(kind, text) {
  return { kind, text };
}

function registerCommand(ctx) {
  ctx.commands.register({
    name: "access-mode",
    description: "Switch the access mode: Default, No Edit, or Auto",
    input: { hint: "<default|no-edit|auto>" },
    recordInput: false,
    handler: ({ agent, rawInput }) => {
      const requested = rawInput.trim();
      if (requested === "") {
        return commandResult("success", `Access mode: ${modeLabel(currentMode(ctx, agent))}`);
      }
      const mode = normalizeMode(requested);
      if (mode === undefined || !ctx.permissionPresets.names.includes(mode)) {
        return commandResult("error", "Choose Default, No Edit, or Auto.");
      }
      ctx.permissionPresets.set(agent.session, mode);
      return commandResult("success", `Access mode: ${modeLabel(mode)}`);
    },
  });
}

export function apply(ctx) {
  registerCommand(ctx);

  ctx.on("tools/pre-execute", (exec, next) => {
    const mode = currentMode(ctx, exec.agent);
    const decision = decisionFor(mode, exec);
    if (decision.kind === "ask") return Promise.resolve(decision);
    return next();
  });
}
