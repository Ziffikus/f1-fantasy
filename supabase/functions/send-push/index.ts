// Supabase Edge Function: send-push
// Verwendet web-push via npm für korrekte Verschlüsselung

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

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

    // VAPID konfigurieren
    webpush.setVapidDetails(
      Deno.env.get('VAPID_EMAIL')!,
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!
    )

    // Subscriptions laden
    let query = supabase.from('push_subscriptions').select('*')
    if (profile_id) query = query.eq('profile_id', profile_id)
    const { data: subs, error } = await query
    if (error) throw error
    if (!subs?.length) return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

    const payload = JSON.stringify({
      title: title ?? '🏎️ F1 Fantasy TBE',
      body: body ?? 'Du hast eine neue Benachrichtigung.',
      url: url ?? '/f1-fantasy/',
      tag: tag ?? 'f1-fantasy',
    })

    let sent = 0
    const failed = []

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        )
        sent++
      } catch (e: any) {
        failed.push({ endpoint: sub.endpoint.slice(0, 40), error: e.message })
        // Abgelaufene Subscriptions löschen
        if (e.statusCode === 410 || e.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      }
    }

    return new Response(JSON.stringify({ sent, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
