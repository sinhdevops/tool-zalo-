import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const children = [
  spawn(process.execPath, ['server/index.ts'], { cwd: root, stdio: 'inherit', windowsHide: true }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', windowsHide: true }),
]
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill()
  process.exitCode = code
}
for (const child of children) {
  child.on('error', () => { console.error('Không thể khởi động dev server.'); stop(1) })
  child.on('exit', (code) => stop(code ?? 0))
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
