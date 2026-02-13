import * as p from "@clack/prompts";
import {
  getRepoInfo,
  validateBranchName,
  computeWorktreePath,
  createWorktree,
} from "./git.js";
import { loadConfig } from "./config.js";

const ADJECTIVES = [
  "wrestling", "turbulent", "chaotic", "unhinged", "reckless",
  "feral", "caffeinated", "nocturnal", "suspicious", "ambitious",
  "overcooked", "sentient", "volatile", "cursed", "legendary",
  "questionable", "unsupervised", "greasy", "tactical", "forbidden",
  "nuclear", "haunted", "bootleg", "squishy", "untested",
];

const NOUNS = [
  "goose", "cannon", "spaghetti", "yolo", "gremlin",
  "raccoon", "bulldozer", "toaster", "goblin", "disaster",
  "speedrun", "cowboy", "noodle", "shambles", "vibes",
  "dumpster", "kraken", "mongoose", "burrito", "firehose",
  "trebuchet", "gopher", "waffle", "blunderbuss", "hotdog",
];

function randomBranchName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}

const red = (s: string) => `\x1b[38;2;255;50;50m${s}\x1b[0m`;
const boldRed = (s: string) => `\x1b[1;38;2;255;50;50m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TITLE = "SLOP CANNON ACTIVATED";
const CLEAR_LINE = "\x1b[2K\r";

// Cannon fire ~750ms
// Single line, overwritten each frame. Projectile flies right, explodes, becomes title.
async function cannonActivation() {
  const cannon = "▐██▌";
  const travel = TITLE.length;

  // Projectile travels: ~450ms (15 frames @ 30ms)
  for (let pos = 0; pos <= travel; pos++) {
    const trail = pos > 1 ? red("═".repeat(pos - 1)) : "";
    const bullet = boldRed("●");
    const pad = " ".repeat(travel - pos);
    process.stdout.write(`${CLEAR_LINE}│  ${cannon}${trail}${bullet}${pad}`);
    await sleep(30);
  }

  // Impact flash: ~150ms
  const flash = boldRed("═".repeat(travel) + "╬");
  process.stdout.write(`${CLEAR_LINE}│  ${cannon}${flash}`);
  await sleep(75);
  process.stdout.write(`${CLEAR_LINE}│  ${cannon}${red("═".repeat(travel))}${boldRed("*")}`);
  await sleep(75);

  // Reveal: clear everything, show title ~100ms
  await sleep(50);
  const bar = dim("│");
  const pad = 2;
  const inner = TITLE.length + pad * 2;
  const top = red("┌" + "─".repeat(inner) + "┐");
  const mid = red("│") + " ".repeat(pad) + boldRed(TITLE) + " ".repeat(pad) + red("│");
  const bot = red("└" + "─".repeat(inner) + "┘");
  process.stdout.write(`${CLEAR_LINE}${bar}\n${bar}  ${top}\n${bar}  ${mid}\n${bar}  ${bot}\n`);
}

// Typewriter ~750ms
async function typewriterActivation() {
  process.stdout.write("│  ");
  for (let i = 0; i < TITLE.length; i++) {
    process.stdout.write(boldRed(TITLE[i]));
    await sleep(30);
  }
  process.stdout.write("\n");
}

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
  const baseBranch = await p.autocomplete({
    message: "Base branch",
    options: info.branches.map((b) => ({
      value: b,
      label: b,
      hint: b === info.defaultBranch ? "default" : undefined,
    })),
    maxItems: 10,
    initialValue: info.defaultBranch,
    placeholder: "Type to filter...",
  });
  if (p.isCancel(baseBranch)) {
    p.outro("Cancelled.");
    return null;
  }

  // New branch name
  const defaultName = randomBranchName();
  const newBranch = await p.text({
    message: "New branch name",
    placeholder: defaultName,
    defaultValue: defaultName,
    validate: (val) => {
      const v = (val || defaultName).trim();
      return validateBranchName(v, info.root);
    },
  });
  if (p.isCancel(newBranch)) {
    p.outro("Cancelled.");
    return null;
  }

  const branchName = ((newBranch as string) || defaultName).trim();
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

  const style = loadConfig().activationStyle;
  if (style === "cannon") await cannonActivation();
  else if (style === "typewriter") await typewriterActivation();

  p.outro(worktreePath);
  return worktreePath;
}
