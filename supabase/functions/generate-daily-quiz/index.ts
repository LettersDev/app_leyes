import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const SUPABASE_URL   = "https://rnhzsmwykqwrqzwfjsmt.supabase.co";

Deno.serve(async (req: Request) => {
    try {
        const supabase = createClient(SUPABASE_URL, Deno.env.get('APP_SERVICE_ROLE_KEY')!);
        const vzlaDate = new Date(new Date().getTime() - (4 * 60 * 60 * 1000)).toISOString().split('T')[0];

        // Leer body UNA sola vez
        let isTest = false;
        let targetToken: string | null = null;
        try {
            const body = await req.json();
            isTest = body?.test === true;
            targetToken = body?.targetToken || null;
        } catch (_) {}

        console.log(`[Quiz] Fecha Venezuela: ${vzlaDate} | isTest: ${isTest} | targetToken: ${targetToken ? 'sí' : 'no'}`);

        // 1. Obtener todas las leyes y elegir una al azar
        const { data: allLaws, error: lawsErr } = await supabase
            .from('laws')
            .select('id, title');

        if (lawsErr) throw new Error('Error leyendo leyes: ' + lawsErr.message);
        if (!allLaws || allLaws.length === 0) throw new Error('No hay leyes disponibles');

        const randomLaw = allLaws[Math.floor(Math.random() * allLaws.length)];
        console.log(`[Quiz] Ley seleccionada: ${randomLaw.title}`);

        // 2. Obtener artículos de esa ley y filtrar en memoria por longitud
        const { data: articles, error: artErr } = await supabase
            .from('law_items')
            .select('id, text, number, law_id')
            .eq('law_id', randomLaw.id)
            .not('text', 'is', null)
            .limit(100);

        if (artErr) throw new Error('Error leyendo artículos: ' + artErr.message);

        const validArticles = (articles || []).filter(a => a.text && a.text.length > 450);

        if (validArticles.length === 0) {
            return new Response(
                JSON.stringify({ ok: false, message: `La ley "${randomLaw.title}" no tiene artículos con suficiente texto.` }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const art = validArticles[Math.floor(Math.random() * validArticles.length)];
        console.log(`[Quiz] Artículo seleccionado: N° ${art.number} (${art.text.length} chars)`);

        // 3. Generar pregunta con Gemini
        const genRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Eres un Abogado Pedagógico venezolano. Genera un quiz basado ÚNICAMENTE en este texto de la "${randomLaw.title}":

"${art.text.substring(0, 1200)}"

REGLAS:
1. Fuente única: Artículo ${art.number}.
2. No confundas literales (a, b...) con opciones (A, B...).
3. Las 4 opciones deben ser plausibles pero solo 1 correcta.
4. Explicación didáctica de 2-3 oraciones citando el artículo.
5. Responde SOLO con el JSON, sin texto adicional ni markdown.

Formato requerido:
{"question": "¿...?", "options": [{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}], "correct": "A", "explanation": "..."}`
                        }]
                    }],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        temperature: 0.4,
                        maxOutputTokens: 800,
                    }
                })
            }
        );

        if (!genRes.ok) {
            const errText = await genRes.text();
            throw new Error(`Gemini error ${genRes.status}: ${errText.substring(0, 200)}`);
        }

        const genData = await genRes.json();
        const rawQuiz = genData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawQuiz) throw new Error('Gemini devolvió respuesta vacía');

        const quiz = JSON.parse(rawQuiz.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
        console.log(`[Quiz] Quiz generado: "${quiz.question.substring(0, 60)}..."`);

        // 4. Guardar en la base de datos (solo si NO es test)
        if (!isTest) {
            const { error: upsertErr } = await supabase
                .from('daily_quizzes')
                .upsert({
                    date:           vzlaDate,
                    law_id:         art.law_id,
                    law_item_id:    art.id,
                    law_title:      randomLaw.title,
                    article_number: art.number,
                    question:       quiz.question,
                    options:        quiz.options,
                    correct_option: quiz.correct,
                    explanation:    quiz.explanation,
                }, { onConflict: 'date' });

            if (upsertErr) throw new Error('Error guardando quiz: ' + upsertErr.message);
            console.log(`[Quiz] ✅ Quiz guardado en daily_quizzes para ${vzlaDate}`);
        } else {
            console.log('[Quiz] Modo test — quiz NO guardado en DB.');
        }

        // 5. Enviar notificaciones push (en batches de 100 — límite de Expo API)
        let tokens: string[] = [];

        if (targetToken) {
            // Prueba segura: solo al token indicado
            tokens = [targetToken];
            console.log('[Quiz] Modo targetToken: enviando solo a 1 dispositivo.');
        } else if (!isTest) {
            // Producción: leer todos los tokens registrados
            const { data: rows, error: tokensErr } = await supabase
                .from('push_tokens')
                .select('token');

            if (tokensErr) console.error('[Quiz] Error leyendo push_tokens:', tokensErr.message);
            tokens = (rows ?? []).map((r: any) => r.token).filter(Boolean);
            console.log(`[Quiz] Tokens encontrados en DB: ${tokens.length}`);
        } else {
            console.log('[Quiz] Modo test sin targetToken — notificaciones saltadas.');
        }

        if (tokens.length > 0) {
            const BATCH_SIZE = 100; // Límite máximo de Expo Push API
            const totalBatches = Math.ceil(tokens.length / BATCH_SIZE);
            let totalEnviados = 0;
            const invalidTokens: string[] = [];

            for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
                const batch = tokens.slice(i, i + BATCH_SIZE);
                const batchNum = Math.floor(i / BATCH_SIZE) + 1;

                const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(batch.map(token => ({
                        to:        token,
                        title:     '⚖️ Pregunta Legal del Día',
                        body:      quiz.question.length > 100
                                    ? quiz.question.substring(0, 97) + '...'
                                    : quiz.question,
                        data:      { screen: 'DailyQuiz' },
                        sound:     'default',
                        channelId: 'tuley-default',
                    })))
                });

                const expoData = await expoRes.json();
                console.log(`[Quiz] Batch ${batchNum}/${totalBatches} (${batch.length} tokens) → HTTP ${expoRes.status}`);

                // Detectar y acumular tokens inválidos para limpieza
                const results: any[] = expoData?.data ?? [];
                results.forEach((r, idx) => {
                    if (r.status === 'error') {
                        console.warn(`[Quiz] Token error [${batch[idx]?.substring(0, 30)}...]: ${r.message} (${r.details?.error})`);
                        if (r.details?.error === 'DeviceNotRegistered') {
                            invalidTokens.push(batch[idx]);
                        }
                    }
                });

                totalEnviados += batch.length;
            }

            console.log(`[Quiz] ✅ Notificaciones enviadas: ${totalEnviados} tokens en ${totalBatches} batch(es).`);

            // Limpiar tokens inválidos de la DB automáticamente
            if (invalidTokens.length > 0) {
                console.log(`[Quiz] 🧹 Eliminando ${invalidTokens.length} tokens inválidos (DeviceNotRegistered)...`);
                await supabase
                    .from('push_tokens')
                    .delete()
                    .in('token', invalidTokens);
            }
        } else {
            console.log('[Quiz] ⚠️ Sin tokens — no se enviaron notificaciones.');
        }

        return new Response(
            JSON.stringify({
                ok:          true,
                date:        vzlaDate,
                law:         randomLaw.title,
                article:     art.number,
                tokens_sent: tokens.length,
                test_mode:   isTest,
            }),
            { headers: { 'Content-Type': 'application/json' } }
        );

    } catch (err: any) {
        console.error('[Quiz] ❌ Error crítico:', err.message);
        return new Response(
            JSON.stringify({ ok: false, error: err.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
});
