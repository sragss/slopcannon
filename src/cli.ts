import type { CliArgs, DepCheckResult } from "./types.js";
import { runTui } from "./tui.js";
import { runConfig } from "./config.js";
import { runCleanup } from "./cleanup.js";

// Guard: must run under Bun, not Node
if (typeof Bun === "undefined") {
  console.error(
    "Error: slopcannon requires Bun.\nInstall: https://bun.sh\nThen run: bunx slopcannon"
  );
  process.exit(1);
}

const HELP = `
slopcannon - Create a git worktree. Launch Claude Code or Codex. Ship slop.

Usage:
  slopcannon                     Interactive TUI
  slopcannon cleanup|clean       Clean up merged/stale worktrees
  slopcannon config              Configure settings
  slopcannon --path-file <path>  Write worktree path to file (for shell function)
  slopcannon --launcher-file <path>  Write selected launcher to file
  slopcannon --help              Show this help

What it does:
  git worktree add -b <branch> ../repo-branch origin/main
  then launches your selected CLI
`.trim();

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { help: false, version: false, config: false, cleanup: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") {
      result.help = true;
    } else if (args[i] === "--version" || args[i] === "-v" || args[i] === "-V") {
      result.version = true;
    } else if (args[i] === "--path-file" && i + 1 < args.length) {
      result.pathFile = args[++i];
    } else if (args[i] === "--launcher-file" && i + 1 < args.length) {
      result.launcherFile = args[++i];
    } else if (args[i] === "config") {
      result.config = true;
    } else if (args[i] === "cleanup" || args[i] === "clean") {
      result.cleanup = true;
    } else if (!args[i].startsWith("-")) {
      console.error(`Unknown command: ${args[i]}\nRun 'slopcannon --help' for usage.`);
      process.exit(1);
    }
  }

  return result;
}

function checkDeps(): DepCheckResult {
  return {
    git: Bun.which("git"),
    claude: Bun.which("claude"),
    codex: Bun.which("codex"),
    gh: Bun.which("gh"),
    bun: Bun.which("bun"),
  };
}

function requireGit(deps: DepCheckResult) {
  if (!deps.git) {
    console.error("Error: git is not installed.");
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs();

  if (args.version) {
    const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();
    console.log(pkg.version);
    process.exit(0);
  }

  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  const deps = checkDeps();

  if (args.config) {
    await runConfig();
    process.exit(0);
  }

  if (args.cleanup) {
    requireGit(deps);
    await runCleanup();
    process.exit(0);
  }

  // Full dep checks for main flow
  requireGit(deps);

  if (!deps.claude && !deps.codex) {
    console.error(
      "Error: neither claude nor codex CLI is installed.\nInstall one of them before running slopcannon."
    );
    process.exit(1);
  }

  if (!deps.gh) {
    console.warn("Warning: gh CLI not found. Remote detection may be limited.");
  }

  // Run TUI
  const tuiResult = await runTui({
    claude: deps.claude,
    codex: deps.codex,
  });
  if (!tuiResult) {
    process.exit(0);
  }
  const { worktreePath, launcher } = tuiResult;

  // Mode dispatch
  if (args.pathFile) {
    await Bun.write(args.pathFile, worktreePath);
  }
  if (args.launcherFile) {
    await Bun.write(args.launcherFile, launcher + "\n");
  }
  if (args.pathFile || args.launcherFile) {
    process.exit(0);
  }

  // @clack/prompts leaves stdin in flowing mode after the TUI completes.
  // With Bun.spawn stdin:"inherit", parent and child share the same fd —
  // if the parent's event loop is still polling it, keystrokes get stolen.
  process.stdin.removeAllListeners();
  process.stdin.pause();
  process.stdin.unref();

  const launchCommand =
    launcher === "codex"
      ? ["codex", "--yolo"]
      : ["claude", "--dangerously-skip-permissions"];

  const proc = Bun.spawn(launchCommand, {
    cwd: worktreePath,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
  process.exit(proc.exitCode ?? 0);
}

main().catch((err) => {
  console.error(`\nError: ${err.message || err}`);
  process.exit(1);
});
