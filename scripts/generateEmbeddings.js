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

// ─── Rate limiting (plan gratuito de Gemini) ───────────────────────────────
// Límite clave: 250,000 TOKENS por minuto (no solo requests).
// Los artículos legales pueden tener 500-1500 tokens c/u.
// Con 1500ms de delay → ~40 arts/min → ~60,000 tokens/min → margen seguro.
// ──────────────────────────────────────────────────────────────────────────
const DELAY_LAWS_MS  = 300;   // ~3 leyes/segundo (textos cortos)
const DELAY_ITEMS_MS = 1500;  // ~40 artículos/minuto (textos largos)
const BATCH_UPDATE   = 20;    // Filas a actualizar en Supabase por lote

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
// Paso A: Embeddings para la tabla `laws`
// ─────────────────────────────────────────────────────────────

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
// Paso B: Embeddings para la tabla `law_items` (artículos)
// ─────────────────────────────────────────────────────────────

async function processItems() {
    console.log('\n📄 ── ARTÍCULOS (tabla: law_items) ─────────────────────');

    // Traer solo artículos de tipo "article" sin embedding
    const query = supabase
        .from('law_items')
        .select('id, law_id, number, title, text, type')
        .eq('type', 'article')  // Solo artículos, no encabezados
        .not('text', 'is', null);

    if (!FORCE_ALL) query.is('embedding', null);

    const { data: items, error } = await query;
    if (error) { console.error('❌ Error al traer artículos:', error.message); return; }
    if (!items || items.length === 0) {
        console.log('✅ Todos los artículos ya tienen embedding.');
        return;
    }

    console.log(`📋 ${items.length} artículos para procesar`);
    console.log(`⏱️  Tiempo estimado: ~${Math.ceil(items.length * DELAY_ITEMS_MS / 60000)} minutos\n`);

    let ok = 0, failed = 0;
    const updates = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (i % 50 === 0) {
            console.log(`   [${i + 1}/${items.length}] Procesando artículos...`);
        }

        // Texto: "Artículo 23. [texto del artículo]"
        const text = [
            item.number ? `Artículo ${item.number}.` : '',
            item.title || '',
            item.text || '',
        ].filter(Boolean).join(' ');

        const embedding = await getEmbedding(text);

        if (embedding) {
            updates.push({ id: item.id, law_id: item.law_id, embedding });
            ok++;
        } else {
            failed++;
        }

        // Subir a Supabase en lotes
        if (updates.length >= BATCH_UPDATE || i === items.length - 1) {
            for (const u of updates) {
                // pgvector requiere el vector como string '[n1,n2,...]'
                const embStr = `[${u.embedding.join(',')}]`;
                const { error: upErr } = await supabase
                    .from('law_items')
                    .update({ embedding: embStr })
                    .eq('id', u.id)
                    .eq('law_id', u.law_id);
                if (upErr) {
                    console.error(`\n   ❌ Error guardando ítem ${u.id}:`, upErr.message);
                    failed++;
                    ok--;
                }
            }
            updates.length = 0;
            process.stdout.write(`\r   💾 Guardados: ${ok} | Fallidos: ${failed}   `);
        }

        if (i < items.length - 1) {
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
