import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Serve the Vercel function at /api/relay during `vite dev` and `vite preview`, so passkeys work locally too.
function relayApi(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '')
  // Block body on purpose: a returned function would be run by Vite as a post-middleware hook.
  const mount = (server: { middlewares: any }) => { server.middlewares.use('/api/relay', async (req: any, res: any) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const { relay } = await import('./api/relay.ts')
    const { xdr } = JSON.parse(body || '{}')
    const r = await relay(xdr, env.CHANNELS_API_KEY)
    res.statusCode = r.status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(r.body))
  }) }
  return { name: 'relay-api', configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), relayApi(mode)],
}))
