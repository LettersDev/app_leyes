const axios = require('axios');
const https = require('https');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc } = require('firebase/firestore');
const { SALA_MAP } = require('./tsj_config');

// Configuración de Firebase para AppLeyes (Nuevo Proyecto: appley-3f0fb)
const firebaseConfig = {
    apiKey: "AIzaSyCgMdSE-aiAkyGIFYWzCHCGTfB_6n9vrkc",
    authDomain: "appley-3f0fb.firebaseapp.com",
    projectId: "appley-3f0fb",
    storageBucket: "appley-3f0fb.firebasestorage.app",
    messagingSenderId: "591288865686",
    appId: "1:591288865686:web:b7f16ebd3bd3edf90443b7"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Cliente Axios con soporte de sesiones persistentes
const agent = new https.Agent({ rejectUnauthorized: false });

async function getJurisprudence(options = {}) {
    const { mode = 'daily', year, roomIds = Object.keys(SALA_MAP) } = options;

    console.log(`\n⚖️ Iniciando Scraper de Jurisprudencia TSJ...`);
    console.log(`📅 Modo: ${mode}${year ? ` | Año: ${year}` : ''}`);

    // 1. Obtener Sesión (Cookies) para Liferay
    let cookies = [];
    let pAuth = '';
    try {
        const initRes = await axios.get('https://www.tsj.gob.ve/decisiones', {
            httpsAgent: agent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        cookies = initRes.headers['set-cookie'] || [];

        // 1.5 Extraer p_auth del HTML
        const pAuthMatch = initRes.data.match(/Liferay\.authToken\s*=\s*"([^"]+)"/);
        pAuth = pAuthMatch ? pAuthMatch[1] : '';

        console.log(`✅ Sesión OK (${cookies.length} cookies)`);
        console.log(`🔑 Liferay AuthToken: ${pAuth || 'No encontrado'}`);
    } catch (error) {
        console.error(`❌ Error iniciando sesión: ${error.message}`);
        return;
    }

    const cookieStr = cookies.join('; ');

    // 2. Procesar cada Sala
    for (const salaId of roomIds) {
        const salaInfo = SALA_MAP[salaId];
        console.log(`\n🏛️ Procesando: ${salaInfo.name}...`);

        try {
            // Si es modo histórico, necesitamos obtener la lista de días con sentencias para ese año
            if (mode === 'historical' && year) {
                await syncHistoricalYear(salaId, year, cookieStr);
            } else {
                // Modo diario: por simplicidad hoy, buscaremos la fecha de hoy
                const today = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                await syncDay(salaId, today, cookieStr);
            }
        } catch (error) {
            console.error(`   ❌ Error en sala ${salaInfo.short}: ${error.message}`);
        }
    }
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

async function saveToFirestore(s, salaId) {
    const salaInfo = SALA_MAP[salaId];
    const expId = s.SSENTEXPEDIENTE.replace(/\//g, '-'); // Limpiar slash para Firestore ID

    // Crear el objeto ligero
    const metadata = {
        expediente: s.SSENTEXPEDIENTE,
        numero: s.SSENTNUMERO,
        sala: salaInfo.name,
        ponente: s.SPONENOMBRE,
        fecha: s.DSENTFECHA, // Formato DD/MM/YYYY
        titulo: `Sentencia N° ${s.SSENTNUMERO}`,
        procedimiento: s.SPROCDESCRIPCION,
        partes: s.SSENTPARTES || 'N/A',
        resumen: s.SSENTDECISION || '',
        url_original: `http://historico.tsj.gob.ve/decisiones/${s.SSALADIR}/${s.NOMBREMES?.trim()}/${s.SSENTNOMBREDOC}`,
        timestamp: new Date().toISOString()
    };

    try {
        const docRef = doc(db, 'jurisprudence', expId);
        await setDoc(docRef, metadata, { merge: true });
        console.log(`      ✅ Guardada Exp: ${s.SSENTEXPEDIENTE}`);
    } catch (e) {
        console.error(`      ⚠️ Error al guardar ${s.SSENTEXPEDIENTE}: ${e.message}`);
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
const myArgs = process.argv.slice(2);
const mode = myArgs[0] || 'daily';
const year = myArgs[1] || '2024';

getJurisprudence({ mode, year });
