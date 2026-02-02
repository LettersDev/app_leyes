require('dotenv').config();
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, deleteDoc, collection, getDocs, writeBatch } = require('firebase/firestore');

// --- CONFIGURACIÓN ---
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

async function deleteLaw(lawId) {
    if (!lawId) {
        console.error('❌ Debes especificar el ID de la ley a borrar.');
        console.log('Ejemplo: node scripts/delete_law.js lot');
        process.exit(1);
    }

    console.log(`🗑️  Iniciando borrado de ley: ${lawId}...`);

    try {
        // 1. Borrar subcolección 'items' (artículos) en lotes
        console.log('   ⏳ Borrando artículos...');
        const itemsRef = collection(db, 'laws', lawId, 'items');
        const snapshot = await getDocs(itemsRef);

        if (snapshot.size > 0) {
            const batch = writeBatch(db);
            let count = 0;

            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
                count++;
            });

            await batch.commit();
            console.log(`   ✅ ${count} artículos borrados.`);
        } else {
            console.log('   ℹ️  No se encontraron artículos.');
        }

        // 2. Borrar documento principal
        await deleteDoc(doc(db, 'laws', lawId));
        console.log(`✅ Ley '${lawId}' borrada exitosamente.`);

    } catch (error) {
        console.error('❌ Error al borrar:', error.message);
    }
}

const lawId = process.argv[2];
deleteLaw(lawId);
