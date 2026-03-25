# slopcannon

<p align="center">
  <img src="images/hero.png" width="512" />
</p>

Create a git worktree. Launch Claude Code or Codex. Ship slop.

## What it does

```
git worktree add -b <branch> ../repo-branch origin/main
pick a launcher:
- claude --dangerously-skip-permissions
- codex --yolo
```

That's it. Run it in any git repo.

## Quick start

```
bunx slopcannon
```

## Shell function (recommended)

Add to `~/.zshrc` so your shell cds into the worktree:

```bash
slopcannon() {
  local pathfile=$(mktemp /tmp/slopcannon.path.XXXXXX)
  local launcherfile=$(mktemp /tmp/slopcannon.launcher.XXXXXX)
  bunx slopcannon --path-file "$pathfile" --launcher-file "$launcherfile" "$@"
  local p=$(cat "$pathfile" 2>/dev/null)
  local launcher=$(cat "$launcherfile" 2>/dev/null)
  rm -f "$pathfile" "$launcherfile"
  if [[ -n "$p" ]] && [[ -d "$p" ]]; then
    cd "$p" || return
    if [[ "$launcher" == "codex" ]]; then
      codex --yolo
    else
      claude --dangerously-skip-permissions
    fi
  fi
}
```

## Requirements

- [bun](https://bun.sh)
- [git](https://git-scm.com)
- [claude CLI](https://docs.anthropic.com/en/docs/claude-code) or `codex`
