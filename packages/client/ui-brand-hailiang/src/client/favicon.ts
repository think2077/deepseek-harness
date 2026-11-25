/** Deployment brand favicon swap for the browser tab. */

/**
 * Point every `<link rel="icon">` at the deployment mark.
 *
 * The Web shell ships a repository-level `favicon.svg`; a deployment brand
 * only becomes the tab icon once the client bundle loads, so this runs at
 * plugin apply time and is undone when the plugin is disposed.
 * @param href - data or document URL of the brand icon.
 * @returns Disposer restoring the previous links.
 */
export function installFavicon(href: string): () => void {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'))
  const previous = links.map(link => ({
    link,
    href: link.getAttribute('href'),
    type: link.getAttribute('type'),
    sizes: link.getAttribute('sizes'),
  }))
  let created: HTMLLinkElement | undefined
  if (links.length === 0) {
    created = document.createElement('link')
    created.rel = 'icon'
    document.head.append(created)
    links.push(created)
  }
  for (const link of links) {
    link.setAttribute('href', href)
    link.setAttribute('type', 'image/png')
    link.setAttribute('sizes', 'any')
  }
  return () => {
    for (const { link, href: oldHref, type, sizes } of previous) {
      if (oldHref === null) link.removeAttribute('href')
      else link.setAttribute('href', oldHref)
      if (type === null) link.removeAttribute('type')
      else link.setAttribute('type', type)
      if (sizes === null) link.removeAttribute('sizes')
      else link.setAttribute('sizes', sizes)
    }
    created?.remove()
  }
}
