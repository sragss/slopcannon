import type { CliArgs, DepCheckResult } from "./types.js";
import { runTui } from "./tui.js";

const HELP = `
slopcannon - Create a git worktree. Launch Claude Code. Ship slop.

Usage:
  slopcannon                     Interactive TUI
  slopcannon --path-file <path>  Write worktree path to file (for shell function)
  slopcannon --help              Show this help

What it does:
  git worktree add -b <branch> ../repo-branch origin/main
  claude --dangerously-skip-permissions
`.trim();

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { help: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") {
      result.help = true;
    } else if (args[i] === "--path-file" && i + 1 < args.length) {
      result.pathFile = args[++i];
    }
  }

  return result;
}

function checkDeps(): DepCheckResult {
  return {
    git: Bun.which("git"),
    claude: Bun.which("claude"),
    gh: Bun.which("gh"),
    bun: Bun.which("bun"),
  };
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  // Dep checks
  const deps = checkDeps();

  if (!deps.git) {
    console.error("Error: git is not installed.");
    process.exit(1);
  }

  if (!deps.claude) {
    console.error(
      "Error: claude CLI is not installed.\nInstall: https://docs.anthropic.com/en/docs/claude-code"
    );
    process.exit(1);
  }

  if (!deps.gh) {
    console.warn("Warning: gh CLI not found. Remote detection may be limited.");
  }

  // Run TUI
  const worktreePath = await runTui();
  if (!worktreePath) {
    process.exit(0);
  }

  // Mode dispatch
  if (args.pathFile) {
    await Bun.write(args.pathFile, worktreePath);
    process.exit(0);
  }

  // Launch claude directly
  const proc = Bun.spawn(["claude", "--dangerously-skip-permissions"], {
    cwd: worktreePath,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
  process.exit(proc.exitCode ?? 0);
}

main();
