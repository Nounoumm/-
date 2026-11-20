import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const bundledPython = path.join(process.env.USERPROFILE || os.homedir(), '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'python.exe')

export const config = {
  root,
  port: Number(process.env.PORT || 4173),
  pythonPath: process.env.PYTHON_PATH || (existsSync(bundledPython) ? bundledPython : 'python'),
  deepseekKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
}
