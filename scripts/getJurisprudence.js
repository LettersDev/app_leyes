require('dotenv').config();
const axios = require('axios');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const { SALA_MAP } = require('./tsj_config');

// Configuración Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Cliente Axios con soporte de sesiones persistentes
const agent = new https.Agent({ rejectUnauthorized: false });

// Helper para reintentos
async function fetchWithRetry(url, options = {}, retries = 3, backoff = 2000) {
    try {
        if (!options.headers) options.headers = {};
        options.headers['Accept-Encoding'] = 'identity';
        return await axios.get(url, options);
    } catch (err) {
        const isNetworkError = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.response?.status >= 500 || err.response?.status === 404;
        if (retries > 0 && isNetworkError) {
            console.log(`      ⚠️ Error temporal (${err.message}). Reintentando en ${backoff / 1000}s... (${retries} restantes)`);
            await new Promise(r => setTimeout(r, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 1.5);
        }
        throw err;
    }
}

async function getJurisprudence(options = {}) {
    const { mode = 'daily', year, roomIds = Object.keys(SALA_MAP) } = options;

    console.log(`\n⚖️ Iniciando Scraper de Jurisprudencia TSJ...`);

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
        return;
    }

    if (mode === 'auto') {
        await runAutoSync(roomIds);
        return;
    }

    if (mode === 'repair_auto') {
        await runRepairAuto(roomIds);
        return;
    }

    console.log(`📅 Modo: ${mode}${year ? ` | Año: ${year}` : ''}`);
    const cookieStr = await getSessionCookies();
    if (!cookieStr) return;

    await executeSync(mode, year, roomIds, cookieStr);
}

async function runRepairAuto(roomIds) {
    console.log(`\n🚑 Iniciando Modo Reparación Automática (Backfill 2000 -> Futuro)`);

    let yearToRepair = 2000;
    try {
        const { data } = await supabase
            .from('sync_monitor')
            .select('data')
            .eq('id', 'repair_status')
            .maybeSingle();

        if (data) {
            yearToRepair = data.data?.nextYearToRepair || 2000;
        }
    } catch (e) {
        console.log("⚠️ No se pudo leer estado de reparación, iniciando en 2000.");
    }

    const currentYear = new Date().getFullYear();
    if (yearToRepair > currentYear) {
        console.log(`✅ Reparación completada hasta el presente.`);
        return;
    }

    console.log(`⏳ Reparando año: ${yearToRepair}...`);
    const cookieStr = await getSessionCookies();
    if (cookieStr) {
        const success = await executeSync('historical', yearToRepair, roomIds, cookieStr);

        if (success) {
            await supabase
                .from('sync_monitor')
                .upsert({
                    id: 'repair_status',
                    data: { nextYearToRepair: yearToRepair + 1, lastRun: new Date().toISOString() },
                    updated_at: new Date().toISOString()
                });
            console.log(`✅ Año ${yearToRepair} reparado exitosamente. Próxima ejecución será: ${yearToRepair + 1}`);
        } else {
            console.error(`❌ Año ${yearToRepair} con errores. NO se avanzará al siguiente año para reintentar.`);
        }
    }
}

async function getSessionCookies() {
    try {
        const initRes = await fetchWithRetry('https://www.tsj.gob.ve/decisiones', {
            httpsAgent: agent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const cookies = initRes.headers['set-cookie'] || [];
        console.log(`✅ Sesión OK (${cookies.length} cookies)`);
        return cookies.join('; ');
    } catch (error) {
        console.error(`❌ Error iniciando sesión: ${error.message}`);
        return null;
    }
}

async function executeSync(mode, year, roomIds, cookieStr) {
    let allSuccess = true;
    let currentCookies = cookieStr;

    for (const salaId of roomIds) {
        const salaInfo = SALA_MAP[salaId];
        console.log(`\n🏛️ Procesando: ${salaInfo.name}...`);

        let attempts = 0;
        let roomSuccess = false;

        while (attempts < 2 && !roomSuccess) {
            try {
                if (mode === 'historical' && year) {
                    await syncHistoricalYear(salaId, year, currentCookies);
                } else {
                    const today = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    await syncDay(salaId, today, currentCookies);
                }
                roomSuccess = true;
            } catch (error) {
                attempts++;
                console.error(`   ❌ Error en sala ${salaInfo.short} (Intento ${attempts}/2): ${error.message}`);

                if (attempts < 2) {
                    console.log(`   🔄 Refrescando sesión y reintentando sala...`);
                    await new Promise(r => setTimeout(r, 5000));
                    currentCookies = await getSessionCookies();
                    if (!currentCookies) break;
                } else {
                    allSuccess = false;
                }
            }
        }

        // Pequeño respiro entre salas para evitar bloqueos
        await new Promise(r => setTimeout(r, 1000));
    }
    return allSuccess;
}

async function executeSyncManualDate(fecha, roomIds, cookieStr) {
    for (const salaId of roomIds) {
        const salaInfo = SALA_MAP[salaId];
        try {
            await syncDay(salaId, fecha, cookieStr);
            await new Promise(r => setTimeout(r, 1000));
        } catch (error) {
            console.error(`   ❌ Error en sala ${salaInfo.short}: ${error.message}`);
        }
    }
}

async function runAutoSync(roomIds) {
    const currentYear = new Date().getFullYear();

    let lastYearSynced = 1999;
    try {
        const { data } = await supabase
            .from('sync_monitor')
            .select('data')
            .eq('id', 'historical_sync')
            .maybeSingle();

        if (data) {
            lastYearSynced = data.data?.lastYearSynced || 1999;
        }
    } catch (e) {
        console.log("⚠️ No se pudo leer el estado anterior, iniciando desde 2000.");
    }

    const nextYear = lastYearSynced + 1;
    let cookieStr = await getSessionCookies();
    if (!cookieStr) return;

    // 1. Siempre sincronizar ÚLTIMOS 2 DÍAS
    console.log(`\n🔄 [SmartSync] Paso 1: Sincronizando capturas recientes (${currentYear})`);

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const fmtToday = today.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const fmtYesterday = yesterday.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

    console.log(`   🔎 Verificando ayer (${fmtYesterday})...`);
    await executeSyncManualDate(fmtYesterday, roomIds, cookieStr);

    console.log(`   🔎 Verificando hoy (${fmtToday})...`);
    await executeSyncManualDate(fmtToday, roomIds, cookieStr);

    // 2. Si aún falta historia, avanzar un año por ejecución
    if (nextYear < currentYear) {
        console.log(`\n⏳ [SmartSync] Paso 2: Avanzando historia. Sincronizando año: ${nextYear}`);
        const success = await executeSync('historical', nextYear, roomIds, cookieStr);

        if (success) {
            await supabase
                .from('sync_monitor')
                .upsert({
                    id: 'historical_sync',
                    data: { lastYearSynced: nextYear, lastUpdate: new Date().toISOString() },
                    updated_at: new Date().toISOString()
                });
            console.log(`\n✅ [SmartSync] Año ${nextYear} completado y guardado en DB.`);
        } else {
            console.error(`\n⚠️ [SmartSync] El año ${nextYear} tuvo fallos. Se reintentará en la próxima ejecución.`);
        }
    } else {
        console.log(`\n✨ [SmartSync] Toda la historia está al día (hasta ${lastYearSynced}).`);
    }
}

async function syncDay(salaId, fecha, cookies) {
    const baseUrl = 'https://www.tsj.gob.ve/decisiones';

    const params = {
        p_p_id: 'displayListaDecision_WAR_NoticiasTsjPorlet612',
        p_p_lifecycle: '2',
        p_p_state: 'normal',
        p_p_mode: 'view',
        p_p_cacheability: 'cacheLevelPage',
        p_p_col_id: 'column-1',
        p_p_col_pos: '1',
        p_p_col_count: '2',
        'server[endpoint]': '/services/WSDecision.HTTPEndpoint',
        'server[method]': '/listDecisionByFechaSala',
        FECHA: fecha,
        SALA: salaId
    };

    console.log(`   🔍 Buscando sentencias para el ${fecha}...`);

    const response = await fetchWithRetry(baseUrl, {
        httpsAgent: agent,
        params: params,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cookie': cookies,
            'X-Requested-With': 'XMLHttpRequest'
        }
    });

    if (response.data && response.data.coleccion && response.data.coleccion.SENTENCIA) {
        let sentencias = Array.isArray(response.data.coleccion.SENTENCIA)
            ? response.data.coleccion.SENTENCIA
            : [response.data.coleccion.SENTENCIA];

        sentencias = sentencias.filter(s => s && s.SSENTNUMERO);
        console.log(`   ✨ Encontradas: ${sentencias.length}`);

        for (const s of sentencias) {
            await saveToDB(s, salaId);
            // Pequeño delay entre sentencias
            await new Promise(r => setTimeout(r, 200));
        }
    } else {
        console.log(`   📭 No hay sentencias publicadas este día.`);
    }
}

async function saveToDB(s, salaId) {
    const salaInfo = SALA_MAP[salaId];
    const year = s.DSENTFECHA ? s.DSENTFECHA.split('/')[2] : new Date().getFullYear();
    const sentId = `${salaInfo.code}-${year}-${s.SSENTNUMERO}`.toLowerCase().replace(/\s+/g, '');

    try {
        // Verificar si ya existe (evitar escrituras innecesarias)
        const { data: existing } = await supabase
            .from('jurisprudence')
            .select('id')
            .eq('id', sentId)
            .maybeSingle();

        if (existing) {
            return;
        }

        // Sin keywords manuales: PostgreSQL genera el tsvector (fts) automáticamente
        const row = {
            id: sentId,
            id_sentencia: sentId,
            ano: parseInt(year),
            expediente: s.SSENTEXPEDIENTE,
            numero: s.SSENTNUMERO,
            sala: salaInfo.name,
            ponente: s.SPONENOMBRE,
            fecha: s.DSENTFECHA,
            titulo: `Sentencia N° ${s.SSENTNUMERO}`,
            procedimiento: s.SPROCDESCRIPCION,
            partes: s.SSENTPARTES || 'N/A',
            resumen: s.SSENTDECISION || '',
            searchable_text: `${s.SSENTNUMERO} ${s.SSENTEXPEDIENTE} ${s.SSENTDECISION || ''}`.toLowerCase(),
            url_original: s.SSENTNOMBREDOC && s.SSENTNOMBREDOC !== 'null'
                ? `http://historico.tsj.gob.ve/decisiones/${s.SSALADIR}/${s.NOMBREMES?.trim()}/${s.SSENTNOMBREDOC}`
                : null,
            timestamp: new Date().toISOString()
        };

        const { error } = await supabase
            .from('jurisprudence')
            .upsert(row);

        if (error) throw error;
        console.log(`      ✅ Guardada: ${s.SSENTNUMERO} (${salaInfo.short})`);
    } catch (e) {
        console.error(`      ⚠️ Error al procesar sentencia ${s.SSENTNUMERO}: ${e.message}`);
    }
}

async function syncHistoricalYear(salaId, year, cookies) {
    const baseUrl = 'https://www.tsj.gob.ve/decisiones';
    console.log(`   📅 Sincronizando año histórico: ${year}`);

    const params = {
        p_p_id: 'displaySentencias_WAR_NoticiasTsjPorlet612',
        p_p_lifecycle: '2',
        p_p_state: 'normal',
        p_p_mode: 'view',
        p_p_cacheability: 'cacheLevelPage',
        p_p_col_id: '_118_INSTANCE_C808K7b2myu1__column-2',
        p_p_col_pos: '1',
        p_p_col_count: '2',
        'server[endpoint]': '/services/WSDecision.HTTPEndpoint',
        'server[method]': '/listDayByAnoSala',
        SALA: salaId,
        ANO: year
    };

    const response = await fetchWithRetry(baseUrl, {
        httpsAgent: agent,
        params: params,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cookie': cookies,
            'X-Requested-With': 'XMLHttpRequest'
        }
    });

    // Validar que la respuesta sea JSON y tenga la estructura esperada
    if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        throw new Error('Sessión expirada o bloqueada (recibido HTML en lugar de datos)');
    }

    if (response.data && response.data.coleccion && response.data.coleccion.DIA) {
        const dias = Array.isArray(response.data.coleccion.DIA) ? response.data.coleccion.DIA : [response.data.coleccion.DIA];
        const diasValidos = dias.filter(d => d && d.FECHA);
        console.log(`   📅 Encontrados ${diasValidos.length} días con actividad.`);

        for (const dia of diasValidos) {
            await syncDay(salaId, dia.FECHA, cookies);
            await new Promise(r => setTimeout(r, 1000));
        }
    } else {
        // Verificar si es un error silencioso de Liferay
        if (!response.data || !response.data.coleccion) {
            throw new Error(`Respuesta inválida o vacía del servidor para el año ${year}`);
        }
        console.log(`   📭 No se encontraron días con actividad para el año ${year}.`);
    }
}

// Interfaz CLI
const myArgs = process.argv.slice(2);
let mode = 'daily';
let year = new Date().getFullYear().toString();
let fromYear = 2000;
let toYear = new Date().getFullYear();

myArgs.forEach(arg => {
    if (arg.includes('=')) {
        const [key, value] = arg.split('=');
        if (key === 'mode') mode = value;
        if (key === 'year' || key === 'ano') year = value;
        if (key === 'from') fromYear = parseInt(value);
        if (key === 'to') toYear = parseInt(value);
    } else {
        if (['historical', 'recent', 'daily', 'auto', 'repair_auto', 'full', 'full_repair'].includes(arg)) {
            mode = arg;
        } else if (arg.match(/^\d{4}$/)) {
            year = arg;
        }
    }
});

// Modos extendidos para ejecución manual
async function runFullSync(roomIds, forceRepair = false, startY = 2000, endY = new Date().getFullYear()) {
    let cookieStr = await getSessionCookies();
    if (!cookieStr) return;

    for (let y = startY; y <= endY; y++) {
        console.log(`\n🚀 [FullSync] Iniciando año ${y}...`);

        // Refrescar sesión al inicio de cada año para evitar expiraciones largas
        cookieStr = await getSessionCookies();

        const success = await executeSync('historical', y.toString(), roomIds, cookieStr);

        if (!success) {
            console.error(`\n❌ Error crítico persistente en el año ${y}. Deteniendo para evitar saltos.`);
            process.exit(1);
        }

        if (!forceRepair) {
            await supabase
                .from('sync_monitor')
                .upsert({
                    id: 'historical_sync',
                    data: { lastYearSynced: y, lastUpdate: new Date().toISOString() },
                    updated_at: new Date().toISOString()
                });
        }

        // Espera de seguridad entre años
        console.log(`\n⏳ Esperando 10s para el siguiente año...`);
        await new Promise(r => setTimeout(r, 10000));
    }
}

const roomIds = Object.keys(SALA_MAP);

if (mode === 'full') {
    runFullSync(roomIds, false, fromYear, toYear).catch(console.error);
} else if (mode === 'full_repair') {
    runFullSync(roomIds, true, fromYear, toYear).catch(console.error);
} else {
    getJurisprudence({ mode, year, roomIds });
}

