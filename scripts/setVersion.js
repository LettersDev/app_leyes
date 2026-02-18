/**
 * setVersion.js
 * Script para actualizar la versión de la app en Firestore manualmente.
 * 
 * Uso: node scripts/setVersion.js 1.1.1
 */
require('dotenv').config();
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, updateDoc } = require('firebase/firestore');

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

async function setVersion(newVersion) {
    if (!newVersion) {
        console.log('❌ Error: Debes proporcionar una versión. Ej: node scripts/setVersion.js 1.1.1');
        return;
    }

    console.log(`🚀 Actualizando latestAppVersion a: ${newVersion}...`);

    try {
        const metaRef = doc(db, 'system', 'metadata');
        await updateDoc(metaRef, {
            latestAppVersion: newVersion,
            updatedAt: new Date().toISOString()
        });

        console.log('✅ Versión actualizada exitosamente en Firestore.');
        console.log('📡 Los usuarios verán el aviso de actualización al abrir la app.');
    } catch (error) {
        console.error('❌ Error al actualizar:', error.message);
    }
}

const version = process.argv[2];
setVersion(version);
