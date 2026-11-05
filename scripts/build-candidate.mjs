import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, realpathSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { createRequire } from 'node:module'

const root = resolve(import.meta.dirname, '..')
process.chdir(root)
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
if (git('status', '--porcelain')) throw new Error('Candidate requires a clean committed source tree')
if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Use Node 22')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(e =>
    e.isDirectory() ? files(resolve(dir, e.name)) : [resolve(dir, e.name)])
}
const out = resolve(root, 'candidate')
rmSync(out, { recursive: true, force: true })
mkdirSync(out)
// Invoke the installed Vite entry directly, equally on POSIX and Windows.
const require = createRequire(resolve(root, 'web/package.json'))
const vite = resolve(require.resolve('vite/package.json'), '../bin/vite.js')
execFileSync(process.execPath, [vite, 'build', '--mode', 'candidate', '--outDir', '../candidate/site'], {
  cwd: resolve(root, 'web'), stdio: 'inherit',
})
const site = resolve(out, 'site')
// Pages production headers and push workers are not part of this handoff.
rmSync(resolve(site, '_headers'), { force: true })
rmSync(resolve(site, 'push-sw.js'), { force: true })
// The SDK exposes only an ESM import condition, so require.resolve cannot resolve it.
const sdk = realpathSync(resolve(root, 'web/node_modules/@proappstore/sdk'))
const sdkPackage = JSON.parse(readFileSync(resolve(sdk, 'package.json'), 'utf8'))
const digests = (dir) => Object.fromEntries(files(dir).map(file => [relative(dir, file).replaceAll('\\', '/'), hash(readFileSync(file))]))
const outputs = digests(site)
writeFileSync(resolve(out, 'manifest.json'), JSON.stringify({
  schema: 1, consoleRevision: git('rev-parse', 'HEAD'),
  lockfileSha256: hash(readFileSync('pnpm-lock.yaml')),
  node: process.versions.node, packageManager: JSON.parse(readFileSync('package.json')).packageManager,
  mode: 'candidate', sdk: { name: sdkPackage.name, version: sdkPackage.version, files: digests(resolve(sdk, 'dist')) },
  buildSha256: hash(JSON.stringify(outputs)), files: outputs,
}, null, 2) + '\n')
