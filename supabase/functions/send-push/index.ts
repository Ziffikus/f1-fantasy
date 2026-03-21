// Supabase Edge Function: send-push
// Sendet Web Push Notifications
// VAPID_PRIVATE_KEY = raw base64url key von npx web-push generate-vapid-keys

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

    let query = supabase.from('push_subscriptions').select('*')
    if (profile_id) query = query.eq('profile_id', profile_id)
    const { data: subs, error } = await query
    if (error) throw error
    if (!subs?.length) return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

    const vapidPrivateKeyRaw = Deno.env.get('VAPID_PRIVATE_KEY')!
    const vapidPublicKey     = Deno.env.get('VAPID_PUBLIC_KEY')!
    const vapidEmail         = Deno.env.get('VAPID_EMAIL') ?? 'mailto:admin@f1fantasy.tbe'

    let sent = 0
    const failed = []

    for (const sub of subs) {
      try {
        const payload = JSON.stringify({
          title: title ?? '🏎️ F1 Fantasy TBE',
          body: body ?? 'Du hast eine neue Benachrichtigung.',
          url: url ?? '/f1-fantasy/',
          tag: tag ?? 'f1-fantasy'
        })

        await sendWebPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { vapidPublicKey, vapidPrivateKeyRaw, vapidEmail }
        )
        sent++
      } catch (e) {
        failed.push({ endpoint: sub.endpoint.slice(0, 40), error: e.message })
        if (e.message?.includes('410') || e.message?.includes('404')) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      }
    }

    return new Response(JSON.stringify({ sent, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// Konvertiert rohen web-push Private Key (base64url, 32 Bytes) zu PKCS#8
function rawToPkcs8(rawBase64url: string): Uint8Array {
  const raw = base64ToBytes(rawBase64url)
  // PKCS#8 DER Header für P-256
  const header = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06,
    0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
    0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01,
    0x01, 0x04, 0x20
  ])
  return concat(header, raw)
}

async function sendWebPush(subscription: any, payload: string, { vapidPublicKey, vapidPrivateKeyRaw, vapidEmail }: any) {
  const endpoint = subscription.endpoint
  const audience = new URL(endpoint).origin

  const now = Math.floor(Date.now() / 1000)
  const jwtHeader = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const jwtPayload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: vapidEmail })))

  const pkcs8Bytes = rawToPkcs8(vapidPrivateKeyRaw)
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', pkcs8Bytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )

  const sigData = new TextEncoder().encode(`${jwtHeader}.${jwtPayload}`)
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, sigData)
  const jwt = `${jwtHeader}.${jwtPayload}.${bytesToBase64Url(new Uint8Array(sig))}`

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

async function encryptPayload(subscription: any, payload: string) {
  const p256dh = base64ToBytes(subscription.keys.p256dh)
  const auth   = base64ToBytes(subscription.keys.auth)

  const serverKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const serverPublicKey = await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)
  const clientKey = await crypto.subtle.importKey('raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const sharedSecret = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKeyPair.privateKey, 256)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const authInfo  = new TextEncoder().encode('Content-Encoding: auth\0')
  const keyInfo   = new TextEncoder().encode('Content-Encoding: aes128gcm\0')
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0')

  const ikm = await hkdf(auth, new Uint8Array(sharedSecret), authInfo, 32)
  const contentKey = await hkdf(salt, ikm, concat(keyInfo, new Uint8Array(serverPublicKey)), 16)
  const nonce      = await hkdf(salt, ikm, concat(nonceInfo, new Uint8Array(serverPublicKey)), 12)

  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt'])
  const payloadBytes = new TextEncoder().encode(payload)
  const padded = concat(payloadBytes, new Uint8Array([2]))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded)

  const serverPubRaw = new Uint8Array(serverPublicKey)
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096, false)
  const kl = new Uint8Array([serverPubRaw.length])
  return concat(salt, rs, kl, serverPubRaw, new Uint8Array(encrypted))
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const saltKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const prk = await crypto.subtle.sign('HMAC', saltKey, ikm)
  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const t = await crypto.subtle.sign('HMAC', prkKey, concat(info, new Uint8Array([1])))
  return new Uint8Array(t).slice(0, length)
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { result.set(a, offset); offset += a.length }
  return result
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, c => c.charCodeAt(0))
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
