import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const OPENF1_BASE = 'https://api.openf1.org/v1'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const url = new URL(req.url)
    const path = url.pathname.replace(/^\/openf1-proxy/, '')
    const search = url.search

    const target = `${OPENF1_BASE}${path}${search}`
    console.log('Proxying:', target)

    const response = await fetch(target, {
      headers: { 'Accept': 'application/json' },
    })

    const data = await response.text()

    return new Response(data, {
      status: response.status,
      headers: {
        ...CORS,
        'Content-Type': 'application/json',
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
