require('dotenv').config();
const KEY = process.env.GEMINI_API_KEY;

async function test() {
    console.log('API Key:', KEY ? KEY.substring(0, 12) + '...' : '❌ NO ENCONTRADA');

    // 1. Listar modelos disponibles
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${KEY}`);
    const data = await res.json();

    if (data.error) {
        console.error('\n❌ Error de API:', data.error.message);
        console.error('   Código:', data.error.code);
        return;
    }

    const embedModels = (data.models || []).filter(m =>
        m.supportedGenerationMethods?.includes('embedContent')
    );

    console.log('\n✅ Modelos de embedding disponibles:');
    if (embedModels.length === 0) {
        console.log('   Ninguno — posible restricción regional o de cuota');
    } else {
        embedModels.forEach(m => console.log('  -', m.name));
    }

    // 2. Probar llamada directa con el primer modelo disponible
    if (embedModels.length > 0) {
        const model = embedModels[0].name; // e.g. "models/text-embedding-004"
        console.log(`\n🧪 Probando embedding con ${model}...`);
        const testRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${model}:embedContent?key=${KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    content: { parts: [{ text: 'derecho laboral venezuela' }] },
                })
            }
        );
        const testData = await testRes.json();
        if (testData.embedding?.values) {
            console.log(`   ✅ Funciona! Vector de ${testData.embedding.values.length} dimensiones`);
        } else {
            console.error('   ❌ Falló:', testData.error?.message);
        }
    }
}

test().catch(e => console.error('Error fatal:', e.message));
