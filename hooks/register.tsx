import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Status } from '../types'

const status = atom({ plugin: 'prompt-master', key: 'status' } as const, 'idle' as Status)
// The draft before the last rewrite, so one click can put it back.
const previous = atom({ plugin: 'prompt-master', key: 'previous' } as const, null as string | null)
// The prompt as the last rewrite left it, so a second press can tell what the
// user added since and work just that in.
const lastRewrite = atom({ plugin: 'prompt-master', key: 'lastRewrite' } as const, null as string | null)
// lastRewrite as it was before the latest rewrite, for Undo to restore.
const priorRewrite = atom({ plugin: 'prompt-master', key: 'priorRewrite' } as const, null as string | null)

const MODEL = 'haiku'

// The mod's icon (.claude-plugin/icon.png) as a small SVG: a rounded square with
// a violet-to-orange gradient and three four-point sparkles.
function sparkle(cx: number, cy: number, r: number): string {
  const points: string[] = []
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 4
    const rr = k % 2 === 0 ? r : r * 0.18
    points.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy - rr * Math.sin(a)).toFixed(2)}`)
  }
  return `<polygon points="${points.join(' ')}"/>`
}

const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#d97757"/>' +
  '</linearGradient></defs>' +
  '<rect width="100" height="100" rx="22" fill="url(#g)"/>' +
  `<g fill="#ffffff">${sparkle(46, 54, 34)}</g>` +
  `<g fill="#fff8e6">${sparkle(76, 25, 12)}${sparkle(78, 74, 7)}</g>` +
  '</svg>'

const SYSTEM = `You are Prompt Master. You rewrite a user's rough prompt for an AI coding/assistant agent (Claude) into a better prompt they will send in its place.

Rules:
- Keep the user's intent, scope and voice exactly. Never add requirements, features or facts they did not imply.
- Make it clear and specific: state the goal, relevant context the user gave, constraints, and what "done" looks like.
- Fix spelling and grammar. Turn vague words into concrete asks only where the meaning is unambiguous.
- Use short paragraphs or a brief bullet list when the request has several parts; keep simple requests to one or two sentences.
- If something important is missing, do not invent it; you may end with one short line like "If unclear, ask me about X first."
- Write it in the first person, as the user speaking to Claude.
- Output ONLY the rewritten prompt. No preamble, no quotes, no explanation.`

const REFINE_RULES = `
This time the prompt was already improved once, and the user then edited it.
You get the whole current prompt and, separately, exactly what the user added or changed.
- Treat the new text as rough input: rewrite it to the same standard as the rest.
- Move it to where it belongs in the prompt's structure (the goal, the context, a constraint, a bullet), merging with what is there instead of tacking it on at the end.
- If it changes or contradicts something already in the prompt, the new text wins.
- Keep the rest of the prompt as it is, apart from what is needed to fit the new text in.
- Output ONLY the full updated prompt.`

type Rewrite = { text: string } | { error: string }

// What the user changed in the last rewrite before pressing again: the one span
// that differs between the two, found by trimming what they share at each end.
export type Edit = { added: string; removed: string }

export function findEdit(lastRewrite: string, draft: string): Edit | null {
  if (!lastRewrite.trim()) return null
  let start = 0
  const max = Math.min(lastRewrite.length, draft.length)
  while (start < max && lastRewrite[start] === draft[start]) start++
  let end = 0
  while (
    end < max - start &&
    lastRewrite[lastRewrite.length - 1 - end] === draft[draft.length - 1 - end]
  ) {
    end++
  }
  // Mostly rewritten or replaced: not an edit of the last rewrite.
  if (start + end < lastRewrite.length * 0.5) return null
  const added = draft.slice(start, draft.length - end).trim()
  const removed = lastRewrite.slice(start, lastRewrite.length - end).trim()
  return added || removed ? { added, removed } : null
}

export function buildRequest(draft: string, edit: Edit | null): { system: string; prompt: string } {
  if (!edit) {
    return { system: SYSTEM, prompt: `Rough prompt:\n<rough>\n${draft}\n</rough>` }
  }
  const parts = [`Current prompt (already improved once, then edited by the user):\n<prompt>\n${draft}\n</prompt>`]
  if (edit.added) parts.push(`What the user added or rewrote:\n<added>\n${edit.added}\n</added>`)
  if (edit.removed) parts.push(`What the user deleted or replaced:\n<removed>\n${edit.removed}\n</removed>`)
  return { system: SYSTEM + '\n' + REFINE_RULES, prompt: parts.join('\n\n') }
}

async function rewrite($: EngineInterface, draft: string, edit: Edit | null): Promise<Rewrite> {
  const { system, prompt } = buildRequest(draft, edit)
  const r = await $.model.complete({
    model: MODEL,
    system,
    prompt,
    maxTokens: 2000,
    effort: 'low',
    timeoutMs: 60000,
  })
  if (!r.isAnswered) {
    return { error: r.reason === 'api-error' ? `API error ${r.status ?? ''}`.trim() : r.reason }
  }
  const text = r.text.trim()
  return text ? { text } : { error: 'empty reply' }
}

async function run($: EngineInterface, rough: string): Promise<string> {
  if (!rough.trim()) {
    return 'Type a rough prompt first, then press Prompt Master.'
  }
  if ((await read($, status)) === 'working') {
    return 'Prompt Master is already working.'
  }
  const last = await read($, lastRewrite)
  if (last !== null && rough.trim() === last.trim()) {
    return 'This prompt is already improved. Add or change something, then press Prompt Master again.'
  }
  const edit = last === null ? null : findEdit(last, rough)
  await update($, status, () => 'working' as Status)
  $.ui.status(edit ? 'Prompt Master: working in your changes…' : 'Prompt Master: rewriting…')
  try {
    const out = await rewrite($, rough, edit)
    if ('error' in out) {
      return `Prompt Master couldn't rewrite it (${out.error}).`
    }
    const filled = await $.prompt.fill({ text: out.text, mode: 'replace' })
    if (!filled.isFilled) {
      return 'Prompt Master: the prompt box is busy; close any dialog and try again.'
    }
    await update($, previous, () => rough)
    await update($, priorRewrite, () => last)
    // The model's text, not filled.text: the box may report '' to a plugin.
    await update($, lastRewrite, () => out.text)
    return edit
      ? 'Your changes are worked in. Review the prompt, then press Enter to send.'
      : 'Prompt rewritten. Review it, then press Enter to send.'
  } finally {
    await update($, status, () => 'idle' as Status)
    $.ui.status(undefined)
  }
}

export const register: Register = on => {
  // A sent prompt is done with: the next one starts fresh, with nothing to undo.
  on('prompt.submit', async ($, e, next) => {
    await update($, lastRewrite, () => null)
    await update($, priorRewrite, () => null)
    await update($, previous, () => null)
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prompt-master',
      description: 'Rewrite a rough prompt into a better one and put it in the prompt box',
      argumentHint: '[rough prompt]',
    })
    return next(e)
  })

  on('command.run', { command: 'prompt-master' }, async ($, e) => {
    const message = await run($, e.args)
    return { text: message, isTextDisplayOnly: true }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // Surfaces that draw SVG show the real icon; the terminal keeps the ✨.
    const icon = 'Svg' in ui ? <ui.Svg source={ICON_SVG} alt="Prompt Master icon" width={18} height={18} /> : null
    const sparkleLabel = icon ? '' : '✨ '
    const isWorking = (await read($, status)) === 'working'
    const before = await read($, previous)

    const master = async () => {
      const { text } = await $.prompt.read()
      $.ui.toast(await run($, text))
    }

    const undo = async () => {
      if (before === null) return
      const filled = await $.prompt.fill({ text: before, mode: 'replace' })
      if (filled.isFilled) {
        await update($, previous, () => null)
        // Back to before that rewrite, so the next press compares against it.
        const prior = await read($, priorRewrite)
        await update($, lastRewrite, () => prior)
        await update($, priorRewrite, () => null)
        $.ui.toast('Your original prompt is back.')
      }
    }

    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        {icon}
        {isWorking ? (
          <Text dimColor>{sparkleLabel}Prompt Master is rewriting your prompt…</Text>
        ) : (
          <Button key="master" label={`${sparkleLabel}Prompt Master`} hotkey="p" onPress={master} />
        )}
        {!isWorking && before !== null ? (
          <Button key="undo" label="Undo rewrite" dimColor onPress={undo} />
        ) : null}
      </Box>
    )
  })
}
