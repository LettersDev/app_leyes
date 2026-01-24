const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc, doc } = require('firebase/firestore');

// Configuración de Firebase (Extraída de tu getJurisprudence.js)
const firebaseConfig = {
    apiKey: "AIzaSyCgMdSE-aiAkyGIFYWzCHCGTfB_6n9vrkc",
    authDomain: "appley-3f0fb.firebaseapp.com",
    projectId: "appley-3f0fb",
    storageBucket: "appley-3f0fb.firebasestorage.app",
    messagingSenderId: "591288865686",
    appId: "1:591288865686:web:b7f16ebd3bd3edf90443b7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cleanJurisprudence() {
    console.log("🧹 Iniciando limpieza de la colección 'jurisprudence'...");

    try {
        const querySnapshot = await getDocs(collection(db, "jurisprudence"));
        const total = querySnapshot.size;
        console.log(`📂 Encontrados ${total} documentos.`);

        let deletedCount = 0;
        for (const document of querySnapshot.docs) {
            const id = document.id;

            // Detectar IDs viejos (generalmente contienen números de expediente con dashes pero sin código de sala)
            // Los IDs nuevos tienen el formato: sala-número (ej: scon-123)
            const isNewId = /^(scon|spa|selec|scc|scp|scs|splena)-/.test(id);

            if (!isNewId) {
                await deleteDoc(doc(db, "jurisprudence", id));
                deletedCount++;
                if (deletedCount % 10 === 0) {
                    console.log(`   ♻️ Borrados ${deletedCount}/${total}...`);
                }
            }
        }

        console.log(`\n✅ ¡Limpieza completada!`);
        console.log(`🗑️ Se eliminaron ${deletedCount} registros antiguos.`);
        console.log(`✨ Se mantuvieron los registros con el nuevo formato.`);

    } catch (error) {
        console.error("❌ Error durante la limpieza:", error.message);
    }
}

cleanJurisprudence();
