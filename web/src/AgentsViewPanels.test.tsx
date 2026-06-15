// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ReadPanel } from './AgentsViewPanels'

afterEach(() => {
  cleanup()
})

describe('ReadPanel', () => {
  it('renders agent metadata badges without crashing', () => {
    render(
      <ReadPanel
        agent={{
          id: 'dev',
          label: 'Developer',
          summary: 'Builds changes',
          surface: 'build',
          identity: 'You are the developer.',
          identitySource: 'custom',
          systemPrompt: 'Ship the implementation.',
          systemPromptSource: 'default',
          tools: ['read_file'],
          model: 'claude-sonnet-4-5',
          runtime: 'cf-native',
          maxTokens: 16_384,
          editable: { fields: ['identity'], via: 'PUT /roles' },
        }}
      />,
    )

    expect(screen.getByText('customized')).toBeTruthy()
    expect(screen.getByText('read_file')).toBeTruthy()
    expect(screen.getByText(/claude-sonnet-4-5/)).toBeTruthy()
  })
})
