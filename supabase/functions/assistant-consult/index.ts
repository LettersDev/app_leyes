import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || ''
const EMBED_MODEL = 'models/gemini-embedding-001'
const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`

async function getEmbedding(text: string): Promise<number[] | null> {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBED_MODEL,
      content: { parts: [{ text: text.substring(0, 500) }] },
      taskType: 'RETRIEVAL_QUERY',
    }),
  })

  if (!res.ok) return null
  const data = await res.json()
  let values: number[] = data?.embedding?.values ?? []
  if (values.length > 768) values = values.slice(0, 768) // Truncate to match DB
  return values.length > 0 ? values : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query } = await req.json()
    if (!query) throw new Error('Query is required')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. RAG: Buscar artículos relevantes
    const embedding = await getEmbedding(query)
    let context = ""
    let references: any[] = []

    if (embedding) {
      const { data: articles } = await supabase.rpc('match_law_items', {
        query_embedding: embedding,
        match_threshold: 0.35,
        match_count: 5,
      })

      if (articles && articles.length > 0) {
        context = articles.map((a: any) => `[ARTÍCULO ${a.number}]: ${a.text}`).join('\n\n')
        references = articles.map((a: any) => ({
          id: a.id,
          number: a.number,
          law_id: a.law_id,
          text: a.text.substring(0, 100) + '...'
        }))
      }
    }

    const systemPrompt = `Eres un asistente legal especializado en legislación venezolana. 
Tu tarea es responder consultas legales basándote ÚNICAMENTE en el contexto proporcionado.
Si el contexto no tiene la información suficiente, indícalo claramente y sugiere consultar con un abogado profesional.
No inventes leyes ni artículos.
Estructura tu respuesta de forma clara y profesional. Al final, menciona los artículos que utilizaste.`

    const userPrompt = `Consulta del usuario: "${query}"\n\nContexto legal recuperado:\n${context || "No se encontraron artículos específicos en la base de datos."}`

    // 2. IA Engine (Groq with Gemini Fallback)
    const groqKey = Deno.env.get('GROQ_API_KEY')
    let resultText = ""
    let provider = ""

    if (groqKey) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama3-70b-8192',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.3,
          }),
        })

        if (groqRes.ok) {
          const data = await groqRes.json()
          resultText = data.choices[0].message.content
          provider = 'groq'
        }
      } catch (e) { console.error('Groq Error:', e) }
    }

    if (!resultText && GEMINI_API_KEY) {
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        }),
      })

      if (geminiRes.ok) {
        const data = await geminiRes.json()
        resultText = data.candidates[0].content.parts[0].text
        provider = 'gemini'
      }
    }

    if (!resultText) throw new Error('Failed to generate response')

    return new Response(JSON.stringify({ 
      answer: resultText,
      references,
      provider 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
