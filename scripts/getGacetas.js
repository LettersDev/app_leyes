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
    console.log(`\n📜 Iniciando Scraper de Gacetas Oficiales (SmartSync)...`);

    // Limits
    const MAX_WRITES = IS_BACKFILL ? 600 : 500;

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

        // 1. Determine Target Years based on mode/args
        if (TARGET_YEAR) {
            targetYears = [TARGET_YEAR];
            console.log(`   📅 Modo: Manual | Año objetivo: ${TARGET_YEAR}`);
        } else if (IS_BACKFILL) {
            // Smart Backfill Progress
            const configRef = doc(db, 'sync_monitor', 'gacetas_sync');
            const configSnap = await getDoc(configRef);
            let lastHistoricalYearSynced = 1999;

            if (configSnap.exists()) {
                lastHistoricalYearSynced = configSnap.data().lastHistoricalYearSynced || 1999;
            }

            const nextYear = lastHistoricalYearSynced + 1;

            // Step 1: Always include Current Year and Previous Year for safety
            targetYears = [currentYear, currentYear - 1];

            // Step 2: Add one historical year if not yet complete
            if (nextYear < currentYear - 1) {
                targetYears.push(nextYear);
                console.log(`   🔄 Modo: SmartSync | Recientes + Año Histórico: ${nextYear}`);
            } else {
                console.log(`   ✨ Modo: SmartSync | Toda la historia (2000+) está sincronizada.`);
            }
        } else {
            // Default: Just recent
            targetYears = [currentYear, currentYear - 1];
            console.log(`   📅 Modo: Recientes (Hoy/Ayer)`);
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

            // 3. Filter and Deduplicate
            // We check only documents for the target years to be efficient
            console.log(`   💾 Verificando duplicados en DB para años: ${targetYears.join(', ')}...`);

            // Filter list by target years first
            const matchedItems = list.filter(g => {
                if (!g.sgacefecha) return false;
                const year = parseInt(g.sgacefecha.split('/')[2]);
                return targetYears.includes(year);
            });

            if (matchedItems.length === 0) {
                console.log("   ✅ No hay gacetas en el TSJ para los años seleccionados.");
                return;
            }

            // check each one in DB (chunked to avoid long await)
            const newItems = [];
            for (const g of matchedItems) {
                const num = parseInt(g.sgacenumero.replace(/\./g, ''));
                if (isNaN(num)) continue;
                const id = `gaceta-${num}`;

                // Note: We check if doc exists to avoid unnecessary writes
                const docRef = doc(db, 'gacetas', id);
                const docSnap = await getDoc(docRef);

                if (!docSnap.exists()) {
                    newItems.push(g);
                }
            }

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

            // 4. Update Progress if in backfill mode and we processed the year
            if (IS_BACKFILL && !TARGET_YEAR) {
                const configRef = doc(db, 'sync_monitor', 'gacetas_sync');
                const configSnap = await getDoc(configRef);
                const currentStored = configSnap.exists() ? configSnap.data().lastHistoricalYearSynced || 1999 : 1999;

                // If we were targeting currentStored + 1 and we successfully finished checking the list
                const nextYearToMark = currentStored + 1;
                if (nextYearToMark < currentYear - 1) {
                    await setDoc(configRef, {
                        lastHistoricalYearSynced: nextYearToMark,
                        lastUpdate: new Date().toISOString()
                    }, { merge: true });
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
