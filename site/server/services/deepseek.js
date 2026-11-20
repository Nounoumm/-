import { config } from '../config.js'
import { assertSpec } from '../lib/validation.js'

export async function requestJson(messages, signal) {
  if (!config.deepseekKey) throw new Error('服务器尚未配置 DEEPSEEK_API_KEY。')
  const timer = AbortSignal.timeout(120_000)
  const combined = signal ? AbortSignal.any([signal, timer]) : timer
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${config.deepseekKey}`, 'Content-Type': 'application/json' }, signal: combined,
    body: JSON.stringify({ model: config.deepseekModel, temperature: 0.35, response_format: { type: 'json_object' }, messages }),
  })
  if (!response.ok) throw new Error(`生成服务暂时不可用（${response.status}）。`)
  const data = await response.json(); const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.length > 4_000_000) throw new Error('生成服务返回内容为空或过大。')
  try { return JSON.parse(content) } catch { throw new Error('生成服务返回了无法解析的 JSON。') }
}

export async function requestHandout(messages, signal) { return assertSpec(await requestJson(messages, signal)) }
