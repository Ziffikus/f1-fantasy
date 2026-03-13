// Supabase Edge Function: send-push
// Sendet Web Push Notifications an einen oder alle Spieler
// Deploy: supabase functions deploy send-push

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { profile_id, title, body, url, tag } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Subscriptions laden
    let query = supabase.from('push_subscriptions').select('*')
    if (profile_id) query = query.eq('profile_id', profile_id)
    const { data: subs, error } = await query
    if (error) throw error
    if (!subs?.length) return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
    const vapidPublicKey  = Deno.env.get('VAPID_PUBLIC_KEY')!
    const vapidEmail      = Deno.env.get('VAPID_EMAIL') ?? 'mailto:admin@f1fantasy.tbe'

    let sent = 0
    const failed = []

    for (const sub of subs) {
      try {
        const payload = JSON.stringify({ title, body, url: url ?? '/f1-fantasy/', tag: tag ?? 'f1-fantasy' })

        // Web Push Protocol
        const pushSub = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }

        await sendWebPush(pushSub, payload, { vapidPublicKey, vapidPrivateKey, vapidEmail })
        sent++
      } catch (e) {
        failed.push({ endpoint: sub.endpoint.slice(0, 40), error: e.message })
        // Abgelaufene Subscriptions löschen
        if (e.message?.includes('410') || e.message?.includes('404')) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      }
    }

    return new Response(
      JSON.stringify({ sent, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ── Web Push Implementierung (Deno-kompatibel) ────────────────
async function sendWebPush(subscription, payload, { vapidPublicKey, vapidPrivateKey, vapidEmail }) {
  const endpoint = subscription.endpoint
  const audience = new URL(endpoint).origin

  // VAPID JWT erstellen
  const now = Math.floor(Date.now() / 1000)
  const jwtHeader = btoa(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const jwtPayload = btoa(JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: vapidEmail })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const privateKeyBytes = base64ToBytes(vapidPrivateKey)
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )

  const sigData = new TextEncoder().encode(`${jwtHeader}.${jwtPayload}`)
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, sigData)
  const jwt = `${jwtHeader}.${jwtPayload}.${bytesToBase64Url(new Uint8Array(sig))}`

  // Payload verschlüsseln
  const encrypted = await encryptPayload(subscription, payload)

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${vapidPublicKey}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body: encrypted,
  })

  if (!res.ok && res.status !== 201) {
    throw new Error(`Push failed: ${res.status}`)
  }
}

async function encryptPayload(subscription, payload) {
  const p256dh = base64ToBytes(subscription.keys.p256dh)
  const auth   = base64ToBytes(subscription.keys.auth)

  const serverKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const serverPublicKey = await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)

  const clientKey = await crypto.subtle.importKey('raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const sharedSecret = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKeyPair.privateKey, 256)

  const salt = crypto.getRandomValues(new Uint8Array(16))

  // HKDF
  const authInfo    = new TextEncoder().encode('Content-Encoding: auth\0')
  const keyInfo     = new TextEncoder().encode('Content-Encoding: aes128gcm\0')
  const nonceInfo   = new TextEncoder().encode('Content-Encoding: nonce\0')

  const ikm = await hkdf(auth, new Uint8Array(sharedSecret), authInfo, 32)
  const contentKey = await hkdf(salt, ikm, concat(keyInfo, new Uint8Array(serverPublicKey)), 16)
  const nonce      = await hkdf(salt, ikm, concat(nonceInfo, new Uint8Array(serverPublicKey)), 12)

  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt'])
  const payloadBytes = new TextEncoder().encode(payload)
  const padded = concat(payloadBytes, new Uint8Array([2]))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded)

  // aes128gcm header: salt(16) + recordSize(4) + keyLength(1) + serverPublicKey(65) + ciphertext
  const serverPubRaw = new Uint8Array(serverPublicKey)
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096, false)
  const kl = new Uint8Array([serverPubRaw.length])
  return concat(salt, rs, kl, serverPubRaw, new Uint8Array(encrypted))
}

async function hkdf(salt, ikm, info, length) {
  const saltKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const prk = await crypto.subtle.sign('HMAC', saltKey, ikm)
  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const t = await crypto.subtle.sign('HMAC', prkKey, concat(info, new Uint8Array([1])))
  return new Uint8Array(t).slice(0, length)
}

function concat(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { result.set(a, offset); offset += a.length }
  return result
}

function base64ToBytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, c => c.charCodeAt(0))
}

function bytesToBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
