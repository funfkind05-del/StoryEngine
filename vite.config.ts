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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ideogramPlugin()],
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
