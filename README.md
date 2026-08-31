# omp-statusline

A compact, managed status line for Oh My Pi (OMP). It replaces the standard status-line segments with a responsive view of the active model, thinking level, repository path, context usage, tokens, cache efficiency, timers, and local time.

```text
Model · high · ~/workspace/…/project · 42.3%/200K · In 12.4K · CH 8.1K/65.32% · Out 2.1K    1.2s/8.4s · 14:30
```

## Features

- Active model and thinking level in OMP theme colors.
- Rainbow emphasis for `xhigh` and bold rainbow emphasis for `max`.
- Responsive middle truncation for long repository paths.
- Context usage with green, yellow, and red threshold colors.
- Compact input, output, cache-read, and cache-hit statistics.
- Latest tool duration, complete turn duration, and local clock.
- Safe lifecycle handling: segment patches are shared across sessions and restored when the last extension owner shuts down.

## Requirements

- OMP `18.x`
- Bun
- Git

## Install from GitHub

```bash
git clone https://github.com/Z-JiuRi/omp-statusline.git
cd omp-statusline
bun install --frozen-lockfile

# Link the current directory as an OMP plugin.
omp plugin link "$PWD"
omp plugin doctor --json
```

Restart OMP after linking the plugin. No additional configuration is required.

## Update

OMP keeps a link to the local checkout, so update that checkout and restart OMP:

```bash
cd /path/to/omp-statusline
git pull --ff-only
bun install --frozen-lockfile
omp plugin doctor --json
```

## Display details

| Segment | Meaning |
| --- | --- |
| `Model` | Active model display name or model ID |
| `high` | Current resolved thinking level |
| `~/…/project` | Active repository path, shortened to fit the terminal |
| `42.3%/200K` | Used context percentage and total context window |
| `In 12.4K` | Input tokens |
| `CH 8.1K/65.32%` | Cache-read tokens and cache-hit rate |
| `Out 2.1K` | Output tokens |
| `1.2s/8.4s` | Latest or active tool duration and complete turn duration |
| `14:30` | Local 24-hour clock |

Context is green below 50%, yellow from 50%, and red from 80%. Cache hit rate is green from 90%, yellow from 80%, and red below 80%.

## Development

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
```

The extension patches OMP's built-in `model`, `path`, `context_pct`, `token_in`, `cache_hit`, `token_out`, and `time` renderers. Other extensions that replace the same status-line segments may conflict, so avoid enabling two full status-line replacements at once.

## License

MIT
