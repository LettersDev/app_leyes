import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Embedding ────────────────────────────────────────────────────────────────

async function getEmbedding(text: string, geminiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text: text.substring(0, 500) }] },
          taskType: 'RETRIEVAL_QUERY',
        }),
      }
    )
    if (!res.ok) {
      console.error('[Embedding] Gemini error:', res.status, await res.text())
      return null
    }
    const data = await res.json()
    const values: number[] = data?.embedding?.values ?? []
    return values.length > 0 ? values.slice(0, 768) : null
  } catch (e) {
    console.error('[Embedding] fetch error:', e)
    return null
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { query, conversationHistory = [] } = await req.json()
    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const geminiKey = Deno.env.get('GEMINI_API_KEY') || ''
    const groqKey   = Deno.env.get('GROQ_API_KEY')   || ''

    // ── 1. RAG: Embedding + búsqueda vectorial ────────────────────────────────
    let references: any[] = []
    let context = ''

    const embedding = await getEmbedding(query, geminiKey)
    if (embedding) {
      const { data: articles, error: rpcError } = await supabase.rpc('match_law_items', {
        query_embedding: embedding,
        match_threshold: 0.25,
        match_count: 5,
      })

      if (rpcError) {
        console.error('[RAG] RPC error:', rpcError.message)
      } else if (articles && articles.length > 0) {
        context = articles
          .map((a: any) => `[${a.law_title || 'Ley'} - Art. ${a.number}]: ${a.text}`)
          .join('\n\n')
        references = articles.map((a: any) => ({
          id:        a.id,
          law_id:    a.law_id,
          law_title: a.law_title || 'Artículo de Ley',
          number:    a.number,
          index:     a.index,
          text:      a.text.substring(0, 100) + '...',
        }))
      }
    }

    const hasContext = context.length > 0

    // ── 2. Construir prompts ──────────────────────────────────────────────────
    const systemPrompt = `Eres un abogado experto especializado en legislación venezolana con memoria de conversación.
Mantienes el hilo de la conversación y respondes preguntas de seguimiento basándote en lo discutido anteriormente.
Usa el contexto legal de la base de datos TuLey como fuente primaria.
Si el contexto no cubre la pregunta, complementa con tu conocimiento de legislación venezolana, indicándolo con "[Conocimiento general]".
Cuando cites artículos de la base de datos, indícalo con "[Base de datos TuLey]".
Nunca inventes números de artículos sin estar seguro. Sé claro, profesional y conciso.
Siempre recomienda verificar con un abogado profesional.`

    const userPrompt = hasContext
      ? `${query}\n\nContexto legal disponible:\n${context}`
      : query

    // Mensajes: sistema + historial + pregunta actual con contexto RAG
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userPrompt },
    ]

    // ── 3. IA: Groq → Gemini fallback ────────────────────────────────────────
    let answer   = ''
    let provider = ''

    // 3a. Groq (llama-3.3-70b-versatile — modelo actual, alta calidad legal)
    if (groqKey && !answer) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile', // ✅ modelo actualizado (8b-instant deprecado para razonamiento legal)
            messages,
            temperature: 0.3,
            max_tokens: 1024,
          }),
        })

        // ⚠️ IMPORTANTE: verificar groqRes.ok ANTES de parsear
        // Si no se verifica, un 429/503 crashea silenciosamente y no activa el fallback
        if (groqRes.ok) {
          const gData = await groqRes.json()
          const content = gData?.choices?.[0]?.message?.content
          if (content) {
            answer   = content
            provider = 'groq'
          } else {
            console.warn('[Groq] Respuesta vacía o malformada:', JSON.stringify(gData))
          }
        } else {
          const errBody = await groqRes.text()
          console.warn(`[Groq] HTTP ${groqRes.status}:`, errBody)
          // Si es 429 (rate limit), activamos fallback a Gemini
        }
      } catch (e) {
        console.error('[Groq] fetch error:', e)
      }
    }

    // 3b. Gemini 2.0 Flash (fallback si Groq falla o está sin key)
    if (!answer && geminiKey) {
      try {
        // Convertir historial al formato de Gemini (multi-turno)
        const geminiContents = [
          ...conversationHistory.map((m: any) => ({
            role:  m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
        ]

        const gemRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: geminiContents }),
          }
        )

        if (gemRes.ok) {
          const gemData = await gemRes.json()
          const content = gemData?.candidates?.[0]?.content?.parts?.[0]?.text
          if (content) {
            answer   = content
            provider = 'gemini'
          } else {
            console.warn('[Gemini] Respuesta vacía o malformada:', JSON.stringify(gemData))
          }
        } else {
          const errBody = await gemRes.text()
          console.error(`[Gemini] HTTP ${gemRes.status}:`, errBody)
        }
      } catch (e) {
        console.error('[Gemini] fetch error:', e)
      }
    }

    if (!answer) {
      // Ambos proveedores fallaron — devolvemos error descriptivo
      return new Response(
        JSON.stringify({ error: 'No se pudo generar una respuesta. Intenta de nuevo en unos segundos.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ answer, references, provider }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[assistant-consult] Error no controlado:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
