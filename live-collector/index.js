// ============================================================
// F1 Live Timing – SignalR CORE Collector
//
// F1 nutzt seit ~2025/2026 den neuen "SignalR Core"-Endpunkt
// (/signalrcore) statt des alten ASP.NET-SignalR-Endpunkts
// (/signalr, Protokoll 1.5). Anderes Handshake-/Nachrichtenformat!
//
// Ablauf:
//   1. OPTIONS-Request -> AWSALBCORS-Cookie holen
//   2. POST /signalrcore/negotiate -> connectionToken
//   3. WebSocket zu /signalrcore?id=<connectionToken> (+ Cookie)
//   4. JSON-Hub-Handshake senden
//   5. "Subscribe"-Invocation senden
//   6. Reference-Snapshot (type 3, Completion) + laufende
//      "feed"-Invocations (type 1) verarbeiten
// ============================================================

import WebSocket from 'ws'
import fs from 'fs'
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

// ─── Supabase ─────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL und SUPABASE_SERVICE_KEY müssen gesetzt sein (z.B. via .env)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ─── Konfiguration ─────────────────────────────────────────
const NEGOTIATE_URL = 'https://livetiming.formula1.com/signalrcore/negotiate?negotiateVersion=1'
const CONNECT_BASE  = 'wss://livetiming.formula1.com/signalrcore'

const TOPICS = [
  'TimingData',
  'DriverList',
  'WeatherData',
  'TrackStatus',
  'RaceControlMessages',
  'LapCount',
  'TimingAppData',
]

const BASE_HEADERS = {
  'User-Agent': 'BestHTTP',
  'Accept-Encoding': 'gzip, identity',
}

const RECORD_SEP = '\x1e'  // SignalR JSON-Protokoll trennt Nachrichten mit \x1e

// ─── Debug-Konfiguration (per ENV steuerbar) ────────────────
const DEBUG_RAW          = process.env.DEBUG_RAW === '1'
const DEBUG_VERBOSE      = process.env.DEBUG_VERBOSE === '1'
const DEBUG_DUMP_STATE   = process.env.DEBUG_DUMP_STATE !== '0'
const DUMP_INTERVAL_MS   = Number(process.env.DUMP_INTERVAL_MS ?? 10000)
const STATUS_INTERVAL_MS = Number(process.env.STATUS_INTERVAL_MS ?? 30000)
const MAX_RUNTIME_MS     = process.env.MAX_RUNTIME_MS ? Number(process.env.MAX_RUNTIME_MS) : null

// ─── Logging-Helfer ──────────────────────────────────────────
function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args)
}
function debugLog(...args) {
  if (DEBUG_VERBOSE) log('🔍', ...args)
}
function debugRaw(msg) {
  if (DEBUG_RAW) log('📨 RAW:', JSON.stringify(msg).slice(0, 800))
}

// ─── State ───────────────────────────────────────────────────
const state = {}
const updateCounts = {}
let ws = null
let reconnectAttempts = 0
let connectedAt = null
let handshakeDone = false
let lastDumpAt = 0
let pingInterval = null

// ─── Deep-Merge für Delta-Patches ───────────────────────────
function deepMerge(target, patch) {
  if (patch === null) return undefined
  if (typeof patch !== 'object' || Array.isArray(patch)) return patch
  if (typeof target !== 'object' || target === null || Array.isArray(target)) {
    target = {}
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete target[key]
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      target[key] = deepMerge(target[key], value)
    } else {
      target[key] = value
    }
  }
  return target
}

// ─── Schritt 1: AWSALBCORS-Cookie holen ──────────────────────
async function getCookie() {
  const res = await fetch(NEGOTIATE_URL, { method: 'OPTIONS', headers: BASE_HEADERS })
  debugLog('OPTIONS-Status:', res.status)

  let cookies = []
  if (typeof res.headers.getSetCookie === 'function') {
    cookies = res.headers.getSetCookie()
  } else {
    const single = res.headers.get('set-cookie')
    if (single) cookies = [single]
  }
  debugLog('Set-Cookie:', cookies)

  const awsCookie = cookies.find(c => c.startsWith('AWSALBCORS='))
  if (!awsCookie) throw new Error('Kein AWSALBCORS-Cookie erhalten (Cookies: ' + JSON.stringify(cookies) + ')')

  return awsCookie.split(';')[0]  // nur "AWSALBCORS=xyz", ohne Path/Expires etc.
}

// ─── Schritt 2: Negotiate (POST) ─────────────────────────────
async function negotiate(cookie) {
  const res = await fetch(NEGOTIATE_URL, {
    method: 'POST',
    headers: { ...BASE_HEADERS, Cookie: cookie },
  })
  if (!res.ok) throw new Error(`Negotiate fehlgeschlagen: ${res.status}`)
  const data = await res.json()
  debugLog('negotiate response', data)
  return data
}

// ─── Verbindung aufbauen ──────────────────────────────────────
async function connectAndSubscribe() {
  try {
    log('🍪 Cookie holen (AWSALBCORS)...')
    const cookie = await getCookie()
    debugLog('Cookie:', cookie)

    log('🤝 Negotiate...')
    const neg = await negotiate(cookie)
    const token = neg.connectionToken
    if (!token) throw new Error('Kein connectionToken erhalten: ' + JSON.stringify(neg))

    const url = `${CONNECT_BASE}?id=${encodeURIComponent(token)}`
    log('🔗 WebSocket verbinden...')
    handshakeDone = false
    ws = new WebSocket(url, { headers: { ...BASE_HEADERS, Cookie: cookie } })

    ws.on('open', () => {
      connectedAt = Date.now()
      reconnectAttempts = 0
      log('✅ WebSocket offen – sende Hub-Handshake...')
      ws.send(JSON.stringify({ protocol: 'json', version: 1 }) + RECORD_SEP)
    })

    ws.on('message', (raw) => {
      try {
        handleRawMessage(raw.toString())
      } catch (e) {
        log('⚠️ Fehler beim Verarbeiten einer Nachricht:', e.message)
      }
    })

    ws.on('error', (err) => log('⚠️ WebSocket-Fehler:', err.message))

    ws.on('close', (code, reason) => {
      const uptime = connectedAt ? ((Date.now() - connectedAt) / 1000).toFixed(1) : '0'
      log(`🔌 Verbindung getrennt (code=${code}, reason="${reason}", uptime=${uptime}s)`)
      connectedAt = null
      if (pingInterval) clearInterval(pingInterval)
      scheduleReconnect()
    })
  } catch (err) {
    log('❌ Connect-Fehler:', err.message)
    scheduleReconnect()
  }
}

function scheduleReconnect() {
  reconnectAttempts++
  const delay = Math.min(30000, 1000 * 2 ** reconnectAttempts)
  log(`🔁 Reconnect in ${delay / 1000}s (Versuch ${reconnectAttempts})`)
  setTimeout(connectAndSubscribe, delay)
}

// ─── Nachrichten verarbeiten ─────────────────────────────────
// SignalR JSON-Protokoll trennt mehrere Nachrichten mit \x1e
function handleRawMessage(text) {
  const parts = text.split(RECORD_SEP).filter(p => p.length > 0)
  for (const part of parts) {
    let msg
    try {
      msg = JSON.parse(part)
    } catch {
      log('⚠️ Konnte Nachricht nicht parsen:', part.slice(0, 200))
      continue
    }
    processMessage(msg)
  }
}

function processMessage(msg) {
  // Erste Nachricht = Handshake-Antwort. Leeres Objekt = Erfolg.
  if (!handshakeDone) {
    handshakeDone = true
    if (msg.error) {
      log('❌ Handshake-Fehler:', msg.error)
      return
    }
    log('🤝 Handshake OK')
    sendSubscribe()
    startPing()
    return
  }

  debugRaw(msg)

  switch (msg.type) {
    case 1: // Invocation – laufende "feed"-Updates
      if (msg.target === 'feed' && Array.isArray(msg.arguments)) {
        const [topic, patch, timestamp] = msg.arguments
        state[topic] = deepMerge(state[topic], patch)
        updateCounts[topic] = (updateCounts[topic] ?? 0) + 1
        debugLog(`Δ ${topic} @ ${timestamp}`)
        onUpdate(topic, state[topic], timestamp)
      } else {
        debugLog('Invocation (anderes Target):', msg.target)
      }
      break

    case 3: // Completion – Antwort auf Subscribe = Reference-Snapshot
      if (msg.error) {
        log('❌ Subscribe-Fehler:', msg.error)
        break
      }
      if (msg.result && typeof msg.result === 'object') {
        for (const [topic, data] of Object.entries(msg.result)) {
          state[topic] = data
          updateCounts[topic] = (updateCounts[topic] ?? 0) + 1
          log(`📦 Initial-Snapshot: ${topic}`)
          onUpdate(topic, state[topic], 'initial')
        }
      }
      break

    case 6: // Ping vom Server
      debugLog('ping (server)')
      break

    case 7: // Close
      log('🔌 Server hat Close-Message gesendet:', JSON.stringify(msg))
      break

    default:
      debugLog('unbekannter type:', msg.type, JSON.stringify(msg).slice(0, 200))
  }
}

function sendSubscribe() {
  const sub = { type: 1, target: 'Subscribe', arguments: [TOPICS], invocationId: '0' }
  ws.send(JSON.stringify(sub) + RECORD_SEP)
  log('📡 Subscribe gesendet für:', TOPICS.join(', '))
}

// Client-seitige Pings halten die Verbindung am Leben
function startPing() {
  pingInterval = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 6 }) + RECORD_SEP)
      debugLog('ping (client) gesendet')
    }
  }, 15000)
}

// ─── Hook: schreibt jedes Update nach Supabase ────────────────
let writeQueue = Promise.resolve()  // verhindert überlappende Writes pro Topic

function onUpdate(topic, data, timestamp) {
  // Writes seriell verketten, damit nicht parallel auf dieselbe Row geschrieben wird
  writeQueue = writeQueue.then(() => writeToSupabase(topic, data))

  if (DEBUG_DUMP_STATE) {
    const now = Date.now()
    if (now - lastDumpAt > DUMP_INTERVAL_MS) {
      lastDumpAt = now
      dumpState()
    }
  }
}

async function writeToSupabase(topic, data) {
  try {
    const { error } = await supabase
      .from('live_timing')
      .upsert({ topic, payload: data, updated_at: new Date().toISOString() }, { onConflict: 'topic' })
    if (error) {
      log(`❌ Supabase-Write-Fehler (${topic}):`, error.message)
    } else {
      debugLog(`💾 Supabase geschrieben: ${topic}`)
    }
  } catch (e) {
    log(`❌ Supabase-Write-Exception (${topic}):`, e.message)
  }
}

function dumpState() {
  fs.mkdirSync('./debug', { recursive: true })
  fs.writeFileSync('./debug/state.json', JSON.stringify(state, null, 2))
  debugLog(`State-Dump geschrieben (${Object.keys(state).length} Topics)`)
}

// ─── Status-Logging ───────────────────────────────────────────
setInterval(() => {
  const uptime = connectedAt ? ((Date.now() - connectedAt) / 1000).toFixed(0) + 's' : 'getrennt'
  const counts = TOPICS.map(t => `${t}=${updateCounts[t] ?? 0}`).join(', ')
  log(`📊 Status – uptime: ${uptime} | Updates: ${counts}`)
}, STATUS_INTERVAL_MS)

// ─── Optionaler Auto-Stop (für lokale Tests) ─────────────────
if (MAX_RUNTIME_MS) {
  setTimeout(() => {
    log(`⏱ MAX_RUNTIME_MS (${MAX_RUNTIME_MS}ms) erreicht – beende.`)
    dumpState()
    if (ws) ws.close()
    process.exit(0)
  }, MAX_RUNTIME_MS)
}

// ─── Graceful Shutdown ─────────────────────────────────────────
process.on('SIGINT', () => {
  log('👋 SIGINT – beende...')
  dumpState()
  if (ws) ws.close()
  process.exit(0)
})

// ─── Start ────────────────────────────────────────────────────
log('🏁 F1 Live Collector (SignalR Core) startet...')
log(`   Topics: ${TOPICS.join(', ')}`)
log(`   Debug: RAW=${DEBUG_RAW} VERBOSE=${DEBUG_VERBOSE} DUMP_STATE=${DEBUG_DUMP_STATE}`)
connectAndSubscribe()
