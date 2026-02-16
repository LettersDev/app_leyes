import { collection, getDocs, query, where, orderBy, limit, startAt, endAt } from 'firebase/firestore';
import { db } from '../config/firebase';

const COLLECTION_NAME = 'jurisprudence';

// Cache de búsquedas recientes para evitar lecturas repetidas
const searchCache = new Map();
const CACHE_MAX_SIZE = 10;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

function getCachedResult(key) {
    const entry = searchCache.get(key);
    if (entry && (Date.now() - entry.timestamp) < CACHE_TTL_MS) {
        console.log(`[Cache HIT] jurisprudence search: "${key}"`);
        return entry.data;
    }
    if (entry) searchCache.delete(key); // Expirado
    return null;
}

function setCachedResult(key, data) {
    // Evitar que el cache crezca sin límite
    if (searchCache.size >= CACHE_MAX_SIZE) {
        const oldestKey = searchCache.keys().next().value;
        searchCache.delete(oldestKey);
    }
    searchCache.set(key, { data, timestamp: Date.now() });
}

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
            // Verificar cache primero (0 lecturas Firebase)
            const cached = getCachedResult(searchText);
            if (cached) return cached;

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
            // 3. Fallback: Búsqueda por Palabras Clave (Indexed Search)
            if (results.length < 5) {
                console.log(`Searching jurisprudence by keywords: ${searchText}`);

                const normSearch = searchText.toLowerCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9\s]/g, "");

                const searchTerms = normSearch.split(/\s+/).filter(t => t.length > 2);

                if (searchTerms.length > 0) {
                    const mainTerm = searchTerms[0];

                    // Traemos hasta 30 candidatos que tengan AL MENOS la primera palabra
                    // Traemos hasta 30 candidatos que tengan AL MENOS la primera palabra
                    const qKeywords = query(
                        colRef,
                        where('keywords', 'array-contains', mainTerm),
                        orderBy('timestamp', 'desc'),
                        limit(30)
                    );

                    const snapKeywords = await getDocs(qKeywords);

                    snapKeywords.forEach(doc => {
                        if (results.find(r => r.id === doc.id)) return;
                        const data = doc.data();

                        // FILTRADO CLIENT-SIDE: Verificar que tenga TODOS los términos restantes
                        const allTermsMatch = searchTerms.every(term => {
                            return data.keywords && data.keywords.includes(term);
                        });

                        if (allTermsMatch) {
                            results.push({ id: doc.id, ...data, type: 'jurisprudencia', matchType: 'Contenido' });
                        }
                    });
                }
            }
            // Guardar en cache antes de retornar
            setCachedResult(searchText, results);
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
