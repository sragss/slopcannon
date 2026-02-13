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
    // Surface the git message without the "git <cmd> failed:" prefix for common operations
    throw new Error(stderr || `git ${args.join(" ")} failed with exit code ${result.exitCode}`);
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

export interface BranchEntry {
  name: string; // display name (short)
  ref: string;  // full ref to pass to git (local name or origin/name)
}

function listBranches(root: string, defaultBranch: string): BranchEntry[] {
  const raw = exec(
    ["branch", "-a", "--format=%(refname:short)"],
    root
  );
  const localBranches = new Set<string>();
  const entries = new Map<string, BranchEntry>();

  // First pass: collect local branches
  for (const line of raw.split("\n")) {
    const name = line.trim();
    if (!name || name.startsWith("origin/")) continue;
    localBranches.add(name);
  }

  // Second pass: build entries, preferring local refs
  for (const line of raw.split("\n")) {
    const name = line.trim();
    if (!name) continue;

    const isRemote = name.startsWith("origin/");
    const short = isRemote ? name.replace("origin/", "") : name;
    if (short === "HEAD") continue;
    if (entries.has(short)) continue;

    entries.set(short, {
      name: short,
      ref: localBranches.has(short) ? short : name, // use origin/x for remote-only
    });
  }

  const branches = Array.from(entries.values());
  branches.sort((a, b) => {
    if (a.name === defaultBranch) return -1;
    if (b.name === defaultBranch) return 1;
    return a.name.localeCompare(b.name);
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

export interface WorktreeEntry {
  path: string;
  branch: string | null; // null if detached HEAD
  isMain: boolean;       // is this the main worktree (not a linked one)
}

export function listWorktrees(root: string): WorktreeEntry[] {
  const raw = exec(["worktree", "list", "--porcelain"], root);
  const entries: WorktreeEntry[] = [];
  let current: Partial<WorktreeEntry> = {};

  for (const line of raw.split("\n")) {
    if (line.startsWith("worktree ")) {
      current.path = line.slice("worktree ".length);
    } else if (line.startsWith("branch refs/heads/")) {
      current.branch = line.slice("branch refs/heads/".length);
    } else if (line === "detached") {
      current.branch = null;
    } else if (line === "") {
      if (current.path) {
        entries.push({
          path: current.path,
          branch: current.branch ?? null,
          isMain: entries.length === 0, // first entry is always the main worktree
        });
      }
      current = {};
    }
  }
  // Handle last entry if no trailing newline
  if (current.path) {
    entries.push({
      path: current.path,
      branch: current.branch ?? null,
      isMain: entries.length === 0,
    });
  }

  return entries;
}

export function isBranchMerged(root: string, branch: string, into: string): boolean {
  try {
    const merged = exec(["branch", "--merged", into], root);
    return merged.split("\n").some((l) => l.trim() === branch);
  } catch {
    return false;
  }
}

export function isBranchDeletedOnRemote(root: string, branch: string): boolean {
  const result = Bun.spawnSync(
    ["git", "rev-parse", "--verify", `refs/remotes/origin/${branch}`],
    { cwd: root, stdout: "pipe", stderr: "pipe" }
  );
  return result.exitCode !== 0;
}

export function removeWorktree(root: string, worktreePath: string, force: boolean = false): void {
  const args = ["worktree", "remove", worktreePath];
  if (force) args.push("--force");
  exec(args, root);
}

export function deleteBranch(root: string, branch: string, force: boolean = false): void {
  exec(["branch", force ? "-D" : "-d", branch], root);
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
