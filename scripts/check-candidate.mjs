import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'candidate/manifest.json')))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
assert.match(manifest.consoleRevision, /^[a-f0-9]{40}$/)
assert.equal(manifest.lockfileSha256, hash(readFileSync(resolve(root, 'pnpm-lock.yaml'))))
assert.equal(manifest.buildSha256, hash(JSON.stringify(manifest.files)))
assert.match(manifest.sdk.version, /^\d+\.\d+\.\d+/)
assert.ok(manifest.sdk.files['index.js'])
for (const [file, digest] of Object.entries(manifest.files)) {
  assert.equal(hash(readFileSync(resolve(root, 'candidate/site', file))), digest, file)
}
const html = readFileSync(resolve(root, 'candidate/site/index.html'), 'utf8')
assert.match(html, /connect-src 'self'/)
assert.match(html, /form-action 'self'/)
assert.doesNotMatch(html, /fonts\.google|registerSW|serviceWorker\.register/)
assert.equal(existsSync(resolve(root, 'candidate/site/sw.js')), false)
assert.equal(existsSync(resolve(root, 'candidate/site/_headers')), false)
const js = Object.keys(manifest.files).filter(p => p.endsWith('.js')).map(p =>
  readFileSync(resolve(root, 'candidate/site', p), 'utf8')).join('\n')
assert.ok(js.includes('/candidate-agents/v1'))
assert.ok(js.includes('Save public choices'))
assert.ok(js.includes('Sign in with Google'))
assert.ok(js.includes('synthetic_check_required'))
console.log('Candidate manifest, output integrity, isolation policy and real consumers verified')
