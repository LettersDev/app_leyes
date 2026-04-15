/**
 * semanticSearch.js
 * 
 * Realiza una búsqueda semántica real en la base de datos de TuLey.
 * Uso: node scripts/semanticSearch.js "una pregunta o tema legal"
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const query = process.argv.slice(2).join(' ');

async function search() {
    if (!query) {
        console.log('\n❌ Por favor, ingresa una búsqueda entre comillas.');
        console.log('   Ejemplo: node scripts/semanticSearch.js "derechos del trabajador en Venezuela"\n');
        return;
    }

    console.log(`\n🔍 Buscando: "${query}"...`);

    // 1. Generar embedding con Gemini
    let embedding = null;
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/gemini-embedding-001',
                content: { parts: [{ text: query }] },
                taskType: 'RETRIEVAL_QUERY',
            }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err?.error?.message || 'Error en la API de Gemini');
        }

        const data = await res.json();
        embedding = data?.embedding?.values;

        // Truncar a 768 si es necesario
        if (embedding && embedding.length > 768) {
            embedding = embedding.slice(0, 768);
        }
    } catch (e) {
        console.error('\n❌ Error al generar embedding:', e.message);
        if (e.message.includes('quota')) {
            console.log('   ⚠️ Has superado la cuota de Gemini. Espera unos minutos e intenta de nuevo.');
        }
        return;
    }

    // 2. Buscar en Supabase
    const { data: results, error } = await supabase.rpc('match_all_legal_content', {
        query_embedding: embedding,
        match_threshold: 0.35,
        match_count: 5
    });

    if (error) {
        console.error('❌ Error en la base de datos:', error.message);
        return;
    }

    // 3. Mostrar resultados
    if (!results || results.length === 0) {
        console.log('   ℹ️ No se encontraron resultados semánticos para esta consulta.');
        return;
    }

    console.log(`\n✅ Se encontraron ${results.length} resultados relevantes:\n`);
    results.forEach((r, i) => {
        const type = r.result_type === 'law' ? '📚 LEY' : '📄 ARTÍCULO';
        const title = r.title.toUpperCase();
        const score = (r.similarity * 100).toFixed(1);
        
        console.log(`${i + 1}. [${score}%] ${type}: ${title}`);
        if (r.number) console.log(`   Número: ${r.number}`);
        if (r.excerpt) {
            const cleanExcerpt = r.excerpt.replace(/\n/g, ' ').substring(0, 150).trim();
            console.log(`   Extracto: "${cleanExcerpt}..."`);
        }
        console.log('   ' + '-'.repeat(50));
    });
    console.log();
}

search();
