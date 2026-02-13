import * as p from "@clack/prompts";
import {
  getRepoInfo,
  listWorktrees,
  isBranchMerged,
  isBranchDeletedOnRemote,
  removeWorktree,
  deleteBranch,
  type WorktreeEntry,
} from "./git.js";

interface PrInfo {
  number: number;
  title: string;
  state: string;
  url: string;
}

interface WorktreeCandidate {
  entry: WorktreeEntry;
  merged: boolean;
  deletedOnRemote: boolean;
  pr: PrInfo | null;
  safeToClean: boolean;
}

function lookupPr(branch: string): PrInfo | null {
  const result = Bun.spawnSync(
    ["gh", "pr", "list", "--head", branch, "--state", "all", "--json", "number,title,state,url", "--limit", "1"],
    { stdout: "pipe", stderr: "pipe" }
  );
  if (result.exitCode !== 0) return null;
  try {
    const prs = JSON.parse(result.stdout.toString());
    if (prs.length === 0) return null;
    return prs[0] as PrInfo;
  } catch {
    return null;
  }
}

function formatCandidate(c: WorktreeCandidate): string {
  const parts: string[] = [];

  if (c.entry.branch) {
    parts.push(c.entry.branch);
  } else {
    parts.push("(detached)");
  }

  const tags: string[] = [];
  if (c.merged) tags.push("merged");
  if (c.deletedOnRemote) tags.push("gone from remote");
  if (c.pr) {
    const state = c.pr.state === "MERGED" ? "merged" : c.pr.state.toLowerCase();
    tags.push(`PR #${c.pr.number} ${state}: ${c.pr.title}`);
  }

  if (tags.length > 0) {
    parts.push(`(${tags.join(", ")})`);
  }

  return parts.join(" ");
}

export async function runCleanup(): Promise<void> {
  p.intro("slopcannon cleanup");

  let info;
  try {
    info = getRepoInfo();
  } catch {
    p.log.error("Not inside a git repository.");
    p.outro("Run this from inside a git repo.");
    return;
  }

  const s = p.spinner();
  s.start("Scanning worktrees...");

  // Prune stale worktrees (e.g. directory was manually deleted)
  try {
    Bun.spawnSync(["git", "worktree", "prune"], { cwd: info.root });
  } catch {}

  let worktrees;
  try {
    worktrees = listWorktrees(info.root);
  } catch (err: any) {
    s.stop("Failed.");
    p.log.error(`Could not list worktrees: ${err.message}`);
    p.outro("Cleanup failed.");
    return;
  }
  const linked = worktrees.filter((w) => !w.isMain);

  if (linked.length === 0) {
    s.stop("No linked worktrees found.");
    p.outro("Nothing to clean up.");
    return;
  }

  const hasGh = !!Bun.which("gh");

  const candidates: WorktreeCandidate[] = linked.map((entry) => {
    const merged = entry.branch
      ? isBranchMerged(info.root, entry.branch, info.defaultBranch)
      : false;
    const deletedOnRemote = entry.branch
      ? isBranchDeletedOnRemote(info.root, entry.branch)
      : false;
    const pr = entry.branch && hasGh ? lookupPr(entry.branch) : null;

    const prMerged = pr?.state === "MERGED";
    const safeToClean = merged || (deletedOnRemote && !entry.branch) || prMerged;

    return { entry, merged, deletedOnRemote, pr, safeToClean };
  });

  s.stop(`Found ${candidates.length} linked worktree${candidates.length === 1 ? "" : "s"}.`);

  const selected = await p.multiselect({
    message: "Select worktrees to remove \x1b[2m(space to toggle, enter to confirm)\x1b[0m",
    options: candidates.map((c) => ({
      value: c,
      label: formatCandidate(c),
      hint: c.entry.path,
    })),
    initialValues: candidates.filter((c) => c.safeToClean),
    required: false,
  });

  if (p.isCancel(selected)) {
    p.outro("Cancelled.");
    return;
  }

  const toRemove = selected as WorktreeCandidate[];
  if (toRemove.length === 0) {
    p.outro("Nothing selected.");
    return;
  }

  const confirmed = await p.confirm({
    message: `Remove ${toRemove.length} worktree${toRemove.length === 1 ? "" : "s"} and delete their branches?`,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.outro("Cancelled.");
    return;
  }

  const remover = p.spinner();
  remover.start("Removing worktrees...");

  let removed = 0;
  let errors: string[] = [];

  for (const c of toRemove) {
    try {
      removeWorktree(info.root, c.entry.path, true);
      if (c.entry.branch) {
        try {
          deleteBranch(info.root, c.entry.branch, true);
        } catch {}
      }
      removed++;
    } catch (err: any) {
      errors.push(`${c.entry.branch ?? c.entry.path}: ${err.message}`);
    }
  }

  remover.stop(`Removed ${removed} worktree${removed === 1 ? "" : "s"}.`);

  if (errors.length > 0) {
    for (const e of errors) {
      p.log.error(e);
    }
  }

  p.outro("Done.");
}
