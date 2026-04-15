/**
 * Verifica que las funciones RPC de pgvector estén creadas en Supabase
 * y que los embeddings existan en las tablas.
 * 
 * Uso: node scripts/testSemanticSearch.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;

async function run() {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   TEST BÚSQUEDA SEMÁNTICA — TuLey        ║');
    console.log('╚══════════════════════════════════════════╝\n');

    // ── 1. Contar leyes con embedding ─────────────────────────
    const { count: lawsWithEmb, error: e1 } = await supabase
        .from('laws')
        .select('*', { count: 'exact', head: true })
        .not('embedding', 'is', null);

    const { count: lawsTotal, error: e2 } = await supabase
        .from('laws')
        .select('*', { count: 'exact', head: true });

    console.log(`📚 Leyes con embedding: ${lawsWithEmb ?? '❌'} / ${lawsTotal ?? '?'}`);
    if (e1) console.log('   Error:', e1.message);

    // ── 2. Contar artículos con embedding ─────────────────────
    const { count: itemsWithEmb, error: e3 } = await supabase
        .from('law_items')
        .select('*', { count: 'exact', head: true })
        .not('embedding', 'is', null);

    console.log(`📄 Artículos con embedding: ${itemsWithEmb ?? '❌'}`);
    if (e3) console.log('   Error:', e3.message);

    // ── 3. Generar embedding de prueba ────────────────────────
    console.log('\n🔮 Generando embedding de prueba con Gemini...');
    const testQuery = 'despido injustificado de un trabajador';
    let testEmbedding = null;

    try {
        const res = await fetch(EMBED_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/gemini-embedding-001',
                content: { parts: [{ text: testQuery }] },
                taskType: 'RETRIEVAL_QUERY',
            }),
        });
        if (res.ok) {
            const data = await res.json();
            testEmbedding = data?.embedding?.values;
            
            // Truncar si es mayor a 768
            if (testEmbedding && testEmbedding.length > 768) {
                testEmbedding = testEmbedding.slice(0, 768);
            }
            
            console.log(`   ✅ Vector generado (${testEmbedding?.length} dims)`);
        } else {
            const err = await res.json();
            console.log('   ⚠️ Gemini no disponible (cuota diaria):', err?.error?.message?.substring(0, 80));
            // Usamos vector vacío de 768
            testEmbedding = new Array(768).fill(0);
            console.log('   ℹ️  Usando vector cero para verificar funciones RPC...');
        }
    } catch (e) {
        console.log('   ❌ Fetch error:', e.message);
        testEmbedding = new Array(768).fill(0);
    }

    // ── 4. Probar función match_laws ──────────────────────────
    console.log('\n🔍 Probando función RPC: match_laws...');
    const { data: lawResults, error: rpcErr1 } = await supabase.rpc('match_laws', {
        query_embedding: testEmbedding,
        match_threshold: 0.0,   // Umbral 0 para que devuelva algo aunque sea el vector cero
        match_count: 3,
    });

    if (rpcErr1) {
        console.log('   ❌ match_laws NO existe:', rpcErr1.message);
        console.log('\n   ⚠️  ACCIÓN REQUERIDA: Ejecuta el SQL en Supabase Dashboard');
        console.log('   → Abre: docs/pgvector_setup.sql');
        console.log('   → Copia el contenido desde PASO 4 en adelante');
        console.log('   → Pégalo en: Supabase Dashboard > SQL Editor > Run\n');
    } else {
        console.log(`   ✅ match_laws OK → ${lawResults?.length ?? 0} resultados`);
    }

    // ── 5. Probar función match_all_legal_content ─────────────
    console.log('🔍 Probando función RPC: match_all_legal_content...');
    const { data: allResults, error: rpcErr2 } = await supabase.rpc('match_all_legal_content', {
        query_embedding: testEmbedding,
        match_threshold: 0.0,
        match_count: 3,
    });

    if (rpcErr2) {
        console.log('   ❌ match_all_legal_content NO existe:', rpcErr2.message);
    } else {
        console.log(`   ✅ match_all_legal_content OK → ${allResults?.length ?? 0} resultados`);
    }

    // ── 6. Probar búsqueda real (si hay embedding válido) ─────
    if (testEmbedding && !testEmbedding.every(v => v === 0) && !rpcErr1) {
        console.log(`\n🎯 Búsqueda semántica real: "${testQuery}"`);
        const { data: real, error: realErr } = await supabase.rpc('match_laws', {
            query_embedding: testEmbedding,
            match_threshold: 0.3,
            match_count: 5,
        });
        if (realErr) {
            console.log('   ❌ Error:', realErr.message);
        } else if (real?.length) {
            console.log(`   ✅ ${real.length} leyes encontradas:`);
            real.forEach((r, i) => {
                console.log(`   ${i + 1}. [${(r.similarity * 100).toFixed(1)}%] ${r.title}`);
            });
        } else {
            console.log('   ℹ️  Sin resultados con umbral 0.3 (normal con vector cero)');
        }
    }

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║   Test completado                        ║');
    console.log('╚══════════════════════════════════════════╝\n');
}

run().catch(err => {
    console.error('❌ Error crítico:', err.message);
    process.exit(1);
});
