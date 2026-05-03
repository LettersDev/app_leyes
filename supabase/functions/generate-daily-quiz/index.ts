// supabase/functions/generate-daily-quiz/index.ts
//
// Edge Function: generate-daily-quiz
//
// Genera la pregunta legal del día usando:
//  1. Gemini Embedding para seleccionar un artículo relevante (match_law_items)
//  2. Gemini Flash para generar pregunta + opciones + explicación
//  3. Guarda el resultado en daily_quizzes
//  4. Envía notificación push a todos los tokens en push_tokens
//
// Deploy:
//   supabase functions deploy generate-daily-quiz --no-verify-jwt
//
// Variables de entorno requeridas en Supabase:
//   GEMINI_API_KEY       → API key de Google AI Studio
//   SUPABASE_URL         → URL de tu proyecto (auto-disponible en Edge Functions)
//   SUPABASE_SERVICE_KEY → Service role key (auto-disponible en Edge Functions)
//   EXPO_ACCESS_TOKEN    → Token de acceso a Expo Push API

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────

const GEMINI_API_KEY    = Deno.env.get('GEMINI_API_KEY') ?? '';
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';

const EMBED_MODEL  = 'models/gemini-embedding-001';
const FLASH_MODEL  = 'gemini-2.0-flash';
const EMBED_URL    = `https://generativelanguage.googleapis.com/v1beta/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
const GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${FLASH_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// Temas rotativos — se selecciona por día del año para mayor variedad
const TOPICS = [
    'contrato de trabajo y relación laboral',
    'propiedad privada y bienes inmuebles',
    'matrimonio y divorcio',
    'herencia y sucesión',
    'responsabilidad civil por daños',
    'derechos fundamentales constitucionales',
    'proceso penal y garantías del imputado',
    'procedimiento civil y demandas',
    'obligaciones contractuales',
    'arrendamiento de inmuebles',
    'derecho mercantil y sociedades',
    'salario, prestaciones y beneficios laborales',
    'tutela y patria potestad',
    'derecho a la defensa y debido proceso',
    'medidas cautelares y embargo',
    'delitos y penas en el código penal',
    'derechos del consumidor',
    'impuestos y obligaciones tributarias',
    'adopción y filiación',
    'accidentes de tránsito y responsabilidad',
    'libertad de expresión y censura',
    'protección de datos personales',
    'seguridad social y pensiones',
    'expropiación por causa de utilidad pública',
    'menores de edad y protección al niño',
    'huelga y sindicalismo',
    'contratos administrativos con el Estado',
    'pruebas en juicio civil y penal',
    'recurso de amparo constitucional',
    'créditos hipotecarios y garantías reales',
    'comunidades indígenas y sus derechos',
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Obtiene la fecha de hoy en Venezuela (UTC-4) como string YYYY-MM-DD */
function getTodayVenezuela(): string {
    const now = new Date();
    // Venezuela es UTC-4, sin horario de verano
    const offset = -4 * 60;
    const local = new Date(now.getTime() + offset * 60 * 1000);
    const y = local.getUTCFullYear();
    const m = String(local.getUTCMonth() + 1).padStart(2, '0');
    const d = String(local.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Selecciona el tema del día basado en el día del año (rotativo) */
function getTopicForToday(): string {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    return TOPICS[dayOfYear % TOPICS.length];
}

/** Genera el embedding de un texto usando Gemini */
async function getEmbedding(text: string): Promise<number[] | null> {
    const res = await fetch(EMBED_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: EMBED_MODEL,
            content: { parts: [{ text: text.substring(0, 500) }] },
            taskType: 'RETRIEVAL_QUERY',
        }),
    });

    if (!res.ok) {
        console.error('[Quiz] Error obteniendo embedding:', await res.text());
        return null;
    }

    const data = await res.json();
    let values: number[] = data?.embedding?.values ?? [];

    // Truncar a 768 dims (Matryoshka — igual que en la app)
    if (values.length > 768) values = values.slice(0, 768);

    return values.length > 0 ? values : null;
}

/** Genera la pregunta, opciones y explicación usando Gemini Flash */
async function generateQuizContent(articleText: string): Promise<{
    question: string;
    options: { id: string; text: string }[];
    correct: string;
    explanation: string;
} | null> {

    const prompt = `Eres un asistente legal especializado en derecho venezolano. 
Basándote EXCLUSIVAMENTE en el siguiente artículo de ley, genera una pregunta de selección múltiple educativa.

ARTÍCULO:
"${articleText.substring(0, 1200)}"

INSTRUCCIONES:
- La pregunta debe ser clara y directamente relacionada con el artículo
- Las 4 opciones deben ser plausibles pero solo 1 correcta
- Las opciones incorrectas deben ser errores comunes o variaciones sutiles
- La explicación debe ser didáctica y citar el artículo brevemente
- Responde ÚNICAMENTE con el JSON, sin markdown ni texto adicional

FORMATO JSON REQUERIDO:
{
  "question": "¿[pregunta clara sobre el artículo]?",
  "options": [
    { "id": "A", "text": "[opción A]" },
    { "id": "B", "text": "[opción B]" },
    { "id": "C", "text": "[opción C]" },
    { "id": "D", "text": "[opción D]" }
  ],
  "correct": "A",
  "explanation": "[Explicación de 2-3 oraciones mencionando por qué la respuesta es correcta y qué dice el artículo]"
}`;

    const res = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 800,
                responseMimeType: 'application/json',
            },
        }),
    });

    if (!res.ok) {
        console.error('[Quiz] Error generando contenido:', await res.text());
        return null;
    }

    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw) {
        console.error('[Quiz] Respuesta vacía de Gemini');
        return null;
    }

    try {
        // Limpiar posible markdown ``` si Gemini lo incluye
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error('[Quiz] Error parseando JSON de Gemini:', e, '\nRaw:', raw);
        return null;
    }
}

/** Envía notificación push a todos los tokens via Expo Push API */
async function sendPushNotifications(
    tokens: string[],
    question: string,
): Promise<void> {
    if (tokens.length === 0) {
        console.log('[Quiz] No hay tokens para enviar notificaciones');
        return;
    }

    // Expo acepta hasta 100 mensajes por batch
    const BATCH_SIZE = 100;
    const preview = question.length > 80 ? question.substring(0, 77) + '...' : question;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
        const batch = tokens.slice(i, i + BATCH_SIZE);
        const messages = batch.map(token => ({
            to: token,
            title: '🤖 Pregunta Legal del Día',
            body: preview,
            data: { screen: 'DailyQuiz' },
            sound: 'default',
            channelId: 'tuley-default',
        }));

        const res = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(EXPO_ACCESS_TOKEN ? { 'Authorization': `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
            },
            body: JSON.stringify(messages),
        });

        if (!res.ok) {
            console.warn('[Quiz] Error enviando batch de notificaciones:', await res.text());
        } else {
            console.log(`[Quiz] Batch enviado: ${batch.length} tokens`);
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    // Solo aceptar POST (o llamadas internas de cron)
    if (req.method !== 'POST' && req.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        // Leer el body para ver si es una prueba
        let isTest = false;
        try {
            if (req.method === 'POST') {
                const body = await req.json();
                isTest = body?.test === true;
            }
        } catch (e) {
            // Si no hay body o no es JSON, no es test
        }

        const today = getTodayVenezuela();
        console.log('[Quiz] Generando quiz para fecha:', today, isTest ? '(MODO TEST)' : '');

        // ... (resto del código de validación de existencia) ...
        const { data: existing } = await supabase
            .from('daily_quizzes')
            .select('id')
            .eq('date', today)
            .single();

        if (existing && !isTest) {
            console.log('[Quiz] Ya existe quiz para hoy, cancelando.');
            return new Response(
                JSON.stringify({ ok: true, message: 'Quiz ya existe para hoy', date: today }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        // ... (resto del código de generación) ...
        // [PASO 2, 3, 4, 5, 6 se mantienen igual]
        const topic = getTopicForToday();
        const embedding = await getEmbedding(topic);
        if (!embedding) throw new Error('No se pudo generar el embedding del tema');

        const { data: articles, error: rpcError } = await supabase.rpc('match_law_items', {
            query_embedding: embedding,
            match_threshold: 0.35,
            match_count: 20,
        });

        if (rpcError || !articles || articles.length === 0) {
            throw new Error('No se encontraron artículos con embedding: ' + rpcError?.message);
        }

        // Filtrar artículos que sean realmente artículos (tengan número y texto sustancial)
        const validArticles = articles.filter((a: any) => 
            a.text && 
            a.text.length > 300 && 
            a.number && 
            !isNaN(parseInt(a.number))
        );

        if (validArticles.length === 0) {
            throw new Error('No se encontraron artículos válidos con suficiente contenido jurídico.');
        }

        // Seleccionar el mejor resultado (Top 1) para garantizar relevancia máxima con el tema
        const article = validArticles[0];

        const { data: law } = await supabase
            .from('laws')
            .select('title, category')
            .eq('id', article.law_id)
            .single();

        const quizContent = await generateQuizContent(article.text);
        if (!quizContent) throw new Error('Gemini no generó contenido válido');

        // Solo guardamos en la BD si NO es test o si queremos pisar el de hoy para pruebas
        let savedQuizId = null;
        if (!isTest) {
            const { data: savedQuiz, error: insertError } = await supabase
                .from('daily_quizzes')
                .upsert({
                    date:           today,
                    law_id:         article.law_id,
                    law_item_id:    article.id,
                    law_title:      law?.title ?? 'Ley venezolana',
                    law_category:   law?.category ?? article.law_category,
                    article_number: article.number ?? null,
                    question:       quizContent.question,
                    options:        quizContent.options,
                    correct_option: quizContent.correct,
                    explanation:    quizContent.explanation,
                }, { onConflict: 'date' })
                .select()
                .single();

            if (insertError) throw new Error('Error guardando quiz: ' + insertError.message);
            savedQuizId = savedQuiz.id;
        }

        // ── Paso 7: Obtener tokens y enviar notificaciones ─────
        if (!isTest) {
            const { data: tokenRows } = await supabase
                .from('push_tokens')
                .select('token');

            const tokens: string[] = (tokenRows ?? []).map((r: any) => r.token);
            console.log(`[Quiz] Enviando push a ${tokens.length} tokens`);
            await sendPushNotifications(tokens, quizContent.question);
        } else {
            console.log('[Quiz] MODO TEST: Notificaciones saltadas.');
        }

        return new Response(
            JSON.stringify({
                ok: true,
                test_mode: isTest,
                date: today,
                quiz: quizContent,
                lawTitle: law?.title,
            }),
            { headers: { 'Content-Type': 'application/json' } },
        );

    } catch (err: any) {
        console.error('[Quiz] Error crítico:', err.message);
        return new Response(
            JSON.stringify({ ok: false, error: err.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }
});
