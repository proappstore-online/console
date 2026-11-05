// Artifact-only smoke: no enrollment, profile or ledger API responses are faked.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, extname, sep } from 'node:path'
import { createRequire } from 'node:module'

const root = resolve(import.meta.dirname, '..')
const site = resolve(root, 'candidate/site')
const require = createRequire(resolve(root, 'web/package.json'))
const { chromium } = require('@playwright/test')
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname
  if (pathname.startsWith('/v1/') || pathname.startsWith('/.pas/')) {
    res.writeHead(404); res.end(); return
  }
  const file = resolve(site, '.' + (pathname === '/' ? '/index.html' : pathname))
  if (!file.startsWith(site + sep) || !existsSync(file)) {
    res.writeHead(404); res.end(); return
  }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream')
  res.end(readFileSync(file))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let browser
try {
  browser = await chromium.launch()
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const external = []
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue()
    external.push(route.request().url()); return route.abort()
  })
  const page = await context.newPage()
  await page.goto(`${origin}/#/promoter?app=sample`)
  await page.getByRole('button', { name: 'Sign in with Google' }).waitFor()
  assert.deepEqual(external, [], 'candidate startup must not attempt external requests')
  // CSP must reject this before the context/network boundary sees it.
  assert.equal(await page.evaluate(async () => {
    try { await fetch('https://api.proappstore.online/v1/me'); return false } catch { return true }
  }), true)
  assert.deepEqual(external, [])
  const authRequest = page.waitForRequest(r => new URL(r.url()).pathname === '/v1/auth/google/start')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()
  const target = new URL((await authRequest).url())
  assert.equal(target.origin, origin)
  assert.equal(target.searchParams.get('app_id'), 'console')
  const returnTo = new URL(target.searchParams.get('return_to'))
  assert.equal(returnTo.origin, origin)
  assert.equal(returnTo.searchParams.get('promoter_app'), 'sample')
  assert.deepEqual(external, [])
  console.log('Candidate startup, CSP and actual SDK OAuth start routing passed')
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
