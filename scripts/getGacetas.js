require('dotenv').config();
const axios = require('axios');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// Configuración Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const agent = new https.Agent({ rejectUnauthorized: false });

async function fetchWithRetry(url, options = {}, retries = 5, backoff = 5000) {
    try {
        if (!options.headers) options.headers = {};
        options.headers['Accept-Encoding'] = 'identity';
        return await axios.get(url, options);
    } catch (err) {
        const retriableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENOTFOUND'];
        const isNetworkError = retriableCodes.includes(err.code) || err.response?.status >= 500;

        if (retries > 0 && isNetworkError) {
            console.log(`      ⚠️ Error de red (${err.code || err.message}). Reintentando en ${backoff / 1000}s... (${retries} restantes)`);
            await new Promise(r => setTimeout(r, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
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
const repairArg = args.find(arg => arg.startsWith('--mode=repair')); // Nuevo modo repair
const extraArg = args.find(arg => arg.startsWith('--mode=extra')); // Nuevo modo solo extraordinarias
const IS_BACKFILL = !!backfillArg;
const IS_FULL = !!fullArg;
const IS_REPAIR = !!repairArg;
const IS_EXTRA_ONLY = !!extraArg;

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
        } else if (IS_EXTRA_ONLY) {
            console.log(`   ⚖️  Modo: Solo Extraordinarias | Sincronizando registros específicos.`);
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
            console.log(`   🧪 Primeros 10 números en raw: ${list.slice(0, 10).map(g => g.sgacenumero).join(', ')}`);

            // Filter by target years (skipped in FULL/EXTRA mode)
            const matchedItems = list.filter(g => {
                if (IS_FULL) return true;

                // Determinar si es Extraordinaria para el filtro IS_EXTRA_ONLY
                const rawNum = g.sgacenumero || '';
                const cleanNum = parseInt(rawNum.replace(/\./g, ''));
                const summary = g.sgacedescripcion || g.sgacesumario || g.sgacedesc || g.sgacesum || '';
                const typeText = g.sgacetipo || '';
                const isExtra = isGacetaExtraordinaria(cleanNum, rawNum, typeText, summary);

                if (IS_EXTRA_ONLY) {
                    return isExtra;
                }

                if (!g.sgacefecha) return false;
                const year = parseInt(g.sgacefecha.split('/')[2]);
                return targetYears.includes(year);
            });

            if (matchedItems.length === 0) {
                console.log("   ✅ No hay gacetas en el TSJ para los años seleccionados.");
                return;
            }

            // DIAGNÓSTICO: Ver las llaves del primer objeto para detectar cambios en el TSJ
            if (matchedItems[0]) {
                console.log("   🧪 Estructura de Gaceta detectada:", Object.keys(matchedItems[0]).join(', '));
            }

            // Verificar duplicados en Supabase (OPIMIZADO: Lectura en bloque con sumario)
            console.log(`   💾 Verificando estado de la base de datos...`);

            const existingData = new Map(); // id -> { sumario, tipo }
            let page = 0;
            const PAGE_SIZE_DB = 1000;
            let hasMoreDB = true;

            while (hasMoreDB) {
                const { data, error } = await supabase
                    .from('gacetas')
                    .select('id, sumario, tipo') // Agregado tipo
                    .range(page * PAGE_SIZE_DB, (page + 1) * PAGE_SIZE_DB - 1);

                if (error) throw error;
                (data || []).forEach(row => existingData.set(row.id, { sumario: row.sumario, tipo: row.tipo }));

                if (!data || data.length < PAGE_SIZE_DB) {
                    hasMoreDB = false;
                } else {
                    page++;
                }
            }

            // Ordenar por FECHA descendente (más recientes primero)
            // La fecha viene en formato DD/MM/YYYY
            matchedItems.sort((a, b) => {
                if (!a.sgacefecha || !b.sgacefecha) return 0;
                const [da, ma, ya] = a.sgacefecha.split('/').map(Number);
                const [db, mb, yb] = b.sgacefecha.split('/').map(Number);
                const dateA = new Date(ya, ma - 1, da);
                const dateB = new Date(yb, mb - 1, db);
                return dateB - dateA || (parseInt(b.sgacenumero.replace(/\./g, '')) - parseInt(a.sgacenumero.replace(/\./g, '')));
            });

            const newItems = matchedItems.filter(g => {
                const num = parseInt(g.sgacenumero.replace(/\./g, ''));
                if (isNaN(num)) return false;

                const summary = g.sgacedescripcion || g.sgacesumario || g.sgacedesc || g.sgacesum || '';
                const isExtra = isGacetaExtraordinaria(num, g.sgacenumero, g.sgacetipo || '', summary);
                const id = isExtra ? `gaceta-E${num}` : `gaceta-${num}`;

                if (existingData.has(id)) {
                    // En modo repair, procesamos si:
                    // 1. No tiene sumario o es un "placeholder" genérico
                    // 2. Está mal clasificada (ej: tiene punto pero no dice Extraordinaria)
                    if (IS_REPAIR) {
                        const existing = existingData.get(id);
                        const isPlaceholder = !existing.sumario ||
                            existing.sumario.length < 40 ||
                            existing.sumario.toLowerCase().includes('gaceta oficial n');

                        // Recalcular potencialmente extra para comparar (Rango < 30k)
                        const potentiallyExtra = num < 30000 || (num < 10000 && g.sgacenumero.includes('.'));

                        const isMisclassified = (potentiallyExtra && existing.tipo !== 'Extraordinaria') ||
                            (!potentiallyExtra && num > 30000 && existing.tipo === 'Extraordinaria');

                        return isPlaceholder || isMisclassified;
                    }
                    return false;
                }
                return true;
            });

            console.log(`   ✨ Nuevas para importar: ${newItems.length}`);

            if (newItems.length === 0) {
                console.log("   ✅ Todo está sincronizado.");
            } else {
                // Modo Automático: Procesar todos los registros encontrados
                const TOTAL_TO_PROCESS = (IS_FULL || IS_REPAIR) ? newItems.length : Math.min(newItems.length, MAX_WRITES);
                const toProcessAll = newItems.slice(0, TOTAL_TO_PROCESS);

                console.log(`   🚀 Iniciando procesamiento automático de ${toProcessAll.length} registros...`);

                let writesCount = 0;
                const chunkSize = 20; // Reducido un poco para mayor estabilidad con detalles individuales

                for (let i = 0; i < toProcessAll.length; i += chunkSize) {
                    const chunk = toProcessAll.slice(i, i + chunkSize);
                    await Promise.all(chunk.map(g => saveGaceta(g)));
                    writesCount += chunk.length;

                    const percent = ((writesCount / toProcessAll.length) * 100).toFixed(1);
                    console.log(`      📊 Progreso: ${writesCount} / ${toProcessAll.length} (${percent}%)`);

                    // Breve pausa táctica cada 100 registros para no saturar
                    if (writesCount % 100 === 0) {
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }
                console.log(`\n✅ Sincronización finalizada: ${writesCount} registros procesados.`);

                // 🔔 NOTIFICACIÓN PUSH
                // Solo notificar si: 
                // 1. Hay gacetas nuevas
                // 2. NO es modo backfill, full o repair (solo modo diario/manual reciente)
                if (writesCount > 0 && !IS_BACKFILL && !IS_FULL && !IS_REPAIR && !IS_EXTRA_ONLY) {
                    const PushNotifier = require('./pushNotifier');
                    const title = writesCount === 1 ? 'Nueva Gaceta Oficial' : 'Nuevas Gacetas Oficiales';
                    const body = writesCount === 1
                        ? `Se ha publicado la Gaceta N° ${toProcessAll[0].sgacenumero}`
                        : `Se han publicado ${writesCount} nuevas gacetas.`;

                    await PushNotifier.notifyAll(title, body, { type: 'gaceta', count: writesCount });
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

    // Intentar obtener el sumario de varias posibles llaves del TSJ
    let summary = g.sgacedescripcion || g.sgacesumario || g.sgacedesc || g.sgacesum || '';

    // Si no hay sumario en la lista, intentar pedir el detalle individual
    if (!summary && g.igaceid) {
        try {
            const urlDetail = 'http://www.tsj.gob.ve/gaceta-oficial';
            const detailRes = await fetchWithRetry(urlDetail, {
                params: {
                    p_p_id: 'receiverGacetaOficial_WAR_NoticiasTsjPorlet612',
                    p_p_lifecycle: '2',
                    p_p_state: 'normal',
                    p_p_mode: 'view',
                    p_p_cacheability: 'cacheLevelPage',
                    'server[endpoint]': '/services/WSGacetaOficial.HTTPEndpoint',
                    'server[method]': '/getGaceta',
                    'server[idGaceta]': g.igaceid
                },
                httpsAgent: agent,
                timeout: 5000
            });

            const detail = detailRes.data;
            summary = detail?.sgacedescripcion || detail?.sgacesumario || '';
            if (summary) {
                // console.log(`      ✅ Sumario recuperado del detalle para N° ${g.sgacenumero}`);
            }
        } catch (e) {
            // console.log(`      ⚠️ Error recuperando detalle para N° ${g.sgacenumero}: ${e.message}`);
        }
    }

    // Detección mejorada del tipo de Gaceta
    const isExtra = isGacetaExtraordinaria(num, g.sgacenumero, g.sgacetipo || '', summary);
    const type = isExtra ? 'Extraordinaria' : 'Ordinaria';

    const isExtraFinal = isGacetaExtraordinaria(num, g.sgacenumero, g.sgacetipo || '', summary);
    const finalId = isExtraFinal ? `gaceta-E${num}` : `gaceta-${num}`;

    const row = {
        id: finalId,
        numero: num,
        numero_display: g.sgacenumero,
        fecha: g.sgacefecha,
        ano: parseInt(year),
        mes: parseInt(month),
        dia: parseInt(day),
        timestamp: dateObj.toISOString(),
        url_original: url,
        titulo: summary ? `${summary.substring(0, 80)}...` : `Gaceta Oficial N° ${g.sgacenumero}`,
        subtitulo: `Publicado el ${g.sgacefecha}`,
        sumario: summary,
        tipo: type
    };

    try {
        const { error } = await supabase
            .from('gacetas')
            .upsert(row);

        if (error) throw error;
    } catch (e) {
        console.error(`      Error saving gaceta: ${e.message}`);
    }
}

function isGacetaExtraordinaria(num, displayNum, typeText, summary) {
    const text = (displayNum + ' ' + (typeText || '') + ' ' + (summary || '')).toLowerCase();

    // 1. Detección por texto explícito
    if (text.includes('extraordinaria')) return true;

    // 2. Detección por formato de número (ej: 6.809 con punto y bajo 10k)
    if (num < 10000 && displayNum.includes('.')) return true;

    // 3. Umbral de seguridad para números bajos (históricos extraordinarios)
    // Las ordinarias modernas son > 40k. Las extraordinarias modernas son < 7k.
    if (num < 30000 && !text.includes('ordinaria')) return true;

    return false;
}

getGacetas();
