import { collection, getDocs, query, where, orderBy, limit, startAt, endAt } from 'firebase/firestore';
import { db } from '../config/firebase';

const COLLECTION_NAME = 'jurisprudence';

export const JurisprudenceService = {
    /**
     * Buscar sentencias en Firestore
     * Soporta búsqueda por:
     * 1. Número de sentencia (Exacto)
     * 2. Texto en título (Prefijo) - Limitado por Firestore
     * 3. Texto en contenido (No soportado nativamente, requiere solución externa o descarga parcial)
     */
    searchSentences: async (searchText) => {
        try {
            const results = [];
            const colRef = collection(db, COLLECTION_NAME);

            // 1. Si es un número, buscar por número exacto
            if (!isNaN(searchText)) {
                console.log(`Searching jurisprudence by number: ${searchText}`);
                // 1. Número exacto (Int y String)
                const qNum = query(colRef, where('numero', '==', parseInt(searchText)), limit(5));
                const qNumStr = query(colRef, where('numero', '==', searchText.toString()), limit(5));

                const [snapNum, snapNumStr] = await Promise.all([getDocs(qNum), getDocs(qNumStr)]);

                snapNum.forEach(doc => results.push({ id: doc.id, ...doc.data(), type: 'jurisprudencia', matchType: 'N° Sentencia' }));
                snapNumStr.forEach(doc => {
                    if (!results.find(r => r.id === doc.id)) {
                        results.push({ id: doc.id, ...doc.data(), type: 'jurisprudencia', matchType: 'N° Sentencia' });
                    }
                });
            }

            // 2. Búsqueda por Expediente (Siempre intentamos match exacto)
            const qExp = query(colRef, where('expediente', '==', searchText.toString()), limit(5));
            const snapExp = await getDocs(qExp);

            snapExp.forEach(doc => {
                if (!results.find(r => r.id === doc.id)) {
                    results.push({ id: doc.id, ...doc.data(), type: 'jurisprudencia', matchType: 'Expediente' });
                }
            });

            // 3. Si no es numérico puro, o si queremos fallback de texto:
            if (results.length < 5) {
                // ... (Logic for text search)
                // 2. Búsqueda por texto (Título/Contenido)
                // Firestore no soporta "contains" nativo.
                // Simulamos un "búsqueda por sala" o traemos los últimos y filtramos en cliente (costoso pero funcional para mvp)

                console.log(`Searching jurisprudence by text (client-side filter of recent): ${searchText}`);

                // ESTRATEGIA MVP: Traer las últimas 50 sentencias y filtrar localmente
                // Esto es temporal hasta tener Algolia o un índice mejor.
                const qRecent = query(colRef, orderBy('timestamp', 'desc'), limit(50));
                const snapshot = await getDocs(qRecent);

                const normSearch = searchText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                snapshot.forEach(doc => {
                    const data = doc.data();
                    const title = (data.titulo || '').toLowerCase();
                    const resume = (data.resumen || '').toLowerCase();
                    const content = (data.texto || '').toLowerCase(); // Si decidimos guardar texto full

                    if (title.includes(normSearch) || resume.includes(normSearch) || content.includes(normSearch)) {
                        results.push({ id: doc.id, ...data, type: 'jurisprudencia' });
                    }
                });
            }

            return results;
        } catch (error) {
            console.error("Error searching jurisprudence:", error);
            return [];
        }
    },

    getRecentSentences: async (limitCount = 10) => {
        try {
            const colRef = collection(db, COLLECTION_NAME);
            const q = query(colRef, orderBy('timestamp', 'desc'), limit(limitCount));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'jurisprudencia' }));
        } catch (error) {
            console.error("Error fetching recent jurisprudence:", error);
            return [];
        }
    }
};

export default JurisprudenceService;
