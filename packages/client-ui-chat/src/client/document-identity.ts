interface IdentityAdapters {
  fetch?: typeof fetch
  urls?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>
  onError?: (error: unknown) => void
}

export interface DocumentIdentityOptions {
  pluginId?: string
  applicationName?: string
  shortName?: string
  errorLabel?: string
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected a manifest object')
  }
  return value as Record<string, unknown>
}

function rebaseManifest(manifest: Record<string, unknown>, base: string): void {
  const rebase = (entry: Record<string, unknown>, key: string, from = base) => {
    if (!(key in entry)) return
    if (typeof entry[key] !== 'string') throw new TypeError(`Invalid manifest ${key}`)
    entry[key] = new URL(entry[key], from).href
  }
  const entries = (entry: Record<string, unknown>, key: string, visit: (item: Record<string, unknown>) => void) => {
    if (!(key in entry)) return
    const items = entry[key]
    if (!Array.isArray(items)) throw new TypeError(`Invalid manifest ${key}`)
    for (const item of items) visit(record(item))
  }
  const images = (entry: Record<string, unknown>, key: string) => entries(entry, key, image => rebase(image, 'src'))
  for (const key of ['start_url', 'scope']) rebase(manifest, key)
  const start = typeof manifest.start_url === 'string' ? manifest.start_url : base
  rebase(manifest, 'id', `${new URL(start).origin}/`)
  images(manifest, 'icons')
  images(manifest, 'screenshots')
  entries(manifest, 'shortcuts', shortcut => {
    rebase(shortcut, 'url')
    images(shortcut, 'icons')
  })
  entries(manifest, 'file_handlers', handler => {
    rebase(handler, 'action')
    images(handler, 'icons')
  })
  entries(manifest, 'protocol_handlers', handler => rebase(handler, 'url'))
  entries(manifest, 'related_applications', app => rebase(app, 'url'))
  if ('share_target' in manifest) rebase(record(manifest.share_target), 'action')
  if ('serviceworker' in manifest) {
    const worker = record(manifest.serviceworker)
    rebase(worker, 'src')
    rebase(worker, 'scope')
  }
}

/**
 * Mount scoped styles and reversible application metadata without owning the tab title.
 * @param target - Document hosting this plugin instance.
 * @param css - Plugin-owned, prefixed stylesheet.
 * @param adapters - Optional browser adapters and observable failure reporting.
 * @returns Idempotent removal of only this instance's presentation and pending work.
 */
export function installDocumentIdentity(
  target: Document,
  css: string,
  adapters: IdentityAdapters = {},
  options: DocumentIdentityOptions = {},
): () => void {
  const {
    pluginId = '@everywhere-harness/client-ui-chat',
    applicationName = 'EveryWhere Harness',
    shortName = 'EWH',
    errorLabel = 'Everywhere application identity failed',
  } = options
  const style = target.createElement('style')
  style.dataset.plugin = pluginId
  style.textContent = css
  target.head.append(style)
  const existingMeta = target.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
  const meta = existingMeta ?? target.createElement('meta')
  const previousContent = meta.getAttribute('content')
  meta.name = 'apple-mobile-web-app-title'
  meta.content = shortName
  if (!existingMeta) target.head.append(meta)
  const manifestLink = target.querySelector<HTMLLinkElement>('link[rel~="manifest"]')
  const previousHref = manifestLink?.getAttribute('href')
  const controller = new AbortController()
  const urls = adapters.urls ?? globalThis.URL
  let ownedUrl: string | undefined
  let active = true
  if (manifestLink && previousHref !== null && previousHref !== undefined) {
    const manifestUrl = manifestLink.href
    void (async () => {
      try {
        const request = adapters.fetch ?? globalThis.fetch
        const response = await request(manifestUrl, {
          signal: controller.signal,
          credentials: manifestLink.crossOrigin === 'use-credentials' ? 'include' : 'same-origin',
        })
        if (!active) return
        if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`)
        const manifest = record(await response.json())
        if (!active || manifestLink.getAttribute('href') !== previousHref) return
        rebaseManifest(manifest, response.url || manifestUrl)
        manifest.name = applicationName
        manifest.short_name = shortName
        ownedUrl = urls.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }))
        manifestLink.href = ownedUrl
      } catch (error) {
        if (controller.signal.aborted) return
        if (adapters.onError) adapters.onError(error)
        else console.error(errorLabel, error)
      }
    })()
  }
  return () => {
    if (!active) return
    active = false
    controller.abort()
    style.remove()
    if (meta.getAttribute('content') === shortName) {
      if (!existingMeta) meta.remove()
      else if (previousContent === null) meta.removeAttribute('content')
      else meta.setAttribute('content', previousContent)
    }
    if (ownedUrl !== undefined) {
      if (manifestLink?.getAttribute('href') === ownedUrl) manifestLink.setAttribute('href', previousHref!)
      urls.revokeObjectURL(ownedUrl)
    }
  }
}