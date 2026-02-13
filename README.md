# slopcannon

<p align="center">
  <img src="images/hero.png" width="512" />
</p>

Create a git worktree. Launch Claude Code. Ship slop.

## What it does

```
git worktree add -b <branch> ../repo-branch origin/main
claude --dangerously-skip-permissions
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
  local tmpfile=$(mktemp /tmp/slopcannon.XXXXXX)
  bunx slopcannon --path-file "$tmpfile"
  local p=$(cat "$tmpfile" 2>/dev/null)
  rm -f "$tmpfile"
  if [[ -n "$p" ]] && [[ -d "$p" ]]; then
    cd "$p" && claude --dangerously-skip-permissions
  fi
}
```

## Requirements

- [bun](https://bun.sh)
- [git](https://git-scm.com)
- [claude CLI](https://docs.anthropic.com/en/docs/claude-code)
