require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testSelfSimilarity() {
    console.log('🧪 Probando auto-similitud (Prueba técnica sin usar la API de Gemini)...');

    // 1. Obtener una ley que ya tenga embedding
    const { data: laws, error } = await supabase
        .from('laws')
        .select('id, title, embedding')
        .not('embedding', 'is', null)
        .limit(1);

    if (error || !laws || laws.length === 0) {
        console.log('   ❌ No se encontraron leyes con embedding para la prueba.');
        return;
    }

    const targetLaw = laws[0];
    console.log(`   🎯 Ley seleccionada para el test: "${targetLaw.title}"`);

    // 2. Usar su propio embedding como query para buscar
    const { data: results, error: rpcErr } = await supabase.rpc('match_laws', {
        query_embedding: targetLaw.embedding,
        match_threshold: 0.8,
        match_count: 5
    });

    if (rpcErr) {
        console.log('   ❌ Error en la búsqueda RPC:', rpcErr.message);
    } else if (results && results.length > 0) {
        console.log(`   ✅ ¡Búsqueda exitosa! Se encontraron ${results.length} resultados.`);
        results.forEach((r, i) => {
            console.log(`      ${i+1}. [Similitud: ${(r.similarity * 100).toFixed(1)}%] ${r.title}`);
        });
        
        if (results[0].id === targetLaw.id) {
            console.log('\n   ✨ RESULTADO: El sistema vectorial funciona correctamente en Supabase.');
            console.log('      Identificó la ley exacta usando su huella digital numérica.');
        }
    } else {
        console.log('   ℹ️ No se encontraron resultados (revisa el match_threshold).');
    }
}

testSelfSimilarity();
