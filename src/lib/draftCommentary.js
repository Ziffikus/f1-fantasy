// ── draftCommentary.js ────────────────────────────────────────
// Gemeinsame Logik für DraftTicker.jsx und AdminPage.jsx
// Kategorie-Wahl, Prompt-Builder, Intro/Outro-Generierung

const GEMINI_MODEL_PRIMARY  = 'gemini-2.5-flash'
const GEMINI_MODEL_FALLBACK = 'gemini-2.0-flash-lite'

// ── Gemini API ────────────────────────────────────────────────
export async function callGemini(prompt, retries = 2, maxTokens = 5000, model = GEMINI_MODEL_PRIMARY) {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
  if (!API_KEY) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 1.4 },
        }),
      }
    )
    if (res.status === 429) {
      if (model === GEMINI_MODEL_PRIMARY) {
        console.log('[Gemini] 2.5 Flash Rate Limit – Fallback auf 1.5 Flash')
        return callGemini(prompt, retries, maxTokens, GEMINI_MODEL_FALLBACK)
      }
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 8000))
        return callGemini(prompt, retries - 1, maxTokens, model)
      }
      return null
    }
    if (res.status === 500 || res.status === 503) {
      if (model === GEMINI_MODEL_PRIMARY) {
        console.log(`[Gemini] ${res.status} – Fallback auf 1.5 Flash`)
        return callGemini(prompt, retries, maxTokens, GEMINI_MODEL_FALLBACK)
      }
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 3000))
        return callGemini(prompt, retries - 1, maxTokens, model)
      }
      return null
    }
    const data = await res.json()
    if (data.promptFeedback?.blockReason) return null
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
  } catch (error) {
    console.error('Gemini Fehler:', error)
    return null
  }
}

// ── Kategorie-Logik (reines JS, kein AI-Call) ─────────────────
export function chooseCategory(categoryHistory, playerName, cUsedByPlayer) {
  const totalPicks = categoryHistory.length

  // C: max 1x pro Spieler, frühestens Pick 3, ~3-4x pro Draft
  const cEligible = !cUsedByPlayer[playerName] && totalPicks >= 3
  if (cEligible && Math.random() < 0.25) return 'C'

  // B: alle 4 Picks, frühestens Pick 3, ~3-4x pro Draft
  const bRecentlyUsed = categoryHistory.slice(-4).includes('B')
  if (!bRecentlyUsed && totalPicks >= 3 && Math.random() < 0.4) return 'B'

  return 'A'
}

// ── Prompt-Builder ────────────────────────────────────────────
const PLAYER_CONTEXT = {
  Mandi: 'Mandi: konservativ, wenig F1-Tiefe, beim Wetten zu vorsichtig, sportlich.',
  Alex:  'Alex: methodisch, Familienvater, analysiert alles dreimal, Picks kurz vor Deadline.',
  Andii: 'Andii: entspannt, Gamer, sportlich, casual.',
  Ferk:  'Ferk: Bauchentscheider, Paragleiter, ehrgeizig.',
}

export function buildPickPrompt(category, { playerName, pickName, gpName }) {
  if (category === 'A') {
    return `
Du bist Kies Bettmann – F1-Kommentator, 54, der diesen Job seit 19 Jahren macht und insgeheim immer noch daran hängt. Wir sind mitten in der F1-Saison 2026.
Dein Stil: Trockener Witz, erschöpfte Präzision, Ironie mit leichter Verzögerungszündung.

Pick: ${pickName}, GP von ${gpName}.

Taktische Einschätzung, Streckenanalyse, Reifenstrategie, historischer Vergleich, Lobeshymne die sich nach Verriss anfühlt oder umgekehrt. KEIN Bezug auf den Spieler.

Regeln:
- MAXIMAL 1-2 kurze Sätze. Absolute Obergrenze: 275 Zeichen gesamt.
- Ironie darf eine halbe Sekunde brauchen.
- Erschöpft, nicht verbittert.
- Nur die Sätze, kein Präambel, keine Anführungszeichen.
- Zu lang = falsch. Kürzer ist besser.
- Antworte mit maximal 275 Zeichen. Brich nie mitten im Satz ab.
`.trim()
  }

  if (category === 'B') {
    return `
Du bist Kies Bettmann – F1-Kommentator, 54. Alter silberner BMW, rostig, klappernde Türen, Rückenschmerzen, Mahnbescheide. Wir sind mitten in der F1-Saison 2026.
Dein Stil: Trockener Witz, erschöpfte Präzision.

Pick: ${pickName}, GP von ${gpName}.

Beziehe den Pick auf dein persönliches Elend – mit kleinem F1-Zugeständnis am Ende. KEIN Bezug auf den Spieler.

Regeln:
- MAXIMAL 1-2 kurze Sätze. Absolute Obergrenze: 275 Zeichen gesamt.
- Erschöpft, nicht verbittert.
- Nur die Sätze, kein Präambel, keine Anführungszeichen.
- Zu lang = falsch. Kürzer ist besser.
- Antworte mit maximal 275 Zeichen. Brich nie mitten im Satz ab.
`.trim()
  }

  // category === 'C'
  return `
Du bist Kies Bettmann – F1-Kommentator, 54. Wir sind mitten in der F1-Saison 2026.
Dein Stil: Trockener Witz, erschöpfte Präzision, Ironie mit leichter Verzögerungszündung.

${playerName} hat ${pickName} gepickt beim GP von ${gpName}.

${playerName}-Kontext:
${PLAYER_CONTEXT[playerName] ?? `${playerName}: einer der vier Spieler.`}

Kommentiere den Pick mit kurzem Bezug auf den Spieler.

Regeln:
- MAXIMAL 1-2 kurze Sätze. Absolute Obergrenze: 275 Zeichen gesamt.
- Ironie darf eine halbe Sekunde brauchen.
- Erschöpft, nicht verbittert.
- Nur die Sätze, kein Präambel, keine Anführungszeichen.
- Zu lang = falsch. Kürzer ist besser.
- Antworte mit maximal 275 Zeichen. Brich nie mitten im Satz ab.
`.trim()
}

// ── Intro ─────────────────────────────────────────────────────
export async function generateIntro({ gpName, draftOrder, lastWeekPoints }) {
  const orderText = draftOrder
    .map((o, i) => `${i + 1}. ${o.profiles?.display_name}`)
    .join(', ')

  const pointsText = lastWeekPoints?.length
    ? lastWeekPoints
        .sort((a, b) => a.weekend_rank - b.weekend_rank)
        .map(p => `${p.name}: ${p.total_points} Punkte (Platz ${p.weekend_rank})`)
        .join(', ')
    : 'keine Vorwochendaten verfügbar'

  const prompt = `
Du bist Kies Bettmann – F1-Kommentator, 54, erschöpft aber mit Herzblut dabei. Wir sind mitten in der F1-Saison 2026. Alle vier Spieler sind Männer.
Schreib ein Intro (3-4 Sätze) für den Fantasy Draft zum GP von ${gpName}.

Kontext:
- Draft-Reihenfolge heute: ${orderText}
- Letzte Woche: ${pointsText}

Spieler-Kontext:
- Mandi: Mann, sportlich, beim Wetten zu konservativ, beschäftigt sich nicht intensiv mit F1.
- Alex: Analysiert alles dreimal, Familienvater, methodisch.
- Andii: Entspannter Typ, sportlich, Gamer.
- Ferk: Entscheidet aus dem Bauch, Paragleiter, ehrgeizig.

Stil: Trockener Witz, erschöpfte Präzision. Begrüße zum Draft, erwähne wer als erster dran ist, kommentiere kurz die Vorwochenergebnisse mit Kies-typischer Ironie.
WICHTIG: Nur Fließtext, keine Überschriften, keine Anführungszeichen am Anfang oder Ende.
`.trim()

  return callGemini(prompt)
}

// ── Outro ─────────────────────────────────────────────────────
export async function generateOutro({ gpName, draftOrder, allPicks }) {
  const playerSummaries = draftOrder.map(o => {
    const name = o.profiles?.display_name
    const playerPicks = allPicks.filter(p => p.profile_id === o.profile_id)
    const drivers = playerPicks
      .filter(p => p.pick_type === 'driver')
      .map(p => `${p.drivers?.first_name} ${p.drivers?.last_name}`)
      .filter(Boolean).join(', ')
    const teams = playerPicks
      .filter(p => p.pick_type === 'constructor')
      .map(p => p.constructors?.short_name)
      .filter(Boolean).join(', ')
    return `${name}: ${drivers}${teams ? ` + ${teams}` : ''}`
  }).join(' | ')

  const prompt = `
Du bist Kies Bettmann – F1-Kommentator, 54, erschöpft aber mit Herzblut dabei. Wir sind mitten in der F1-Saison 2026. Alle vier Spieler sind Männer.
Schreib ein Outro (3-5 Sätze) für den abgeschlossenen Fantasy Draft zum GP von ${gpName}.

Alle Picks:
${playerSummaries}

Spieler-Kontext:
- Mandi: Mann, Sicherheitsdenker, sportlich, beim Wetten zu konservativ.
- Alex: Analysiert alles dreimal, Familienvater, methodisch.
- Andii: Entspannter Typ, Eishockey-Fan, Zocker.
- Ferk: Entscheidet aus dem Bauch, Paragleiter.

Stil: Erschöpfter Abschluss mit Wärme. Kurzer Kommentar zu interessanten Picks, Ausblick aufs Wochenende – Kies-typisch trocken aber nicht böse.
WICHTIG: Nur Fließtext, keine Überschriften, keine Anführungszeichen am Anfang oder Ende.
`.trim()

  return callGemini(prompt)
}

// ── Pick-Kommentar generieren ─────────────────────────────────
export async function generatePickComment({ category, playerName, pickName, gpName }) {
  const prompt = buildPickPrompt(category, { playerName, pickName, gpName })
  const text = await callGemini(prompt, 2, 2000)
  return text || null
}
