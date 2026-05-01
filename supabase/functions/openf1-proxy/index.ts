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

    // ?endpoint=/weather&session_key=11280
    const endpoint = url.searchParams.get('endpoint')
    if (!endpoint) {
      return new Response(JSON.stringify({ error: 'Missing ?endpoint= parameter' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Alle anderen Query-Parameter weiterleiten (außer "endpoint")
    const forwardParams = new URLSearchParams()
    for (const [k, v] of url.searchParams.entries()) {
      if (k !== 'endpoint') forwardParams.set(k, v)
    }

    const target = `${OPENF1_BASE}${endpoint}?${forwardParams.toString()}`
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
