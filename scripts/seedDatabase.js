require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// --- CONFIGURACIÓN SUPABASE ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const BATCH_SIZE = 400;
const DELAY_MS = 200;
const SCHEMA_VERSION = "v5_unique_ids";

// --- UTILIDADES ---

function getLawHash(law) {
    const articleCount = law.content?.articles?.length || 0;
    return `${law.title}_${articleCount}_${law.date}_${SCHEMA_VERSION}`;
}

async function lawExistsAndIsSame(category, newHash) {
    try {
        const { data, error } = await supabase
            .from('laws')
            .select('hash')
            .eq('id', category)
            .maybeSingle();

        if (error) throw error;
        if (data) {
            return data.hash === newHash;
        }
    } catch (e) {
        console.error(`⚠️ Error al verificar existencia: ${e.message}`);
    }
    return false;
}

async function uploadLaw(lawData) {
    const { content, ...metadata } = lawData;
    const articles = content.articles || [];
    const category = metadata.category;
    const hash = getLawHash(lawData);

    console.log(`\n📚 ${metadata.title}`);
    console.log(`   Artículos: ${articles.length}`);

    // 1. Guardar Metadatos de la Ley (upsert) - SIN HASH TODAVÍA
    console.log(`   ⏳ Guardando metadatos base...`);
    const { error: lawError } = await supabase
        .from('laws')
        .upsert({
            id: category,
            ...metadata,
            item_count: articles.length,
            is_large_law: articles.length > 500,
            last_updated: new Date().toISOString()
            // No guardamos el hash todavía para que si falla la subida de items, se reintente
        });

    if (lawError) throw lawError;

    // 2. Guardar Artículos en tabla law_items (por lotes)
    const totalBatches = Math.ceil(articles.length / BATCH_SIZE);

    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
        const currentBatch = articles.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

        const rows = currentBatch.map((item, j) => {
            const index = i + j;
            // Usamos el índice para garantizar unicidad y evitar el error ON CONFLICT
            const itemId = `${item.type}_${index}`;
            return {
                id: itemId,
                law_id: category,
                ...item,
                index: index,
                law_category: category,
                last_updated: new Date().toISOString()
            };
        });

        console.log(`   ⏳ Subiendo lote ${batchNumber}/${totalBatches} (${currentBatch.length} items)...`);

        const { error: itemsError } = await supabase
            .from('law_items')
            .upsert(rows, { onConflict: 'law_id,id' });

        if (itemsError) throw itemsError;

        if (i + BATCH_SIZE < articles.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }

    // 3. ACTUALIZAR HASH - Solo si todo lo anterior tuvo éxito
    console.log(`   ⏳ Finalizando (actualizando hash)...`);
    await supabase.from('laws').update({ hash: hash }).eq('id', category);

    console.log(`   ✅ ¡Ley completada!`);
}

/**
 * Actualiza el row de metadata para que la app detecte cambios con UNA SOLA lectura.
 */
async function updateMetadata(uploadedCount, totalLaws) {
    console.log(`\n📡 Actualizando metadata global (app_metadata)...`);
    const { error } = await supabase
        .from('app_metadata')
        .upsert({
            id: 'singleton',
            laws_last_updated: new Date().toISOString(),
            laws_count: totalLaws,
            last_upload_count: uploadedCount,
            schema_version: SCHEMA_VERSION,
            updated_at: new Date().toISOString()
        });

    if (error) throw error;
    console.log(`   ✅ Metadata actualizada. Las apps detectarán los cambios.`);
}

async function run() {
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║   CARGA RESILIENTE DE LEYES (SUPABASE) ║');
    console.log('╚═══════════════════════════════════════╝\n');

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
        return;
    }

    const startTime = Date.now();
    const dataDir = path.join(__dirname, '../data');

    const specificFileName = process.argv[2];
    let files = [];

    if (specificFileName) {
        const filePath = path.join(dataDir, specificFileName);
        if (fs.existsSync(filePath)) {
            files = [filePath];
        } else {
            console.error(`❌ El archivo no existe: ${specificFileName}`);
            return;
        }
    } else {
        files = fs.readdirSync(dataDir)
            .filter(f => f.endsWith('.json'))
            .map(f => path.join(dataDir, f));
    }

    console.log(`📁 Procesando ${files.length} leyes\n`);

    let firstLawTitle = null;
    let firstLawCategory = null;

    for (const file of files) {
        const fileName = path.basename(file);
        console.log(`\n─────────────────────────────────────`);
        console.log(`📄 Procesando: ${fileName}`);

        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            totalLaws += data.length;
            for (const lawData of data) {
                const newHash = getLawHash(lawData);
                const isSame = await lawExistsAndIsSame(lawData.category, newHash);

                if (isSame) {
                    console.log(`⏭️  ${lawData.title} - Ya existe (sin cambios)`);
                    skippedCount++;
                } else {
                    await uploadLaw(lawData);
                    uploadedCount++;
                    if (!firstLawTitle) {
                        firstLawTitle = lawData.title;
                        firstLawCategory = lawData.type || 'Ley';
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Error en archivo ${fileName}: ${error.message}`);
        }
    }

    // Actualizar metadata global si hubo cambios
    if (uploadedCount > 0) {
        await updateMetadata(uploadedCount, totalLaws);

        // 🔔 NOTIFICACIÓN PUSH
        const PushNotifier = require('./pushNotifier');
        const title = uploadedCount === 1 ? 'Nueva Ley Disponible' : 'Nuevas Leyes Actualizadas';
        const body = uploadedCount === 1
            ? `Se ha añadido: ${firstLawTitle} (${firstLawCategory})`
            : `Se han actualizado/agregado ${uploadedCount} leyes.`;

        await PushNotifier.notifyAll(title, body, { type: 'laws', count: uploadedCount });
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n═══════════════════════════════════════');
    console.log(`✅ Proceso completado en ${totalTime}s`);
    console.log(`📊 Nuevas/Actualizadas: ${uploadedCount}`);
    console.log(`⏭️  Omitidas (sin cambios): ${skippedCount}`);
    console.log('═══════════════════════════════════════\n');
}

run().catch(err => {
    console.error('❌ ERROR CRÍTICO:', err.message);
});
