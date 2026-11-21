<p align="center">
  <img src=".claude-plugin/icon.png" alt="Prompt Master icon" width="112">
</p>

<h1 align="center">Prompt Master</h1>

<p align="center">A Claude Code mod that turns your rough prompt into a clearer, sharper one before you send it.</p>

Type a quick, messy prompt, click **✨ Prompt Master** above the prompt box, and the draft is replaced with a rewritten version: same intent and scope, but with a clear goal, the context you gave, constraints, and what "done" looks like. It fixes spelling and grammar and never invents requirements. Nothing is sent automatically — review it, tweak it, then press Enter.

## Features

- **Prompt Master** button above the prompt box, with the mod's icon beside it in the desktop app, VS Code and mobile (✨ in the terminal); hotkey `p` when the band has focus
- **Undo rewrite** button to restore your original draft
- `/prompt-master [rough prompt]` slash command — the rewrite lands in your prompt box
- Uses Claude Haiku for fast, cheap rewrites (each rewrite is one small model call on your account)

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install prompt-master --marketplace fahadshaikh30/prompt-master
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```
claude plugin install prompt-master --marketplace fahadshaikh30/prompt-master
```

In the Claude desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `fahadshaikh30/prompt-master`, then **Add plugin**.

## Customize

Edit `hooks/register.tsx`:

- `MODEL` — the model alias used for rewrites (`haiku` by default; `sonnet` for more polished rewrites)
- `SYSTEM` — the rewriting instructions

## License

MIT
