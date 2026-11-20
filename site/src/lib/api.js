async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
  const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) throw new Error(body?.error || body?.message || `请求失败（${response.status}）`)
  return body
}

export const api = {
  templates: () => request('/api/templates'),
  extractMaterials: (files) => request('/api/materials/extract', { method: 'POST', body: JSON.stringify({ files }) }),
  outline: (input, signal) => request('/api/handouts/outline', { method: 'POST', body: JSON.stringify(input), signal }),
  check: (spec, signal) => request('/api/handouts/check', { method: 'POST', body: JSON.stringify({ spec }), signal }),
  generate: (input, signal, onProgress) => new Promise(async (resolve, reject) => {
    try {
      const response = await fetch('/api/handouts/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal })
      if (!response.ok) throw new Error((await response.json()).error || `请求失败（${response.status}）`)
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n'); buffer = events.pop()
        for (const event of events) {
          const data = event.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim(); if (!data) continue
          const payload = JSON.parse(data); if (payload.type === 'progress') onProgress?.(payload); if (payload.type === 'result') resolve(payload.spec); if (payload.type === 'error') reject(new Error(payload.error))
        }
      }
      if (!buffer.includes('"result"')) reject(new Error('生成服务没有返回完整结果。'))
    } catch (error) { reject(error) }
  }),
  docx: async (spec) => {
    const response = await fetch('/api/handouts/docx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec }) })
    if (!response.ok) throw new Error((await response.json()).error || 'DOCX 导出失败。')
    return response.blob()
  },
  community: (query = '') => request(`/api/community/handouts${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  publish: (payload) => request('/api/community/handouts', { method: 'POST', body: JSON.stringify(payload) }),
  report: (id, payload) => request(`/api/community/handouts/${id}/reports`, { method: 'POST', body: JSON.stringify(payload) }),
}
