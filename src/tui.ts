import * as p from "@clack/prompts";
import {
  getRepoInfo,
  validateBranchName,
  computeWorktreePath,
  createWorktree,
} from "./git.js";

export async function runTui(): Promise<string | null> {
  p.intro("slopcannon");

  // Detect repo
  let info;
  try {
    info = getRepoInfo();
  } catch {
    p.log.error("Not inside a git repository.");
    p.outro("Run this from inside a git repo.");
    return null;
  }

  p.log.info(`${info.repoName}${info.remoteUrl ? ` (${info.remoteUrl})` : ""}`);

  // Select base branch
  const baseBranch = await p.select({
    message: "Base branch",
    options: info.branches.map((b) => ({
      value: b,
      label: b,
      hint: b === info.defaultBranch ? "default" : undefined,
    })),
    maxItems: 10,
    initialValue: info.defaultBranch,
  });
  if (p.isCancel(baseBranch)) {
    p.outro("Cancelled.");
    return null;
  }

  // New branch name
  const newBranch = await p.text({
    message: "New branch name",
    placeholder: "feat/my-feature",
    validate: (val) => {
      if (!val.trim()) return "Branch name required";
      return validateBranchName(val.trim(), info.root);
    },
  });
  if (p.isCancel(newBranch)) {
    p.outro("Cancelled.");
    return null;
  }

  const branchName = (newBranch as string).trim();
  const worktreePath = computeWorktreePath(
    info.parentDir,
    info.repoName,
    branchName
  );

  // Show command
  p.log.step(
    `git worktree add -b ${branchName} ${worktreePath} ${baseBranch}`
  );

  // Confirm
  const confirmed = await p.confirm({
    message: "Create worktree?",
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.outro("Cancelled.");
    return null;
  }

  // Create worktree
  const s = p.spinner();
  s.start("Creating worktree...");
  try {
    createWorktree(info.root, worktreePath, baseBranch as string, branchName);
    s.stop("Worktree created.");
  } catch (err: any) {
    s.stop("Failed.");
    p.log.error(err.message);
    p.outro("Worktree creation failed.");
    return null;
  }

  p.outro(`Ready: ${worktreePath}`);
  return worktreePath;
}
