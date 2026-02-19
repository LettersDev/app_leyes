require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function init() {
    console.log('🔧 Inicializando documento app_metadata en Supabase...\n');

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
        return;
    }

    // Contar leyes actuales
    const { count, error: countError } = await supabase
        .from('laws')
        .select('*', { count: 'exact', head: true });

    if (countError) throw countError;
    const lawCount = count || 0;
    console.log(`   📊 Leyes encontradas en Supabase: ${lawCount}`);

    const { error } = await supabase
        .from('app_metadata')
        .upsert({
            id: 'singleton',
            laws_last_updated: new Date().toISOString(),
            laws_count: lawCount,
            last_upload_count: 0,
            schema_version: 'v4_cleaned_text',
            updated_at: new Date().toISOString()
        });

    if (error) throw error;

    console.log(`   ✅ app_metadata creado/actualizado exitosamente.`);
    console.log(`   📡 A partir de ahora, la app solo leerá 1 row para verificar actualizaciones.\n`);
}

init().catch(err => {
    console.error('❌ Error:', err.message);
});
