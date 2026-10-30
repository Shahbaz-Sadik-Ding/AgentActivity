// Builds a double-clickable Windows app folder: release/AgentActivity/AgentActivity.exe
// It reuses the local Electron runtime (no download) and puts the built app inside it.
//   npm run package
import fs from 'node:fs'
import path from 'node:path'
import { rcedit } from 'rcedit'

const root = path.resolve('.')
const out = path.join(root, 'release', 'AgentActivity')
const exe = path.join(out, 'AgentActivity.exe')
const app = path.join(out, 'resources', 'app')

if (!fs.existsSync(path.join(root, 'out', 'main', 'index.js'))) throw new Error('run "npm run build" first')

fs.rmSync(out, { recursive: true, force: true })
fs.cpSync(path.join(root, 'node_modules', 'electron', 'dist'), out, { recursive: true })
fs.renameSync(path.join(out, 'electron.exe'), exe)
fs.rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true })

// userData is pinned to the old ai-notch folder in main/index.ts, so renaming the package keeps the hook token.
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
fs.mkdirSync(app, { recursive: true })
fs.writeFileSync(
  path.join(app, 'package.json'),
  JSON.stringify({ name: pkg.name, version: pkg.version, main: pkg.main }, null, 2)
)
fs.cpSync(path.join(root, 'out'), path.join(app, 'out'), { recursive: true })
fs.cpSync(path.join(root, 'resources'), path.join(app, 'resources'), { recursive: true })

await rcedit(exe, {
  icon: path.join(root, 'resources', 'icon.ico'),
  'version-string': { ProductName: 'AgentActivity', FileDescription: 'Agent Activity', OriginalFilename: 'AgentActivity.exe' },
  'file-version': pkg.version,
  'product-version': pkg.version
})
console.log('built', exe)
