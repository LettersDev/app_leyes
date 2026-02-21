require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function wipe() {
    console.log('🗑️ Borrando todas las Gacetas de la base de datos para empezar de cero...');

    // Usamos un filtro que siempre sea verdadero para borrar todo
    const { error, count } = await supabase
        .from('gacetas')
        .delete({ count: 'exact' })
        .neq('id', 'borrar-todo'); // Borra todo lo que NO tenga este ID (que es todo)

    if (error) {
        console.error('❌ Error al borrar:', error.message);
    } else {
        console.log(`✅ ¡Éxito! Se borraron ${count} registros.`);
        console.log('\n🚀 Ahora puedes correr el bot de gacetas limpio:');
        console.log('node scripts/getGacetas.js --mode=full');
    }
}

wipe();
