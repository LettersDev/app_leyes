/**
 * setVersion.js
 * Script para actualizar la versión de la app en Supabase manualmente.
 *
 * Uso: node scripts/setVersion.js 1.1.1
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function setVersion(newVersion) {
    if (!newVersion) {
        console.log('❌ Error: Debes proporcionar una versión. Ej: node scripts/setVersion.js 1.1.1');
        return;
    }

    console.log(`🚀 Actualizando latest_app_version a: ${newVersion}...`);

    try {
        const { error } = await supabase
            .from('app_metadata')
            .update({
                latest_app_version: newVersion,
                updated_at: new Date().toISOString()
            })
            .eq('id', 'singleton');

        if (error) throw error;

        console.log('✅ Versión actualizada exitosamente en Supabase.');
        console.log('📡 Los usuarios verán el aviso de actualización al abrir la app.');
    } catch (error) {
        console.error('❌ Error al actualizar:', error.message);
    }
}

const version = process.argv[2];
setVersion(version);
