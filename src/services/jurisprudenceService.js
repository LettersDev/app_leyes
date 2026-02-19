import { supabase } from '../config/supabase';

const COLLECTION_NAME = 'jurisprudence';

// ──────────────────────────────────────────────
// Cache de búsquedas recientes (5 min TTL)
// ──────────────────────────────────────────────
const searchCache = new Map();
const CACHE_MAX_SIZE = 15;
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCachedResult(key) {
    const entry = searchCache.get(key);
    if (entry && (Date.now() - entry.timestamp) < CACHE_TTL_MS) {
        console.log(`[Cache HIT] jurisprudence: "${key}"`);
        return entry.data;
    }
    if (entry) searchCache.delete(key);
    return null;
}

function setCachedResult(key, data) {
    if (searchCache.size >= CACHE_MAX_SIZE) {
        // Eliminar el más antiguo
        const oldestKey = searchCache.keys().next().value;
        searchCache.delete(oldestKey);
    }
    searchCache.set(key, { data, timestamp: Date.now() });
}

export const JurisprudenceService = {
    /**
     * Búsqueda multi-estrategia:
     * 1. Número exacto de sentencia
     * 2. Expediente exacto
     * 3. FTS en español (stemming: plurales, conjugaciones, sin acentos)
     */
    searchSentences: async (searchText) => {
        try {
            const cached = getCachedResult(searchText);
            if (cached) return cached;

            const results = [];
            const seenIds = new Set();

            const addResult = (row, matchType) => {
                if (!seenIds.has(row.id)) {
                    seenIds.add(row.id);
                    results.push({ ...row, type: 'jurisprudencia', matchType });
                }
            };

            // 1. Búsqueda por número exacto
            if (!isNaN(searchText) && searchText.trim() !== '') {
                const [{ data: byInt }, { data: byStr }] = await Promise.all([
                    supabase.from(COLLECTION_NAME).select('*')
                        .eq('numero', parseInt(searchText)).limit(5),
                    supabase.from(COLLECTION_NAME).select('*')
                        .eq('numero', searchText.toString()).limit(5)
                ]);
                (byInt || []).forEach(r => addResult(r, 'N° Sentencia'));
                (byStr || []).forEach(r => addResult(r, 'N° Sentencia'));
            }

            // 2. Búsqueda por expediente exacto
            const { data: byExp } = await supabase
                .from(COLLECTION_NAME).select('*')
                .eq('expediente', searchText.toString()).limit(5);
            (byExp || []).forEach(r => addResult(r, 'Expediente'));

            // 3. FTS en español — PRINCIPAL: reemplaza el sistema de keywords
            // Usa websearch_to_tsquery: soporta "frases", -exclusiones, OR, etc.
            if (results.length < 10) {
                console.log(`[FTS] Buscando: "${searchText}"`);
                const { data: byFts, error: ftsErr } = await supabase
                    .from(COLLECTION_NAME)
                    .select('*')
                    .textSearch('fts', searchText, {
                        type: 'websearch',   // interpreta comillas, AND, OR, -
                        config: 'spanish'    // aplica stemming en español
                    })
                    .order('timestamp', { ascending: false })
                    .limit(20);

                if (!ftsErr) {
                    (byFts || []).forEach(r => addResult(r, 'Contenido'));
                } else {
                    console.warn('[FTS] Error:', ftsErr.message);
                }
            }

            setCachedResult(searchText, results);
            return results;
        } catch (error) {
            console.error('Error searching jurisprudence:', error);
            return [];
        }
    },

    getRecentSentences: async (limitCount = 10) => {
        try {
            const { data, error } = await supabase
                .from(COLLECTION_NAME)
                .select('*')
                .order('timestamp', { ascending: false })
                .limit(limitCount);

            if (error) throw error;
            return (data || []).map(row => ({ ...row, type: 'jurisprudencia' }));
        } catch (error) {
            console.error('Error fetching recent jurisprudence:', error);
            return [];
        }
    }
};

export default JurisprudenceService;
