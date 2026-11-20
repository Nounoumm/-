import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { config } from '../config.js'

const builder = path.join(config.root, 'builder', 'handout_builder.py')

function runPython(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.pythonPath, [builder, ...args], { cwd: config.root, shell: false, signal: options.signal })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > 4_000_000) child.kill() })
    child.stderr.on('data', (chunk) => { stderr += chunk; if (stderr.length > 400_000) child.kill() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || stdout.trim() || `Python 退出码 ${code}`))
      const line = stdout.split(/\r?\n/).filter(Boolean).at(-1)
      try { resolve(JSON.parse(line)) } catch { reject(new Error('Python 构建器没有返回合法 JSON。')) }
    })
  })
}

export async function checkSpec(spec, signal) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'course-handout-check-')); const specPath = path.join(dir, 'spec.json')
  try { await writeFile(specPath, JSON.stringify(spec), 'utf8'); return await runPython(['check', '--spec', specPath], { signal }) } finally { await rm(dir, { recursive: true, force: true }) }
}

export async function buildDocx(spec, signal) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'course-handout-build-')); const specPath = path.join(dir, 'spec.json'); const outPath = path.join(dir, 'handout.docx')
  try { await writeFile(specPath, JSON.stringify(spec), 'utf8'); const result = await runPython(['build', '--spec', specPath, '--out', outPath], { signal }); return { ...result, bytes: await readFile(outPath) } } finally { await rm(dir, { recursive: true, force: true }) }
}
