/**
 * SEED DATABASE RESILIENT (WEB SDK VERSION)
 * -----------------------------------------
 * Este script utiliza el SDK de Web en lugar del SDK de Admin.
 * Razón: El SDK de Admin usa gRPC (puerto 443) que a veces es bloqueado por 
 * proveedores de internet o firewalls, causando que las escrituras se queden colgadas.
 * El SDK de Web usa REST/WebSockets, que son mucho más compatibles.
 */

const { initializeApp } = require('firebase/app');
const {
    getFirestore,
    collection,
    doc,
    getDoc,
    setDoc,
    writeBatch,
    serverTimestamp
} = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

// --- CONFIGURACIÓN ---
const firebaseConfig = {
    apiKey: "AIzaSyCgMdSE-aiAkyGIFYWzCHCGTfB_6n9vrkc",
    authDomain: "appley-3f0fb.firebaseapp.com",
    projectId: "appley-3f0fb",
    storageBucket: "appley-3f0fb.firebasestorage.app",
    messagingSenderId: "591288865686",
    appId: "1:591288865686:web:b7f16ebd3bd3edf90443b7"
};

const BATCH_SIZE = 400; // Un poco menos de 500 para seguridad
const DELAY_MS = 200;
const SCHEMA_VERSION = "v3_structured_headers"; // Forzar recarga con cabeceras estructuradas

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- UTILIDADES ---

function getLawHash(law) {
    // Generar un hash simple basado en título, conteo de artículos, fecha y versión del esquema
    const articleCount = law.content?.articles?.length || 0;
    return `${law.title}_${articleCount}_${law.date}_${SCHEMA_VERSION}`;
}

async function lawExistsAndIsSame(category, newHash) {
    try {
        const docRef = doc(db, 'laws', category);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const existingHash = docSnap.data().hash;
            return existingHash === newHash;
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

    // 1. Guardar Metadatos de la Ley
    console.log(`   ⏳ Guardando metadatos...`);
    const lawRef = doc(db, 'laws', category);
    await setDoc(lawRef, {
        ...metadata,
        itemCount: articles.length,
        isLargeLaw: articles.length > 500,
        lastUpdated: serverTimestamp(),
        hash: hash
    });

    // 2. Guardar Artículos en Subcolección (por lotes)
    const itemsRef = collection(db, 'laws', category, 'items');
    const totalBatches = Math.ceil(articles.length / BATCH_SIZE);

    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const currentBatch = articles.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

        currentBatch.forEach((item, j) => {
            const index = i + j; // Índice global en la ley
            const itemId = item.type === 'header' ? `header_${index}` : `art_${item.number || index}`;
            const itemDocRef = doc(itemsRef, itemId);

            batch.set(itemDocRef, {
                ...item,
                index: index,
                lawCategory: category,
                lastUpdated: serverTimestamp()
            });
        });

        console.log(`   ⏳ Subiendo lote ${batchNumber}/${totalBatches} (${currentBatch.length} items)...`);
        await batch.commit();

        if (i + BATCH_SIZE < articles.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }

    console.log(`   ✅ ¡Ley completada!`);
}

async function run() {
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║   CARGA RESILIENTE DE LEYES (WEB)     ║');
    console.log('╚═══════════════════════════════════════╝\n');

    const startTime = Date.now();
    const dataDir = path.join(__dirname, '../data');

    // Leer todos los archivos *_full.json
    const files = fs.readdirSync(dataDir)
        .filter(f => f.endsWith('_full.json'))
        .map(f => path.join(dataDir, f));

    console.log(`📁 Encontrados ${files.length} archivos de leyes\n`);

    let uploadedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
        const fileName = path.basename(file);
        console.log(`\n─────────────────────────────────────`);
        console.log(`📄 Procesando: ${fileName}`);

        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            for (const lawData of data) {
                const newHash = getLawHash(lawData);
                const isSame = await lawExistsAndIsSame(lawData.category, newHash);

                if (isSame) {
                    console.log(`⏭️  ${lawData.title} - Ya existe (sin cambios)`);
                    skippedCount++;
                } else {
                    await uploadLaw(lawData);
                    uploadedCount++;
                }
            }
        } catch (error) {
            console.error(`❌ Error en archivo ${fileName}: ${error.message}`);
        }
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
    if (err.message.includes('permission-denied')) {
        console.log('\n💡 TIP: Revisa las Reglas de Seguridad en la Consola de Firebase.');
        console.log('Deben permitir escritura: "allow read, write: if true;"');
    }
});
