require('dotenv').config();
const axios = require('axios');
const https = require('https');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc, getDoc, getDocs } = require('firebase/firestore');

// Configuración de Firebase
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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

// Backfill Mode
const backfillArg = args.find(arg => arg.startsWith('--mode=backfill'));
const IS_BACKFILL = !!backfillArg;

async function getGacetas() {
    console.log(`\n📜 Iniciando Scraper de Gacetas Oficiales (Modo Seguro)...`);
    if (TARGET_YEAR) console.log(`   📅 Filtrando por año: ${TARGET_YEAR}`);
    if (IS_BACKFILL) console.log(`   🔄 Modo Backfill Inteligente: Buscando años incompletos desde 2000...`);

    // Limits
    const MAX_WRITES = IS_BACKFILL ? 600 : 500; // Slightly higher for backfill (2 years * ~250 = 500)
    let writesCount = 0;

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
        // 1. Fetch Existing IDs and Calculate Counts per Year
        console.log("   💾 Verificando base de datos existente...");
        const snapshot = await getDocs(collection(db, 'gacetas'));
        const existingIds = new Set(snapshot.docs.map(d => d.id));

        // Calculate counts per year in DB
        const dbCounts = {};
        snapshot.docs.forEach(d => {
            const data = d.data();
            if (data.ano) {
                dbCounts[data.ano] = (dbCounts[data.ano] || 0) + 1;
            }
        });
        console.log(`   📊 Registros existentes en DB: ${existingIds.size}`);

        // Determine Start Years for Backfill
        let targetYears = [];
        if (IS_BACKFILL) {
            let found = 0;
            // Scan from 2000 to current year
            const currentYear = new Date().getFullYear();
            for (let y = 2000; y <= currentYear; y++) {
                const count = dbCounts[y] || 0;
                // Threshold: If year has < 150 gacetas, assume incomplete (since avg is ~250)
                // 2026 is exception
                if (count < 150 && y < currentYear) {
                    targetYears.push(y);
                    found++;
                    if (found >= 2) break; // Process max 2 years per run
                }
            }

            if (targetYears.length === 0) {
                console.log("   ✅ Todos los años históricos (2000-2025) parecen completos.");
                console.log("   Buscaremos novedades del año actual.");
                targetYears.push(currentYear);
            } else {
                console.log(`   🎯 Años seleccionados para backfill: ${targetYears.join(', ')}`);
            }
        }


        // 2. Fetch Remote List
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

            // 3. Filter New Items
            const newItems = list.filter(g => {
                // Parse date for year filter
                const [day, month, year] = g.sgacefecha.split('/');
                const gYear = parseInt(year);

                if (TARGET_YEAR && gYear !== TARGET_YEAR) return false;
                if (IS_BACKFILL && !targetYears.includes(gYear)) return false;

                const num = parseInt(g.sgacenumero.replace(/\./g, ''));
                if (isNaN(num)) return false;
                const id = `gaceta-${num}`;
                return !existingIds.has(id);
            });

            console.log(`   ✨ Nuevas para importar: ${newItems.length}`);

            if (newItems.length === 0) {
                console.log("   ✅ Todo está sincronizado. No se requieren escrituras.");
                return;
            }

            // 4. Sort by date desc (to prioritize recent) or asc?
            // Let's verify we process new ones.
            // Usually we want the *newest* if we are limited.
            // But if it's a backfill, maybe chunks?
            // Let's just process the first N of the filtered list.

            const toProcess = newItems.slice(0, MAX_WRITES);
            console.log(`   🚀 Procesando ${toProcess.length} registros (Límite diario: ${MAX_WRITES})...`);

            const chunkSize = 50;
            for (let i = 0; i < toProcess.length; i += chunkSize) {
                const chunk = toProcess.slice(i, i + chunkSize);
                await Promise.all(chunk.map(g => saveGaceta(g)));
                writesCount += chunk.length;
                console.log(`      Sincronizados: ${writesCount} / ${toProcess.length}`);
            }

            if (newItems.length > MAX_WRITES) {
                console.log(`\n⚠️ Se alcanzó el límite de escritura. Faltan ${newItems.length - MAX_WRITES} gacetas.`);
                console.log(`   Ejecuta el script nuevamente mañana.`);
            } else {
                console.log(`\n✨ Sincronización completa.`);
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

    const num = parseInt(g.sgacenumero.replace(/\./g, '')); // Remove dots just in case
    if (isNaN(num)) return;

    const id = `gaceta-${num}`;
    const docRef = doc(db, 'gacetas', id);

    // Construct URL logic from analysis
    let folder = 'gaceta_ext';
    if (num > 30000) folder = 'gaceta';

    // Clean params for URL
    const url = `http://historico.tsj.gob.ve/${folder}/blanco.asp?nrogaceta=${g.sgacenumero}`;

    // Parse Date for sorting/filtering
    // sgacefecha format: DD/MM/YYYY
    const [day, month, year] = g.sgacefecha.split('/');
    const dateObj = new Date(`${year}-${month}-${day}`);

    const metadata = {
        id: id,
        numero: num, // Integer for sorting
        numero_display: g.sgacenumero,
        fecha: g.sgacefecha,
        ano: parseInt(year),
        mes: parseInt(month),
        dia: parseInt(day),
        timestamp: dateObj.toISOString(),
        url_original: url,
        titulo: `Gaceta Oficial N° ${g.sgacenumero}`,
        subtitulo: `Publicado el ${g.sgacefecha}`,
        tipo: num > 30000 ? 'Ordinaria' : 'Extraordinaria/Antigua' // Heuristic
    };

    try {
        await setDoc(docRef, metadata, { merge: true });
        // console.log(`      Saved: ${id}`); // Verbose
    } catch (e) {
        console.error(`      Error saving ${id}: ${e.message}`);
    }
}

getGacetas();
