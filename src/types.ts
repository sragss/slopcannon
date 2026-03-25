export interface DepCheckResult {
  git: string | null;
  claude: string | null;
  codex: string | null;
  gh: string | null;
  bun: string | null;
}

export interface RepoInfo {
  root: string;
  repoName: string;
  parentDir: string;
  remoteUrl: string | null;
  defaultBranch: string;
  branches: import("./git.js").BranchEntry[];
}

export interface CliArgs {
  pathFile?: string;
  launcherFile?: string;
  help: boolean;
  version: boolean;
  config: boolean;
  cleanup: boolean;
}

export type LauncherChoice = "claude" | "codex";

export interface TuiResult {
  worktreePath: string;
  launcher: LauncherChoice;
}
