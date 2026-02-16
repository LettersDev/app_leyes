/**
 * initMetadata.js
 * Script de una sola vez para inicializar el documento system/metadata en Firestore.
 * Esto permite que la app use el check optimizado de 1 lectura.
 * 
 * Uso: node scripts/initMetadata.js
 */
require('dotenv').config();
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, collection, getDocs } = require('firebase/firestore');

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

async function init() {
    console.log('🔧 Inicializando documento system/metadata...\n');

    // Contar leyes actuales
    const lawsSnap = await getDocs(collection(db, 'laws'));
    const lawCount = lawsSnap.size;
    console.log(`   📊 Leyes encontradas en Firestore: ${lawCount}`);

    const metaRef = doc(db, 'system', 'metadata');
    await setDoc(metaRef, {
        lawsLastUpdated: new Date().toISOString(),
        lawsCount: lawCount,
        lastUploadCount: 0,
        schemaVersion: 'v4_cleaned_text',
        createdAt: new Date().toISOString()
    });

    console.log(`   ✅ Documento system/metadata creado exitosamente.`);
    console.log(`   📡 A partir de ahora, la app solo leerá 1 documento para verificar actualizaciones.\n`);
}

init().catch(err => {
    console.error('❌ Error:', err.message);
});
