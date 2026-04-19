/**
 * generateEmbeddings.js
 * 
 * Genera y sube embeddings vectoriales para TODAS las leyes y artículos en Supabase.
 * Usa la API de Google Gemini (text-embedding-004, 768 dimensiones, GRATIS).
 * 
 * Uso:
 *   node scripts/generateEmbeddings.js           → solo leyes sin embedding
 *   node scripts/generateEmbeddings.js --force   → regenera todo
 *   node scripts/generateEmbeddings.js --items   → también embute los artículos individuales
 * 
 * IMPORTANTE: Ejecutar DESPUÉS de haber corrido el SQL de pgvector en Supabase.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Modelos en orden de preferencia (3072 dimensiones)
const EMBED_MODELS = [
    'models/gemini-embedding-001',        // Confirmado disponible
    'models/gemini-embedding-2-preview',  // Fallback
];

// Flags de ejecución
const FORCE_ALL  = process.argv.includes('--force');
const DO_ITEMS   = process.argv.includes('--items');

// ─── Rate limiting (plan gratuito de Gemini) ─────────────────────────────────────────
// El plan gratuito tiene DOS límites:
//   · 250,000 TPM (tokens/minuto)
//   · 15 RPM  (requests/minuto)  ← el más restrictivo
//
// Usamos batchEmbedContents: EMBED_BATCH ítems por request:
//   EMBED_BATCH=10, DELAY_ITEMS_MS=4100 → ~14.6 req/min (bajo 15 RPM)
//   10 ítems/req × 14.6 req/min = ~146 ítems/min
//   10,866 artículos ≈ 75 minutos (vs. ~12 horas sin batch)
// ────────────────────────────────────────────────────────────────────────────
const DELAY_LAWS_MS        = 300;   // ~3 leyes/segundo (textos cortos)
const DELAY_ITEMS_MS       = 4100;  // Delay entre lotes de artículos (respeta 15 RPM)
const EMBED_BATCH          = 10;    // Artículos por llamada a batchEmbedContents
const BATCH_UPDATE         = 20;    // Filas a actualizar en Supabase por lote
const MAX_CONSEC_FAILURES  = 5;     // Lotes fallidos consecutivos → cuota agotada → salir

// ─────────────────────────────────────────────────────────────
// Core: Llamada a la API de Gemini
// ─────────────────────────────────────────────────────────────

/**
 * Convierte un texto en un vector (embedding) usando Gemini.
 * Reintentos automáticos con backoff exponencial si hay rate limiting (429).
 * @param {string} text
 * @param {number} [retries=3]
 * @returns {Promise<number[]|null>}
 */
async function getEmbedding(text, retries = 3) {
    const truncated = text.substring(0, 2000).trim();
    if (!truncated) return null;

    for (const model of EMBED_MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/${model}:embedContent?key=${GEMINI_API_KEY}`;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model,
                        content: { parts: [{ text: truncated }] },
                        taskType: 'RETRIEVAL_DOCUMENT',
                    }),
                });

                if (!response.ok) {
                    const err = await response.json();
                    const msg = err?.error?.message || String(response.status);

                    // Modelo no soportado → pasar al siguiente modelo
                    if (msg.includes('not found') || msg.includes('not supported') || msg.includes('denied')) {
                        console.warn(`   ⚠️  Modelo ${model} no disponible, probando siguiente...`);
                        break; // Salir del loop de reintentos para este modelo
                    }

                    // Rate limit → esperar con backoff exponencial y reintentar
                    if (msg.toLowerCase().includes('resource exhausted') || msg.includes('429')) {
                        if (attempt < retries) {
                            const waitMs = (2 ** attempt) * 3000; // 3s, 6s, 12s
                            process.stdout.write(` ⏳ Rate limit, esperando ${waitMs / 1000}s...`);
                            await new Promise(r => setTimeout(r, waitMs));
                            continue;
                        }
                    }

                    console.error(`   ❌ Gemini error (${model}):`, msg);
                    return null;
                }

                const data = await response.json();
                let values = data?.embedding?.values;
                
                if (values) {
                    // Truncar a 768 si es mayor (Matryoshka Embeddings)
                    // pgvector HNSW tiene un límite de 2000 dimensiones.
                    if (values.length > 768) {
                        values = values.slice(0, 768);
                    }
                    return values;
                }

            } catch (e) {
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                console.error(`   ❌ Fetch error (${model}):`, e.message);
            }
        }
    }

    console.error('   ❌ Ningún modelo disponible tras reintentos. ¿Cuota agotada?');
    return null;
}

// ─────────────────────────────────────────────────────────────
// Batch: Embeddings para MÚltiples textos (batchEmbedContents)
// 1 llamada a la API = EMBED_BATCH artículos → mucho más eficiente
// ─────────────────────────────────────────────────────────────

/**
 * Convierte un lote de textos en vectores usando batchEmbedContents.
 * Una sola llamada a la API por cada EMBED_BATCH textos (respeta 15 RPM).
 * @param {string[]} texts  - Array de textos para embeber
 * @param {number} retries  - Reintentos con backoff exponencial
 * @returns {Promise<(number[]|null)[]>}  - Array de vectores (null si error individual)
 */
async function getBatchEmbeddings(texts, retries = 3) {
    const model = EMBED_MODELS[0]; // gemini-embedding-001
    const url = `https://generativelanguage.googleapis.com/v1beta/${model}:batchEmbedContents?key=${GEMINI_API_KEY}`;

    const requests = texts.map(text => ({
        model,
        content: { parts: [{ text: text.substring(0, 2000).trim() }] },
        taskType: 'RETRIEVAL_DOCUMENT',
    }));

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requests }),
            });

            if (!response.ok) {
                const err = await response.json();
                const msg = err?.error?.message || String(response.status);

                if (msg.toLowerCase().includes('resource exhausted') || msg.includes('429')) {
                    if (attempt < retries) {
                        const waitMs = (2 ** attempt) * 5000; // 5s, 10s, 20s
                        process.stdout.write(` ⏳ Rate limit, esperando ${waitMs / 1000}s...`);
                        await new Promise(r => setTimeout(r, waitMs));
                        continue;
                    }
                }

                console.error(`   ❌ batchEmbedContents error:`, msg);
                return null;
            }

            const data = await response.json();
            const embeddings = data?.embeddings || [];

            return embeddings.map(e => {
                let values = e?.values || null;
                // Matryoshka: truncar a 768 (igual que en indexado)
                if (values && values.length > 768) values = values.slice(0, 768);
                return values;
            });

        } catch (e) {
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            console.error(`   ❌ Batch fetch error:`, e.message);
        }
    }
    return null;
}


async function processLaws() {
    console.log('\n📚 ── LEYES (tabla: laws) ──────────────────────────────');

    // Traer leyes sin embedding (o todas si --force)
    const query = supabase
        .from('laws')
        .select('id, title, description, searchable_text, category');

    if (!FORCE_ALL) query.is('embedding', null);

    const { data: laws, error } = await query;
    if (error) { console.error('❌ Error al traer leyes:', error.message); return; }
    if (!laws || laws.length === 0) {
        console.log('✅ Todas las leyes ya tienen embedding.');
        return;
    }

    console.log(`📋 ${laws.length} leyes para procesar\n`);

    let ok = 0, failed = 0;
    const updates = [];

    for (let i = 0; i < laws.length; i++) {
        const law = laws[i];
        process.stdout.write(`[${i + 1}/${laws.length}] ${law.title.substring(0, 60)}...`);

        // Texto a embedir: título + descripción + primeros 1500 chars del searchable_text
        const text = [
            law.title,
            law.description || '',
            (law.searchable_text || '').substring(0, 1500),
        ].filter(Boolean).join('. ');

        const embedding = await getEmbedding(text);

        if (embedding) {
            updates.push({ id: law.id, embedding });
            process.stdout.write(' ✓\n');
            ok++;
        } else {
            process.stdout.write(' ✗ (sin embedding)\n');
            failed++;
        }

        // Subir a Supabase en lotes
        if (updates.length >= BATCH_UPDATE || i === laws.length - 1) {
            for (const u of updates) {
                // pgvector requiere el vector como string '[n1,n2,...]'
                const embStr = `[${u.embedding.join(',')}]`;
                const { error: upErr } = await supabase
                    .from('laws')
                    .update({ embedding: embStr })
                    .eq('id', u.id);
                if (upErr) {
                    if (upErr.message.includes('dimensions')) {
                        console.error(`\n   ❌ ERROR DE DIMENSIONES: La base de datos espera otra longitud de vector.`);
                        console.error(`      Asegúrate de ejecutar docs/pgvector_fix_dimensions.sql en Supabase.\n`);
                        process.exit(1); // Detenemos para no seguir fallando
                    }
                    console.error(`\n   ❌ Error guardando ley ${u.id}:`, upErr.message);
                    failed++;
                    ok--;
                }
            }
            updates.length = 0;
        }

        if (i < laws.length - 1) {
            await new Promise(r => setTimeout(r, DELAY_LAWS_MS));
        }
    }

    console.log(`\n   ✅ Leyes: ${ok} OK | ${failed} fallidas`);
}

// ─────────────────────────────────────────────────────────────
// Paso B: Embeddings para la tabla `law_items` (artículos) — modo BATCH
// ─────────────────────────────────────────────────────────────

async function processItems() {
    console.log('\n📄 ── ARTÍCULOS (tabla: law_items) — MODO BATCH ───────────────');

    // 1. Obtener el total real de artículos pendientes (independiente del límite de descarga de query)
    const pendingQuery = supabase
        .from('law_items')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'article')
        .not('text', 'is', null);
    
    if (!FORCE_ALL) pendingQuery.is('embedding', null);
    const { count: totalPending } = await pendingQuery;

    // 2. Definir la consulta para traer los artículos (Supabase limita a 1000 por defecto)
    const query = supabase
        .from('law_items')
        .select('id, law_id, number, title, text')
        .eq('type', 'article')
        .not('text', 'is', null);

    if (!FORCE_ALL) query.is('embedding', null);

    const { data: items, error } = await query;
    if (error) { console.error('❌ Error al traer artículos:', error.message); return; }
    if (!items || items.length === 0) {
        console.log('✅ Todos los artículos ya tienen embedding.');
        return;
    }

    const totalBatches = Math.ceil(items.length / EMBED_BATCH);
    const estMins = Math.ceil(totalBatches * DELAY_ITEMS_MS / 60000);
    console.log(`📋 Procesando ${items.length} de ${totalPending || items.length} pendientes (${totalBatches} lotes de ${EMBED_BATCH})`);
    console.log(`⏱️  Tiempo estimado: ~${estMins} minutos\n`);

    let ok = 0, failed = 0, consecFailed = 0;
    const dbUpdates = [];

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        const start  = batchIdx * EMBED_BATCH;
        const batch  = items.slice(start, start + EMBED_BATCH);

        // Preparar textos del lote
        const texts = batch.map(item => [
            item.number ? `Artículo ${item.number}.` : '',
            item.title  || '',
            item.text   || '',
        ].filter(Boolean).join(' '));

        process.stdout.write(`[Lote ${batchIdx + 1}/${totalBatches}] ${batch.length} arts...`);

        // Una sola llamada a la API para todo el lote
        const embeddings = await getBatchEmbeddings(texts);

        if (!embeddings) {
            process.stdout.write(` ✗ (lote fallido)\n`);
            failed += batch.length;
            consecFailed++;

            // ⚠️ Guard de cuota: si N lotes seguidos fallan, la cuota del día está agotada.
            // Salimos limpiamente — el próximo run diario retoma desde aquí (modo incremental).
            if (consecFailed >= MAX_CONSEC_FAILURES) {
                console.log(`\n⏸️  ${MAX_CONSEC_FAILURES} lotes consecutivos fallidos → cuota diaria agotada.`);
                console.log(`   Pendientes: ~${totalBatches - batchIdx - 1} lotes. El bot retomará mañana.`);
                console.log(`   ✅ Progreso guardado: ${ok} artículos con embedding.\n`);
                break;
            }
        } else {
            consecFailed = 0; // Resetear contador en cada éxito
            batch.forEach((item, i) => {
                if (embeddings[i]) {
                    dbUpdates.push({ id: item.id, law_id: item.law_id, embedding: embeddings[i] });
                    ok++;
                } else {
                    failed++;
                }
            });
            process.stdout.write(` ✓\n`);
        }

        // Guardar en Supabase cuando acumulamos suficientes o al final del proceso
        if (dbUpdates.length >= BATCH_UPDATE || batchIdx === totalBatches - 1) {
            for (const u of dbUpdates) {
                const embStr = `[${u.embedding.join(',')}]`;
                const { error: upErr } = await supabase
                    .from('law_items')
                    .update({ embedding: embStr })
                    .eq('id', u.id)
                    .eq('law_id', u.law_id);
                if (upErr) {
                    if (upErr.message.includes('dimensions')) {
                        console.error(`\n   ❌ ERROR DE DIMENSIONES. Ejecuta pgvector_fix_dimensions.sql en Supabase.\n`);
                        process.exit(1);
                    }
                    console.error(`\n   ❌ Error guardando ítem ${u.id}:`, upErr.message);
                    failed++;
                    ok--;
                }
            }
            dbUpdates.length = 0;
            process.stdout.write(`   💾 Progreso: ${ok} guardados | ${failed} fallidos\n`);
        }

        // Respetar el límite de 15 RPM entre lotes
        if (batchIdx < totalBatches - 1) {
            await new Promise(r => setTimeout(r, DELAY_ITEMS_MS));
        }
    }

    console.log(`\n\n   ✅ Artículos: ${ok} OK | ${failed} fallidos`);
}



// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function run() {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   GENERADOR DE EMBEDDINGS — TuLey        ║');
    console.log('╚══════════════════════════════════════════╝');

    if (!GEMINI_API_KEY) {
        console.error('❌ Falta GEMINI_API_KEY en el archivo .env');
        process.exit(1);
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ Faltan variables de Supabase en .env');
        process.exit(1);
    }

    console.log(`\nModo: ${FORCE_ALL ? '🔴 FORCE (regenerar todo)' : '🟢 Incremental (solo sin embedding)'}`);
    console.log(`Artículos: ${DO_ITEMS ? '✅ SÍ se procesarán' : '⏭️  NO (usa --items para incluirlos)'}\n`);

    const start = Date.now();

    // Siempre procesar leyes
    await processLaws();

    // Solo procesar artículos si se pasa --items (pueden ser miles)
    if (DO_ITEMS) {
        await processItems();
    }

    const mins = ((Date.now() - start) / 60000).toFixed(1);
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║   Completado en ${mins} min`);
    console.log(`╚══════════════════════════════════════════╝`);

    if (!DO_ITEMS) {
        console.log('\n💡 Para embeber también los artículos individuales:');
        console.log('   node scripts/generateEmbeddings.js --items\n');
    }
}

run().catch(err => {
    console.error('❌ ERROR CRÍTICO:', err.message);
    process.exit(1);
});
