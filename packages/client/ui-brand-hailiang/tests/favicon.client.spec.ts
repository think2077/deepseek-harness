// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { installFavicon } from '../src/client/favicon.ts'

const MARK = 'data:image/png;base64,AAAA'

afterEach(() => { document.head.innerHTML = '' })

describe('installFavicon', () => {
  it('retargets the shipped favicon link and restores it on dispose', () => {
    document.head.innerHTML = '<link rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg" />'
    const link = document.querySelector('link[rel="icon"]')!
    const dispose = installFavicon(MARK)
    expect(link.getAttribute('href')).toBe(MARK)
    expect(link.getAttribute('type')).toBe('image/png')
    expect(link.getAttribute('sizes')).toBe('any')
    dispose()
    expect(link.getAttribute('href')).toBe('/favicon.svg')
    expect(link.getAttribute('type')).toBe('image/svg+xml')
    expect(link.getAttribute('sizes')).toBe('any')
  })

  it('creates a link when the document has none and removes it on dispose', () => {
    const dispose = installFavicon(MARK)
    const links = document.querySelectorAll('link[rel~="icon"]')
    expect(links).toHaveLength(1)
    expect(links[0]!.getAttribute('href')).toBe(MARK)
    dispose()
    expect(document.querySelectorAll('link[rel~="icon"]')).toHaveLength(0)
  })
})
