export interface DepCheckResult {
  git: string | null;
  claude: string | null;
  gh: string | null;
  bun: string | null;
}

export interface RepoInfo {
  root: string;
  repoName: string;
  parentDir: string;
  remoteUrl: string | null;
  defaultBranch: string;
  branches: string[];
}

export interface CliArgs {
  pathFile?: string;
  help: boolean;
}
