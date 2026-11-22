// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { ComponentProps } from 'react'
import { Workbench } from '../src/client/Workbench.tsx'
import { en, type WorkbenchLocaleKey } from '../src/client/locales.ts'
import type {} from '../src/client/index.ts'

afterEach(cleanup)
it('shows disabled future tools, filters stages and opens both mock previews', () => {
  render(<Workbench {...({ t: (key: WorkbenchLocaleKey) => en[key] } as unknown as ComponentProps<typeof Workbench>)} />)
  expect(screen.getAllByRole('listitem')).toHaveLength(10)
  expect((screen.getByRole('button', { name: /Market scanning/ }) as HTMLButtonElement).disabled).toBe(true)
  for (const name of [/^Solutions/, /^Pre-visit plan/]) {
    fireEvent.click(screen.getByRole('button', { name }))
    expect(screen.getByRole('dialog').textContent).toContain(en.mock)
    fireEvent.click(screen.getByRole('button', { name: en.close }))
    expect(screen.queryByRole('dialog')).toBeNull()
  }
  fireEvent.click(screen.getByRole('button', { name: en.operations }))
  expect(screen.getAllByRole('listitem')).toHaveLength(5)
  expect(screen.queryByText(en.node0Title)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: en.business }))
  expect(screen.getByText(en.node0Title)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: en.all }))
  expect(screen.getAllByRole('listitem')).toHaveLength(10)
})
