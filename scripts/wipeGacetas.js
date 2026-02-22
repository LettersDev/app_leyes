require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function wipe() {
    console.log('🗑️ Borrando todas las Gacetas de la base de datos para empezar de cero...');

    // 1. Borrar tabla de gacetas
    const { error, count } = await supabase
        .from('gacetas')
        .delete({ count: 'exact' })
        .neq('id', 'borrar-todo'); // Borra todo lo que NO tenga este ID (que es todo)

    if (error) {
        console.error('❌ Error al borrar gacetas:', error.message);
        return;
    }
    console.log(`✅ Gacetas borradas: ${count} registros eliminados.`);

    // 2. Resetear el progreso del backfill en sync_monitor
    const { error: syncError } = await supabase
        .from('sync_monitor')
        .delete()
        .eq('id', 'gacetas_sync');

    if (syncError) {
        console.error('⚠️  No se pudo resetear sync_monitor:', syncError.message);
    } else {
        console.log('✅ Progreso de backfill (gacetas_sync) reseteado.');
    }

    console.log('\n🚀 Ahora puedes correr el bot de gacetas limpio:');
    console.log('node scripts/getGacetas.js --mode=full');
}

wipe();
