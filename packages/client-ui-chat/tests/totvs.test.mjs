import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const code = await readFile(new URL('../totvs/client.js', import.meta.url), 'utf8')

function activate(document) {
  let factory
  runInNewContext(code, {
    document, AbortController, URL, Blob, console,
    fetch: () => { throw new Error('Unexpected network request') },
    window: { __ModuleLoader__: { load: entry => { factory = entry.factory } } },
  })
  const plugin = factory(name => require(name))
  const contributions = new Map()
  const disposers = []
  const ctx = {
    effect: create => { disposers.push(create()) },
    slots: {
      inject(_name, create) { disposers.push(create()) },
      register(options, Component) {
        contributions.set(options.name, { options, Component })
        return () => contributions.delete(options.name)
      },
    },
  }
  plugin.apply(ctx)
  return {
    contributions,
    dispose() { for (const dispose of disposers.splice(0).reverse()) dispose() },
  }
}

test('TOTVS activation registers the full theme with higher precedence than Everywhere', () => {
  const dom = new JSDOM('<title>Harness</title>')
  try {
    const active = activate(dom.window.document)
    assert.equal(active.contributions.size, 5)
    for (const { options } of active.contributions.values()) assert.equal(options.priority, -90)
    assert.equal(dom.window.document.querySelector('style').dataset.plugin, '@everywhere-harness/client-ui-chat/totvs')
    assert.equal(dom.window.document.querySelector('meta[name="apple-mobile-web-app-title"]').content, 'TOTVS CODE')
    active.dispose()
    assert.equal(active.contributions.size, 0)
    assert.equal(dom.window.document.querySelector('style'), null)
  } finally {
    dom.window.close()
  }
})

test('TOTVS renders the supplied symbol, requested name and plus hover particles', () => {
  const dom = new JSDOM('<title>Harness</title>')
  try {
    const active = activate(dom.window.document)
    const Sidebar = active.contributions.get('sidebar.brand.mark').Component
    const Brand = active.contributions.get('sidebar.brand.name').Component
    const Hero = active.contributions.get('conversation.hero.brand.mark').Component
    const Running = active.contributions.get('conversation.chat.running.icon').Component
    const html = renderToStaticMarkup(createElement('div', null,
      createElement(Sidebar, { size: 24 }),
      createElement(Brand),
      createElement(Hero, { size: 34 }),
      createElement(Running),
    ))
    assert.match(html, /TOTVS ENG V&amp;D/)
    assert.match(html, />CODE</)
    assert.equal((html.match(/M3\.173 0\.584/g) ?? []).length, 3)
    assert.equal((html.match(/totvs-chat-floating-plus /g) ?? []).length, 3)
    assert.doesNotMatch(html, /floating-heart|HeartArtwork/)
    const css = dom.window.document.querySelector('style').textContent
    assert.match(css, /totvs-chat-hero-heartbeat-rotate/)
    assert.match(css, /totvs-chat-running-pulse-rotate/)
    assert.match(css, /rotate\(340deg\)/)
    active.dispose()
  } finally {
    dom.window.close()
  }
})
