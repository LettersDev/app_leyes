import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { articleTitle, articleText } = await req.json()

    if (!articleText) {
      return new Response(JSON.stringify({ error: 'No article text provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const systemPrompt = `Eres un experto legal venezolano que traduce el lenguaje jurídico complejo a un lenguaje sencillo y comprensible para el ciudadano común.
    
Tu objetivo es explicar el artículo proporcionado de manera clara, amigable y práctica.
Divide tu respuesta en tres secciones cortas:
1. **En pocas palabras**: Un resumen de 1 oración.
2. **Lo que significa para ti**: Explicación de los derechos o deberes que otorga este artículo al ciudadano.
3. **Dato clave**: Un detalle importante o una advertencia sobre este artículo.

No inventes leyes, solo interpreta el texto proporcionado. No uses tecnicismos innecesarios.`

    const userPrompt = `Por favor, interpreta el siguiente artículo (${articleTitle}):\n\n${articleText}`

    // 1. Intentar con Groq (Llama 3 70B para alta calidad)
    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (groqKey) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
            temperature: 0.5,
            max_tokens: 1024,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          return new Response(JSON.stringify({ 
            interpretation: data.choices[0].message.content,
            provider: 'groq'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      } catch (e) {
        console.error('Groq Error:', e)
      }
    }

    // 2. Fallback a Gemini (1.5 Flash para velocidad y confiabilidad)
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (geminiKey) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
          }],
          generationConfig: {
            temperature: 0.4,
            topP: 0.8,
            topK: 40,
          }
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const text = data.candidates[0].content.parts[0].text
        return new Response(JSON.stringify({ 
          interpretation: text,
          provider: 'gemini'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    throw new Error('All AI providers failed')

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
