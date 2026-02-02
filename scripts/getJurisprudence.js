require('dotenv').config();
const axios = require('axios');
const https = require('https');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc, getDoc } = require('firebase/firestore');
const { SALA_MAP } = require('./tsj_config');

// Configuración de Firebase para AppLeyes (Nuevo Proyecto: appley-3f0fb)
// Configuración de Firebase - Protegiendo con Variables de Entorno
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Cliente Axios con soporte de sesiones persistentes
const agent = new https.Agent({ rejectUnauthorized: false });

async function getJurisprudence(options = {}) {
    const { mode = 'daily', year, roomIds = Object.keys(SALA_MAP) } = options;

    console.log(`\n⚖️ Iniciando Scraper de Jurisprudencia TSJ...`);

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

// ... existing getSessionCookies ...

// ... existing executeSync ...

async function runRepairAuto(roomIds) {
    console.log(`\n🚑 Iniciando Modo Reparación Automática (Backfill 2000 -> Futuro)`);
    const configRef = doc(db, 'sync_monitor', 'repair_status');

    let yearToRepair = 2000;
    try {
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
            yearToRepair = configSnap.data().nextYearToRepair || 2000;
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
        await executeSync('historical', yearToRepair, roomIds, cookieStr);

        // Avanzar al siguiente año para mañana
        await setDoc(configRef, {
            nextYearToRepair: yearToRepair + 1,
            lastRun: new Date().toISOString()
        }, { merge: true });
        console.log(`✅ Año ${yearToRepair} reparado. Próxima ejecución será: ${yearToRepair + 1}`);
    }
}

async function getSessionCookies() {
    try {
        const initRes = await axios.get('https://www.tsj.gob.ve/decisiones', {
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
    for (const salaId of roomIds) {
        const salaInfo = SALA_MAP[salaId];
        console.log(`\n🏛️ Procesando: ${salaInfo.name}...`);
        try {
            if (mode === 'historical' && year) {
                await syncHistoricalYear(salaId, year, cookieStr);
            } else {
                const today = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                await syncDay(salaId, today, cookieStr);
            }
        } catch (error) {
            console.error(`   ❌ Error en sala ${salaInfo.short}: ${error.message}`);
        }
    }
}

async function executeSyncManualDate(fecha, roomIds, cookieStr) {
    for (const salaId of roomIds) {
        const salaInfo = SALA_MAP[salaId];
        try {
            await syncDay(salaId, fecha, cookieStr);
        } catch (error) {
            console.error(`   ❌ Error en sala ${salaInfo.short}: ${error.message}`);
        }
    }
}

async function runAutoSync(roomIds) {
    const currentYear = new Date().getFullYear();
    const configRef = doc(db, 'sync_monitor', 'historical_sync');

    let lastYearSynced = 1999;
    try {
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
            lastYearSynced = configSnap.data().lastYearSynced || 1999;
        }
    } catch (e) {
        console.log("⚠️ No se pudo leer el estado anterior, iniciando desde 2000.");
    }

    const nextYear = lastYearSynced + 1;
    const cookieStr = await getSessionCookies();
    if (!cookieStr) return;

    // 1. Siempre sincronizar ÚLTIMOS 2 DÍAS (Hoy y Ayer) para no perder nada
    console.log(`\n🔄 [SmartSync] Paso 1: Sincronizando capturas recientes (${currentYear})`);

    // Obtener fechas
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const fmtToday = today.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const fmtYesterday = yesterday.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

    console.log(`   🔎 Verificando ayer (${fmtYesterday})...`);
    await executeSyncManualDate(fmtYesterday, roomIds, cookieStr);

    console.log(`   🔎 Verificando hoy (${fmtToday})...`);
    await executeSyncManualDate(fmtToday, roomIds, cookieStr);

    // 2. El backfill histórico ahora lo maneja 'runRepairAuto' (Bot Reparador)
    // Así mantenemos este bot ligero para correr diariamente sin consumir cuota masiva.
    console.log(`\n✨ [SmartSync] Verificación diaria completada.`);
}

async function syncDay(salaId, fecha, cookies) {
    const baseUrl = 'https://www.tsj.gob.ve/decisiones';

    // Parámetros AJAX para obtener sentencias por fecha
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

    const response = await axios.get(baseUrl, {
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

        // Limpiar nulos (Liferay a veces devuelve [null] si no hay nada)
        sentencias = sentencias.filter(s => s && s.SSENTNUMERO);

        console.log(`   ✨ Encontradas: ${sentencias.length}`);

        for (const s of sentencias) {
            await saveToFirestore(s, salaId);
        }
    } else {
        console.log(`   📭 No hay sentencias publicadas este día.`);
    }
}

// Helper para generar palabras clave de búsqueda
function generateKeywords(text) {
    if (!text) return [];
    // Palabras comunes a ignorar (stopwords)
    const stopWords = new Set([
        'de', 'la', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no', 'una', 'su', 'al', 'es', 'lo', 'como',
        'mas', 'pero', 'sus', 'le', 'ya', 'o', 'fue', 'este', 'ha', 'si', 'porque', 'esta', 'son', 'entre', 'esta', 'cuando', 'muy', 'sin', 'sobre',
        'ser', 'tiene', 'tambien', 'me', 'hasta', 'hay', 'donde', 'han', 'quien', 'estan', 'estado', 'desde', 'todo', 'nos', 'durante', 'estados',
        'todos', 'uno', 'les', 'ni', 'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'e', 'esto', 'mi', 'antes', 'algunos', 'que', 'unos', 'yo',
        'otro', 'otras', 'otra', 'el', 'ella', 'le', 'te', 'sentencia', 'sala', 'tsj', 'republica', 'bolivariana', 'venezuela'
    ]);

    // Normalizar texto: minúsculas, sin acentos
    const normalized = text.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/[^a-z0-9\s]/g, ""); // Quitar caracteres especiales

    // Tokenizar y filtrar
    const tokens = normalized.split(/\s+/);
    const keywords = tokens.filter(t => t.length > 2 && !stopWords.has(t));

    // Eliminar duplicados
    return [...new Set(keywords)];
}

async function saveToFirestore(s, salaId) {
    const salaInfo = SALA_MAP[salaId];
    const year = s.DSENTFECHA ? s.DSENTFECHA.split('/')[2] : new Date().getFullYear();
    const sentId = `${salaInfo.code}-${year}-${s.SSENTNUMERO}`.toLowerCase().replace(/\s+/g, '');

    try {
        const docRef = doc(db, 'jurisprudence', sentId);
        const docSnap = await getDoc(docRef);

        // Optimización de Costos:
        // Si el documento ya existe Y ya tiene keywords, no escribir nada (Ahorra 1 Write)
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.keywords && data.keywords.length > 0) {
                console.log(`      ⏭️ Saltado (Ya indexado): ${s.SSENTNUMERO}`);
                return;
            }
        }

        // Preparar texto para keywords (Título + Resumen + Materia/Procedimiento)
        const textForKeywords = `${s.SSENTNUMERO} ${s.SSENTEXPEDIENTE} ${s.SSENTDECISION || ''} ${s.SPROCDESCRIPCION || ''} ${s.SSENTDECISION || ''}`;
        const keywords = generateKeywords(textForKeywords);

        // Añadir partes clave como expediente exacto y número
        if (s.SSENTNUMERO) keywords.push(s.SSENTNUMERO.toString());
        if (s.SSENTEXPEDIENTE) keywords.push(s.SSENTEXPEDIENTE.toLowerCase());

        // Crear el objeto de metadatos
        const metadata = {
            id_sentencia: sentId,
            ano: parseInt(year), // Guardar año Numérico para búsquedas
            expediente: s.SSENTEXPEDIENTE,
            numero: s.SSENTNUMERO,
            sala: salaInfo.name,
            ponente: s.SPONENOMBRE,
            fecha: s.DSENTFECHA, // Formato DD/MM/YYYY
            titulo: `Sentencia N° ${s.SSENTNUMERO}`,
            procedimiento: s.SPROCDESCRIPCION,
            partes: s.SSENTPARTES || 'N/A',
            resumen: s.SSENTDECISION || '',
            // Guardamos keywords para búsqueda eficiente: where('keywords', 'array-contains', 'termino')
            keywords: keywords.slice(0, 50), // Límite de seguridad
            searchable_text: `${s.SSENTNUMERO} ${s.SSENTEXPEDIENTE} ${s.SSENTDECISION || ''}`.toLowerCase(),
            url_original: `http://historico.tsj.gob.ve/decisiones/${s.SSALADIR}/${s.NOMBREMES?.trim()}/${s.SSENTNOMBREDOC}`,
            timestamp: new Date().toISOString()
        };

        // Si existe, hacemos merge para actualizar keywords. Si no, crea nuevo.
        await setDoc(docRef, metadata, { merge: true });
        console.log(`      ✅ Guardada/Actualizada: ${s.SSENTNUMERO} (${salaInfo.short})`);
    } catch (e) {
        console.error(`      ⚠️ Error al procesar sentencia ${s.SSENTNUMERO}: ${e.message}`);
    }
}

async function syncHistoricalYear(salaId, year, cookies) {
    // 1. Obtener lista de meses/días con sentencias para ese año
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

    const response = await axios.get(baseUrl, {
        httpsAgent: agent,
        params: params,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cookie': cookies,
            'X-Requested-With': 'XMLHttpRequest'
        }
    });

    if (response.data && response.data.coleccion && response.data.coleccion.DIA) {
        const dias = Array.isArray(response.data.coleccion.DIA) ? response.data.coleccion.DIA : [response.data.coleccion.DIA];
        // Filtrar dias nulos
        const diasValidos = dias.filter(d => d && d.FECHA);
        console.log(`   📅 Encontrados ${diasValidos.length} días con actividad.`);

        for (const dia of diasValidos) {
            await syncDay(salaId, dia.FECHA, cookies);
        }
    } else {
        console.log(`   📭 No se encontraron días con actividad para el año ${year}.`);
        console.log(`      Respuesta: ${JSON.stringify(response.data).substring(0, 200)}`);
    }
}

// Interfaz de CLI simple
// Interfaz de CLI simple y robusta
const myArgs = process.argv.slice(2);
let mode = 'daily';
let year = new Date().getFullYear().toString();

// Parsear argumentos (soportando "historical 2008" y "mode=historical year=2008")
myArgs.forEach(arg => {
    if (arg.includes('=')) {
        const [key, value] = arg.split('=');
        if (key === 'mode') mode = value;
        if (key === 'year' || key === 'ano') year = value;
    } else {
        // Asumir posicionales si no hay =
        if (arg === 'historical' || arg === 'recent' || arg === 'daily' || arg === 'auto') {
            mode = arg;
        } else if (arg.match(/^\d{4}$/)) {
            year = arg;
        }
    }
});

// Corrección para cuando se pasa "mode=historical 2008" (mezcla)
if (myArgs.length >= 2 && !myArgs[1].includes('=')) {
    if (myArgs[0].includes('mode=')) {
        // El segundo argumento es probablemente el año si es numérico
        if (myArgs[1].match(/^\d{4}$/)) year = myArgs[1];
    }
}

getJurisprudence({ mode, year });
