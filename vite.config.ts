import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Ideogram art generation runs SERVER-SIDE so the API key (read from
// ~/Evolution/.env) never reaches the browser. The middleware calls
// the generate endpoint, downloads the image, and hands the client a
// data URI ready for the IndexedDB art store.
function readIdeogramKey(): string | null {
  try {
    const env = readFileSync(join(homedir(), 'Evolution', '.env'), 'utf8')
    const line = env.split('\n').find((l) => l.trim().startsWith('IDEOGRAM_API_KEY'))
    if (!line) return null
    return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
  } catch {
    return null
  }
}

function ideogramPlugin(): Plugin {
  return {
    name: 'storyengine-ideogram',
    configureServer(server) {
      server.middlewares.use('/artgen', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('POST only')
          return
        }
        const key = readIdeogramKey()
        if (!key) {
          res.statusCode = 503
          res.end(JSON.stringify({ error: 'No IDEOGRAM_API_KEY found in ~/Evolution/.env' }))
          return
        }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          void (async () => {
            try {
              const { prompt, aspect } = JSON.parse(body) as { prompt: string; aspect?: string }
              if (!prompt || prompt.length > 2000) throw new Error('Bad prompt.')
              // v3 endpoint first; fall back to the legacy generate API
              let imageUrl: string | null = null
              const v3 = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
                method: 'POST',
                headers: { 'Api-Key': key, 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, aspect_ratio: aspect ?? '1x1', rendering_speed: 'TURBO', num_images: 1 }),
              })
              if (v3.ok) {
                const data = (await v3.json()) as { data?: { url?: string }[] }
                imageUrl = data.data?.[0]?.url ?? null
              } else {
                const legacy = await fetch('https://api.ideogram.ai/generate', {
                  method: 'POST',
                  headers: { 'Api-Key': key, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ image_request: { prompt, aspect_ratio: 'ASPECT_1_1', model: 'V_2', magic_prompt_option: 'AUTO' } }),
                })
                if (!legacy.ok) throw new Error(`Ideogram: ${v3.status} then ${legacy.status} ${(await legacy.text()).slice(0, 200)}`)
                const data = (await legacy.json()) as { data?: { url?: string }[] }
                imageUrl = data.data?.[0]?.url ?? null
              }
              if (!imageUrl) throw new Error('Ideogram returned no image URL.')
              const img = await fetch(imageUrl)
              if (!img.ok) throw new Error(`Image download failed: ${img.status}`)
              const mime = img.headers.get('content-type') ?? 'image/png'
              const buf = Buffer.from(await img.arrayBuffer())
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ dataUri: `data:${mime};base64,${buf.toString('base64')}` }))
            } catch (e) {
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
            }
          })()
        })
      })
    },
  }
}

// OpenCode LLM bridge: the app speaks OpenAI chat-completions; this
// middleware translates each call into a throwaway opencode session
// driven by the "prose" agent (headless `opencode serve`). Tools are
// disabled per-request — a prose model must never edit this repo.
const OPENCODE_URL = process.env.OPENCODE_URL ?? 'http://127.0.0.1:4096'

function opencodePlugin(): Plugin {
  return {
    name: 'storyengine-opencode',
    configureServer(server) {
      server.middlewares.use('/oclm/v1', (req, res) => {
        void (async () => {
          try {
            if (req.method === 'GET' && req.url?.startsWith('/models')) {
              const ping = await fetch(`${OPENCODE_URL}/session/status`).catch(() => null)
              if (!ping?.ok) {
                res.statusCode = 503
                res.end(JSON.stringify({ error: `opencode serve is not reachable at ${OPENCODE_URL} — start it with: npm run llm-server` }))
                return
              }
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ data: [{ id: 'prose' }] }))
              return
            }
            if (req.method !== 'POST' || !req.url?.startsWith('/chat/completions')) {
              res.statusCode = 404
              res.end('Unknown /oclm route')
              return
            }
            let body = ''
            req.on('data', (c) => { body += c })
            await new Promise((resolve) => req.on('end', resolve))
            const { messages } = JSON.parse(body) as { messages: { role: string; content: string }[] }
            const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
            const turns = messages.filter((m) => m.role !== 'system')
            const transcript = turns.map((m) => (m.role === 'assistant' ? `[Your previous reply]: ${m.content}` : m.content)).join('\n\n')
            const created = await fetch(`${OPENCODE_URL}/session`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: 'storyengine-prose' }),
            })
            if (!created.ok) throw new Error(`opencode session create: ${created.status}`)
            const sid = ((await created.json()) as { id: string }).id
            try {
              const reply = await fetch(`${OPENCODE_URL}/session/${sid}/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  agent: 'prose',
                  system: system || undefined,
                  tools: { bash: false, write: false, edit: false, read: false, glob: false, grep: false, webfetch: false, todowrite: false, todoread: false, task: false },
                  parts: [{ type: 'text', text: transcript || '(continue)' }],
                }),
              })
              if (!reply.ok) throw new Error(`opencode prompt: ${reply.status} ${(await reply.text()).slice(0, 200)}`)
              const msg = (await reply.json()) as { parts?: { type: string; text?: string }[] }
              const content = (msg.parts ?? []).filter((pt) => pt.type === 'text').map((pt) => pt.text ?? '').join('\n').trim()
              if (!content) throw new Error('opencode returned no text parts')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ model: 'prose', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }))
            } finally {
              void fetch(`${OPENCODE_URL}/session/${sid}`, { method: 'DELETE' }).catch(() => {})
            }
          } catch (e) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
          }
        })()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ideogramPlugin(), opencodePlugin()],
  server: {
    proxy: {
      // Local LLM (LM Studio default port). The app talks to /llm/v1/...
      // so the browser never needs CORS enabled on the LLM server.
      '/llm': {
        target: 'http://localhost:1234',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llm/, ''),
      },
    },
  },
})
