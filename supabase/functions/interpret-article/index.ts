import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { articleTitle, articleText } = await req.json()

    if (!articleText) {
      return new Response(JSON.stringify({ error: 'No article text provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const groqKey   = Deno.env.get('GROQ_API_KEY')   || ''
    const geminiKey = Deno.env.get('GEMINI_API_KEY') || ''

    const systemPrompt = `Eres un abogado experto venezolano que traduce el lenguaje jurídico complejo a un lenguaje sencillo y comprensible para el ciudadano común.

Tu objetivo es explicar el artículo de manera clara, amigable y práctica.
Divide tu respuesta en tres secciones cortas:
1. **En pocas palabras**: Un resumen de 1 oración.
2. **Lo que significa para ti**: Explicación de los derechos o deberes que otorga este artículo al ciudadano.
3. **Dato clave**: Un detalle importante o una advertencia sobre este artículo.

No inventes leyes, solo interpreta el texto proporcionado. No uses tecnicismos innecesarios.`

    const userPrompt = `Por favor, interpreta el siguiente artículo (${articleTitle || 'Artículo'}):\n\n${articleText}`

    let interpretation = ''
    let provider       = ''

    // ── 1. Groq (llama-3.3-70b-versatile — calidad legal superior al 8b-instant) ──
    if (groqKey && !interpretation) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile', // ✅ reemplaza llama-3.1-8b-instant (demasiado débil para razonamiento legal)
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user',   content: userPrompt   },
            ],
            temperature: 0.4,
            max_tokens: 1024,
          }),
        })

        // ⚠️ CRÍTICO: verificar .ok ANTES de parsear
        // Si Groq devuelve 429 (rate limit) o 503, no lanza excepción —
        // el try/catch solo captura errores de red. Sin .ok, el json() devuelve
        // el cuerpo de error y choices[0] es undefined → crash invisible
        if (groqRes.ok) {
          const gData  = await groqRes.json()
          const content = gData?.choices?.[0]?.message?.content
          if (content) {
            interpretation = content
            provider       = 'groq'
          } else {
            console.warn('[Groq] Respuesta vacía o malformada:', JSON.stringify(gData))
          }
        } else {
          const errBody = await groqRes.text()
          console.warn(`[Groq] HTTP ${groqRes.status}:`, errBody)
          // 429 = rate limit → cae al fallback de Gemini automáticamente
        }
      } catch (e) {
        console.error('[Groq] fetch error:', e)
      }
    }

    // ── 2. Gemini 2.0 Flash (fallback si Groq falla o no tiene key) ────────────
    if (!interpretation && geminiKey) {
      try {
        const gemRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
              }],
              generationConfig: {
                temperature: 0.4,
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 1024,
              },
            }),
          }
        )

        if (gemRes.ok) {
          const gemData = await gemRes.json()
          const content = gemData?.candidates?.[0]?.content?.parts?.[0]?.text
          if (content) {
            interpretation = content
            provider       = 'gemini'
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

    if (!interpretation) {
      return new Response(
        JSON.stringify({ error: 'No se pudo interpretar el artículo. Intenta de nuevo en unos segundos.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ interpretation, provider }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[interpret-article] Error no controlado:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } } // ✅ 500, no 200
    )
  }
})
