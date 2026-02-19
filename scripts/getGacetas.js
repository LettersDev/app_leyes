require('dotenv').config();
const axios = require('axios');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// Configuración Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const agent = new https.Agent({ rejectUnauthorized: false });

async function fetchWithRetry(url, options = {}, retries = 3, backoff = 2000) {
    try {
        if (!options.headers) options.headers = {};
        options.headers['Accept-Encoding'] = 'identity';
        return await axios.get(url, options);
    } catch (err) {
        if (retries > 0 && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.response?.status >= 500)) {
            console.log(`      ⚠️ Error temporal (${err.message}). Reintentando...`);
            await new Promise(r => setTimeout(r, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 1.5);
        }
        throw err;
    }
}

// CLI Arguments
const args = process.argv.slice(2);
const yearArg = args.find(arg => arg.startsWith('--year='));
const TARGET_YEAR = yearArg ? parseInt(yearArg.split('=')[1]) : null;

const backfillArg = args.find(arg => arg.startsWith('--mode=backfill'));
const fullArg = args.find(arg => arg.startsWith('--mode=full'));
const IS_BACKFILL = !!backfillArg;
const IS_FULL = !!fullArg;

async function getGacetas() {
    console.log(`\n📜 Iniciando Scraper de Gacetas Oficiales (SmartSync)...`);

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
        return;
    }

    const MAX_WRITES = (IS_BACKFILL || IS_FULL) ? 2000 : 500;

    const url = 'http://www.tsj.gob.ve/gaceta-oficial';
    const params = {
        p_p_id: 'receiverGacetaOficial_WAR_NoticiasTsjPorlet612',
        p_p_lifecycle: '2',
        p_p_state: 'normal',
        p_p_mode: 'view',
        p_p_cacheability: 'cacheLevelPage',
        'server[endpoint]': '/services/WSGacetaOficial.HTTPEndpoint',
        'server[method]': '/listGaceta'
    };

    try {
        const currentYear = new Date().getFullYear();
        let targetYears = [];

        if (TARGET_YEAR) {
            targetYears = [TARGET_YEAR];
            console.log(`   📅 Modo: Manual | Año objetivo: ${TARGET_YEAR}`);
        } else if (IS_FULL) {
            console.log(`   🚀 Modo: Full | Sincronizando toda la base de datos disponible.`);
        } else if (IS_BACKFILL) {
            // Smart Backfill Progress desde sync_monitor
            let lastHistoricalYearSynced = 1999;
            const { data: syncData } = await supabase
                .from('sync_monitor')
                .select('data')
                .eq('id', 'gacetas_sync')
                .maybeSingle();

            if (syncData) {
                lastHistoricalYearSynced = syncData.data?.lastHistoricalYearSynced || 1999;
            }

            const nextYear = lastHistoricalYearSynced + 1;
            targetYears = [currentYear, currentYear - 1];

            if (nextYear < currentYear - 1) {
                targetYears.push(nextYear);
                console.log(`   🔄 Modo: SmartSync | Recientes + Año Histórico: ${nextYear}`);
            } else {
                console.log(`   ✨ Modo: SmartSync | Toda la historia (2000+) está sincronizada.`);
            }
        } else {
            targetYears = [currentYear, currentYear - 1];
            console.log(`   📅 Modo: Recientes (Hoy/Ayer)`);
        }

        // Fetch Remote List
        console.log("   🔍 Obteniendo lista del TSJ...");
        const res = await fetchWithRetry(url, {
            params,
            httpsAgent: agent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        if (res.data.coleccion && res.data.coleccion.GACETA) {
            const list = res.data.coleccion.GACETA;
            console.log(`   🌐 Total en TSJ: ${list.length}`);

            // Filter by target years (skipped in FULL mode)
            const matchedItems = list.filter(g => {
                if (IS_FULL) return true;
                if (!g.sgacefecha) return false;
                const year = parseInt(g.sgacefecha.split('/')[2]);
                return targetYears.includes(year);
            });

            if (matchedItems.length === 0) {
                console.log("   ✅ No hay gacetas en el TSJ para los años seleccionados.");
                return;
            }

            // Verificar duplicados en Supabase (OPIMIZADO: Lectura en bloque)
            console.log(`   💾 Verificando duplicados en DB...`);

            const existingIds = new Set();
            let page = 0;
            const PAGE_SIZE_DB = 1000;
            let hasMoreDB = true;

            while (hasMoreDB) {
                const { data, error } = await supabase
                    .from('gacetas')
                    .select('id')
                    .range(page * PAGE_SIZE_DB, (page + 1) * PAGE_SIZE_DB - 1);

                if (error) throw error;
                (data || []).forEach(row => existingIds.add(row.id));

                if (!data || data.length < PAGE_SIZE_DB) {
                    hasMoreDB = false;
                } else {
                    page++;
                }
            }

            const newItems = matchedItems.filter(g => {
                const num = parseInt(g.sgacenumero.replace(/\./g, ''));
                if (isNaN(num)) return false;
                const id = `gaceta-${num}`;
                return !existingIds.has(id);
            });

            console.log(`   ✨ Nuevas para importar: ${newItems.length}`);

            if (newItems.length === 0) {
                console.log("   ✅ Todo está sincronizado.");
            } else {
                const toProcess = newItems.slice(0, MAX_WRITES);
                console.log(`   🚀 Procesando ${toProcess.length} registros...`);

                let writesCount = 0;
                const chunkSize = 25;
                for (let i = 0; i < toProcess.length; i += chunkSize) {
                    const chunk = toProcess.slice(i, i + chunkSize);
                    await Promise.all(chunk.map(g => saveGaceta(g)));
                    writesCount += chunk.length;
                    console.log(`      Sincronizados: ${writesCount} / ${toProcess.length}`);
                }
            }

            // Actualizar progreso en backfill mode
            if (IS_BACKFILL && !TARGET_YEAR) {
                const { data: syncData } = await supabase
                    .from('sync_monitor')
                    .select('data')
                    .eq('id', 'gacetas_sync')
                    .maybeSingle();

                const currentStored = syncData?.data?.lastHistoricalYearSynced || 1999;
                const nextYearToMark = currentStored + 1;

                if (nextYearToMark < currentYear - 1) {
                    await supabase
                        .from('sync_monitor')
                        .upsert({
                            id: 'gacetas_sync',
                            data: { lastHistoricalYearSynced: nextYearToMark, lastUpdate: new Date().toISOString() },
                            updated_at: new Date().toISOString()
                        });
                    console.log(`\n✅ Progreso guardado: Registros históricos hasta ${nextYearToMark} verificados.`);
                }
            }

        } else {
            console.log(`   ❌ No se encontró la colección de Gacetas.`);
        }

    } catch (e) {
        console.error(`   ❌ Error fatal: ${e.message}`);
    }
}

async function saveGaceta(g) {
    if (!g.sgacenumero || !g.sgacefecha) return;

    const num = parseInt(g.sgacenumero.replace(/\./g, ''));
    if (isNaN(num)) return;

    const id = `gaceta-${num}`;

    let folder = 'gaceta_ext';
    if (num > 30000) folder = 'gaceta';
    const url = `http://historico.tsj.gob.ve/${folder}/blanco.asp?nrogaceta=${g.sgacenumero}`;

    const [day, month, year] = g.sgacefecha.split('/');
    const dateObj = new Date(`${year}-${month}-${day}`);

    const summary = g.sgacedescripcion || g.sgacesumario || '';

    const row = {
        id: id,
        numero: num,
        numero_display: g.sgacenumero,
        fecha: g.sgacefecha,
        ano: parseInt(year),
        mes: parseInt(month),
        dia: parseInt(day),
        timestamp: dateObj.toISOString(),
        url_original: url,
        titulo: summary ? `${summary.substring(0, 100)}...` : `Gaceta Oficial N° ${g.sgacenumero}`,
        subtitulo: `Publicado el ${g.sgacefecha}`,
        sumario: summary,
        tipo: num > 30000 ? 'Ordinaria' : 'Extraordinaria/Antigua'
    };

    try {
        const { error } = await supabase
            .from('gacetas')
            .upsert(row);

        if (error) throw error;
    } catch (e) {
        console.error(`      Error saving ${id}: ${e.message}`);
    }
}

getGacetas();
