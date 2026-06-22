// supabase/functions/finalize-track-ranking/index.ts
//
// Berechnet die finalen Ränge für einen Track und schreibt sie in game_highscores.
// Wird vom Client getriggert, sobald er merkt dass der Track-Countdown abgelaufen ist.
// Idempotent: läuft für denselben track_id nur einmal durch.
//
// Aufruf vom Client:
//   POST /functions/v1/finalize-track-ranking
//   Body: { "track_id": "monaco" }
//   Authorization: Bearer <user-jwt>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { track_id } = await req.json()
    if (!track_id || typeof track_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'track_id fehlt oder ungültig' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Service-Role-Client (umgeht RLS, darf rank schreiben)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    // ── Idempotenz-Check ──────────────────────────────────────────────────────
    // Bereits finalisiert? Dann nichts tun und Status zurückgeben.
    const { data: existing } = await supabase
      .from('track_rankings_log')
      .select('finalized_at, total_entries')
      .eq('track_id', track_id)
      .maybeSingle()

    if (existing) {
      return new Response(
        JSON.stringify({
          already_finalized: true,
          finalized_at: existing.finalized_at,
          total_entries: existing.total_entries,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Alle Scores für diesen Track laden ───────────────────────────────────
    const { data: scores, error: scoresError } = await supabase
      .from('game_highscores')
      .select('id, profile_id, lap_time_ms')
      .eq('game', 'monaco_training')
      .eq('track', track_id)
      .order('lap_time_ms', { ascending: true })

    if (scoresError) throw scoresError
    if (!scores || scores.length === 0) {
      return new Response(
        JSON.stringify({ message: 'Keine Scores für diesen Track gefunden.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Ränge berechnen (Gleichstand = gleicher Rang) ────────────────────────
    // Beispiel: Zeiten [100, 100, 150] → Ränge [1, 1, 3]
    const updates: { id: string; rank: number }[] = []
    let currentRank = 1
    for (let i = 0; i < scores.length; i++) {
      if (i > 0 && scores[i].lap_time_ms === scores[i - 1].lap_time_ms) {
        // Gleichstand: selben Rang wie Vorgänger
        updates.push({ id: scores[i].id, rank: updates[i - 1].rank })
      } else {
        updates.push({ id: scores[i].id, rank: currentRank })
      }
      currentRank++
    }

    // ── Ränge in game_highscores schreiben ───────────────────────────────────
    // Einzelne Updates per id (kein bulk-update auf rank da unterschiedliche Werte)
    const updatePromises = updates.map(({ id, rank }) =>
      supabase
        .from('game_highscores')
        .update({ rank })
        .eq('id', id)
    )
    const results = await Promise.all(updatePromises)
    const failed = results.filter(r => r.error)
    if (failed.length > 0) {
      console.error('Einige Rank-Updates fehlgeschlagen:', failed.map(r => r.error))
      throw new Error(`${failed.length} Updates fehlgeschlagen`)
    }

    // ── Log-Eintrag schreiben (markiert Track als finalisiert) ────────────────
    const { error: logError } = await supabase
      .from('track_rankings_log')
      .insert({ track_id, total_entries: scores.length })
    if (logError) throw logError

    return new Response(
      JSON.stringify({
        success: true,
        track_id,
        total_entries: scores.length,
        rankings: updates,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('finalize-track-ranking Fehler:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
