import type { RepoInfo } from "./types.js";
import path from "path";

function exec(args: string[], cwd?: string): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: cwd ?? process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim();
    throw new Error(`git ${args[0]} failed: ${stderr}`);
  }
  return result.stdout.toString().trim();
}

function detectDefaultBranch(root: string): string {
  // Try symbolic-ref first
  try {
    const ref = exec(["symbolic-ref", "refs/remotes/origin/HEAD"], root);
    return ref.replace("refs/remotes/origin/", "");
  } catch {}

  // Fallback: check if main exists
  try {
    exec(["rev-parse", "--verify", "refs/heads/main"], root);
    return "main";
  } catch {}

  // Fallback: check if master exists
  try {
    exec(["rev-parse", "--verify", "refs/heads/master"], root);
    return "master";
  } catch {}

  // Last resort: current branch
  return exec(["branch", "--show-current"], root) || "main";
}

function listBranches(root: string, defaultBranch: string): string[] {
  const raw = exec(
    ["branch", "-a", "--format=%(refname:short)"],
    root
  );
  const seen = new Set<string>();
  const branches: string[] = [];

  for (const line of raw.split("\n")) {
    const name = line.trim();
    if (!name) continue;
    // Normalize remote branches: origin/foo → foo
    const short = name.startsWith("origin/")
      ? name.replace("origin/", "")
      : name;
    if (short === "HEAD") continue;
    if (seen.has(short)) continue;
    seen.add(short);
    branches.push(short);
  }

  // Sort default branch first
  branches.sort((a, b) => {
    if (a === defaultBranch) return -1;
    if (b === defaultBranch) return 1;
    return a.localeCompare(b);
  });

  return branches;
}

export function getRepoInfo(): RepoInfo {
  const root = exec(["rev-parse", "--show-toplevel"]);
  const repoName = path.basename(root);
  const parentDir = path.dirname(root);

  let remoteUrl: string | null = null;
  try {
    remoteUrl = exec(["remote", "get-url", "origin"], root);
  } catch {}

  const defaultBranch = detectDefaultBranch(root);
  const branches = listBranches(root, defaultBranch);

  return { root, repoName, parentDir, remoteUrl, defaultBranch, branches };
}

export function validateBranchName(
  name: string,
  root: string
): string | undefined {
  // Check format
  const fmtResult = Bun.spawnSync(
    ["git", "check-ref-format", "--branch", name],
    { cwd: root, stdout: "pipe", stderr: "pipe" }
  );
  if (fmtResult.exitCode !== 0) {
    return "Invalid branch name";
  }

  // Check if branch already exists
  const existsResult = Bun.spawnSync(
    ["git", "rev-parse", "--verify", `refs/heads/${name}`],
    { cwd: root, stdout: "pipe", stderr: "pipe" }
  );
  if (existsResult.exitCode === 0) {
    return `Branch '${name}' already exists`;
  }

  return undefined;
}

export function computeWorktreePath(
  parentDir: string,
  repoName: string,
  branch: string
): string {
  const safeBranch = branch.replace(/\//g, "-");
  return path.join(parentDir, `${repoName}-${safeBranch}`);
}

export function createWorktree(
  root: string,
  worktreePath: string,
  baseBranch: string,
  newBranch: string
): void {
  exec(
    ["worktree", "add", "-b", newBranch, worktreePath, baseBranch],
    root
  );
}
