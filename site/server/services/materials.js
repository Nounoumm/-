import path from 'node:path'

const allowed = new Set(['.pdf', '.docx', '.pptx', '.txt', '.md', '.markdown'])
const maxFiles = 5
const maxFileBytes = 10 * 1024 * 1024
const maxTotalBytes = 25 * 1024 * 1024
const maxChars = 100000

function bytesFor(file) { return file.data ? Buffer.byteLength(String(file.data), 'base64') : Buffer.byteLength(String(file.text || ''), 'utf8') }
async function decodeFile(file) { return file.data ? Buffer.from(String(file.data), 'base64') : Buffer.from(String(file.text || ''), 'utf8') }

async function parseText(buffer, ext) {
  if (ext === '.txt' || ext === '.md' || ext === '.markdown') return buffer.toString('utf8')
  if (ext === '.pdf') { try { const { default: pdfParse } = await import('pdf-parse'); return (await pdfParse(buffer)).text } catch (error) { throw new Error(`PDF 文本提取失败：${error.message}`) } }
  if (ext === '.docx') { try { const mammoth = await import('mammoth'); return (await mammoth.extractRawText({ buffer })).value } catch (error) { throw new Error(`DOCX 文本提取失败：${error.message}`) } }
  if (ext === '.pptx') { try { const { unzipSync, strFromU8 } = await import('fflate'); const archive = unzipSync(new Uint8Array(buffer)); return Object.entries(archive).filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).map(([, bytes]) => strFromU8(bytes).replace(/<[^>]+>/g, ' ')).join('\n') } catch (error) { throw new Error(`PPTX 文本提取失败：${error.message}`) } }
  throw new Error(`不支持的资料格式：${ext}`)
}

export async function extractTextFiles(files = []) {
  if (!Array.isArray(files) || files.length > maxFiles) throw new Error(`一次最多上传 ${maxFiles} 个文件。`)
  if (files.reduce((total, file) => total + bytesFor(file), 0) > maxTotalBytes) throw new Error('资料文件总大小不能超过 25 MiB。')
  const result = []
  for (const file of files) {
    const name = String(file.name || '').slice(0, 160); const ext = path.extname(name).toLowerCase()
    if (!allowed.has(ext)) throw new Error(`不支持的资料格式：${name}`)
    const bytes = bytesFor(file); if (!bytes || bytes > maxFileBytes) throw new Error(`资料大小无效或超过 10 MiB：${name}`)
    const text = (await parseText(await decodeFile(file), ext)).replace(/\u0000/g, '').trim()
    if (!text) throw new Error(`资料为空：${name}`)
    result.push({ name, chars: text.length, text: text.slice(0, maxChars) })
  }
  if (result.reduce((sum, item) => sum + item.chars, 0) > maxChars) throw new Error('资料文本总长度不能超过 100,000 个字符。')
  return result
}
