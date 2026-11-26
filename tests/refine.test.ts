import { describe, expect, test } from 'claude-code/testing'

import { buildRequest, findEdit } from '../hooks/register'

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const FROM_COMPOSER = { kind: 'composer' } as const
const PRESENTATION = { isFullscreen: false, columns: 100 }

function run(args: string) {
  return { command: 'prompt-master', args, origin: FROM_COMPOSER, presentation: PRESENTATION }
}

const IMPROVED =
  'Fix the login bug on mobile: the Sign in button does nothing on iOS Safari. ' +
  'Find the cause, fix it, and confirm login works on mobile and desktop.'

describe('findEdit', () => {
  test('finds text added at the end of the last rewrite', async () => {
    const draft = IMPROVED + ' also it only happens after the session expires'
    expect(findEdit(IMPROVED, draft)).toEqual({
      added: 'also it only happens after the session expires',
      removed: '',
    })
  })

  test('finds text added in the middle', async () => {
    const draft = IMPROVED.replace('iOS Safari.', 'iOS Safari (and chrome on android too).')
    expect(findEdit(IMPROVED, draft)?.added).toBe('(and chrome on android too)')
  })

  test('finds a replaced word', async () => {
    const draft = IMPROVED.replace('iOS Safari', 'Android Chrome')
    const edit = findEdit(IMPROVED, draft)
    expect(edit?.added).toContain('Android Chrome')
    expect(edit?.removed).toContain('iOS Safari')
  })

  test('treats a brand-new prompt as no edit', async () => {
    expect(findEdit(IMPROVED, 'write a haiku about spring')).toBe(null)
  })

  test('an empty last rewrite is no edit', async () => {
    expect(findEdit('', 'anything at all')).toBe(null)
  })
})

describe('buildRequest', () => {
  test('a first press sends the plain rewrite request', async () => {
    const { system, prompt } = buildRequest('fix login thing', null)
    expect(prompt).toContain('<rough>\nfix login thing\n</rough>')
    expect(system).not.toContain('already improved once')
  })

  test('a second press names exactly what the user added', async () => {
    const draft = IMPROVED + ' also only after session expires'
    const { system, prompt } = buildRequest(draft, findEdit(IMPROVED, draft))
    expect(system).toContain('already improved once')
    expect(prompt).toContain('<added>\nalso only after session expires\n</added>')
    expect(prompt).toContain(`<prompt>\n${draft}\n</prompt>`)
  })
})

test('pressing again after an edit works the addition in', async ($, on) => {
  let draft = ''
  const sent: string[] = []
  on('command.register', () => ({ value: { command: 'prompt-master' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', (_, e) => {
    sent.push(e.prompt)
    return { value: { isAnswered: true, text: sent.length === 1 ? IMPROVED : 'REFINED', usage: USAGE } }
  })
  on('prompt.fill', (_, e) => {
    draft = e.text
    // As a real box may: it took the text but reports '' to the plugin.
    return { isFilled: true, text: '', cursor: 0 }
  })
  on('ui.status', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.command.run(run('fix login thing on mobile'))
  expect(draft).toBe(IMPROVED)

  await $.command.run(run(IMPROVED + ' only after session expires'))
  expect(draft).toBe('REFINED')
  expect(sent[1]).toContain('<added>\nonly after session expires\n</added>')
})

test('a sent prompt clears the memory, so the next one starts fresh', async ($, on) => {
  const sent: string[] = []
  on('command.register', () => ({ value: { command: 'prompt-master' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', (_, e) => {
    sent.push(e.prompt)
    return { value: { isAnswered: true, text: IMPROVED, usage: USAGE } }
  })
  on('prompt.fill', () => ({ isFilled: true, text: '', cursor: 0 }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.status', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(run('fix login thing'))
  await $.prompt.submit({ text: IMPROVED, wait: false, origin: FROM_COMPOSER })
  await $.command.run(run(IMPROVED + ' and add tests'))

  expect(sent[1]).toContain('<rough>')
  expect(sent[1]).not.toContain('<added>')
})
