import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Status } from '../types'

const status = atom({ plugin: 'prompt-master', key: 'status' } as const, 'idle' as Status)
// The draft before the last rewrite, so one click can put it back.
const previous = atom({ plugin: 'prompt-master', key: 'previous' } as const, null as string | null)

const MODEL = 'haiku'

const SYSTEM = `You are Prompt Master. You rewrite a user's rough prompt for an AI coding/assistant agent (Claude) into a better prompt they will send in its place.

Rules:
- Keep the user's intent, scope and voice exactly. Never add requirements, features or facts they did not imply.
- Make it clear and specific: state the goal, relevant context the user gave, constraints, and what "done" looks like.
- Fix spelling and grammar. Turn vague words into concrete asks only where the meaning is unambiguous.
- Use short paragraphs or a brief bullet list when the request has several parts; keep simple requests to one or two sentences.
- If something important is missing, do not invent it; you may end with one short line like "If unclear, ask me about X first."
- Write it in the first person, as the user speaking to Claude.
- Output ONLY the rewritten prompt. No preamble, no quotes, no explanation.`

type Rewrite = { text: string } | { error: string }

async function rewrite($: EngineInterface, rough: string): Promise<Rewrite> {
  const r = await $.model.complete({
    model: MODEL,
    system: SYSTEM,
    prompt: `Rough prompt:\n<rough>\n${rough}\n</rough>`,
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
  await update($, status, () => 'working' as Status)
  $.ui.status('Prompt Master: rewriting…')
  try {
    const out = await rewrite($, rough)
    if ('error' in out) {
      return `Prompt Master couldn't rewrite it (${out.error}).`
    }
    const filled = await $.prompt.fill({ text: out.text, mode: 'replace' })
    if (!filled.isFilled) {
      return 'Prompt Master: the prompt box is busy; close any dialog and try again.'
    }
    await update($, previous, () => rough)
    return 'Prompt rewritten. Review it, then press Enter to send.'
  } finally {
    await update($, status, () => 'idle' as Status)
    $.ui.status(undefined)
  }
}

export const register: Register = on => {
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
    const { Box, Button, Text } = $.ui.resolve(e)
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
        $.ui.toast('Your original prompt is back.')
      }
    }

    return (
      <Box>
        {isWorking ? (
          <Text dimColor>✨ Prompt Master is rewriting your prompt…</Text>
        ) : (
          <Button key="master" label="✨ Prompt Master" hotkey="p" onPress={master} />
        )}
        {!isWorking && before !== null ? (
          <Box marginLeft={1}>
            <Button key="undo" label="Undo rewrite" dimColor onPress={undo} />
          </Box>
        ) : null}
      </Box>
    )
  })
}
