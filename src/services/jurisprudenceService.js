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

const JurisprudenceService = {
    /**
     * Búsqueda multi-estrategia:
     * 1. Número exacto de sentencia
     * 2. Expediente exacto
     * 3. FTS en español (stemming: plurales, conjugaciones, sin acentos)
     */
    searchSentences: async (searchText, filters = {}) => {
        const { selectedSala, selectedYear } = filters;
        const cacheKey = `${searchText}-${selectedSala || 'all'}-${selectedYear || 'all'}`;
        
        try {
            const cached = getCachedResult(cacheKey);
            if (cached) return cached;

            const results = [];
            const seenIds = new Set();

            const addResult = (row, matchType) => {
                if (!seenIds.has(row.id)) {
                    seenIds.add(row.id);
                    results.push({ ...row, type: 'jurisprudencia', matchType });
                }
            };

            const applyFilters = (query) => {
                let q = query;
                if (selectedSala === 'recent') {
                    const today = new Date();
                    const lastWeek = new Date();
                    lastWeek.setDate(today.getDate() - 7);
                    q = q.gte('fecha_corte', lastWeek.toISOString().split('T')[0]);
                } else if (selectedSala && selectedSala !== 'all') {
                    q = q.eq('sala', selectedSala);
                }
                if (selectedYear && selectedYear !== 'Todos') {
                    q = q.eq('ano', parseInt(selectedYear));
                }
                return q;
            };

            // 1. Búsqueda por número exacto
            if (!isNaN(searchText) && searchText.trim() !== '') {
                const [{ data: byInt }, { data: byStr }] = await Promise.all([
                    applyFilters(supabase.from(COLLECTION_NAME).select('*').eq('numero', parseInt(searchText))).limit(5),
                    applyFilters(supabase.from(COLLECTION_NAME).select('*').eq('numero', searchText.toString())).limit(5)
                ]);
                (byInt || []).forEach(r => addResult(r, 'N° Sentencia'));
                (byStr || []).forEach(r => addResult(r, 'N° Sentencia'));
            }

            // 2. Búsqueda por expediente exacto
            const { data: byExp } = await applyFilters(supabase
                .from(COLLECTION_NAME).select('*')
                .eq('expediente', searchText.toString())).limit(5);
            (byExp || []).forEach(r => addResult(r, 'Expediente'));

            // 3. FTS en español
            if (results.length < 10) {
                console.log(`[FTS] Buscando con filtros: "${searchText}"`);
                const { data: byFts, error: ftsErr } = await applyFilters(supabase
                    .from(COLLECTION_NAME)
                    .select('*')
                    .textSearch('fts', searchText, {
                        type: 'websearch',
                        config: 'spanish'
                    }))
                    .order('fecha_corte', { ascending: false })
                    .order('id', { ascending: false })
                    .limit(20);

                if (!ftsErr) {
                    (byFts || []).forEach(r => addResult(r, 'Contenido'));
                } else {
                    console.warn('[FTS] Error:', ftsErr.message);
                }
            }

            setCachedResult(cacheKey, results);
            return results;
        } catch (error) {
            if (error.message && error.message.toLowerCase().includes('network')) {
                throw new Error('OFFLINE_ERROR');
            }
            console.error('Error searching jurisprudence:', error);
            return [];
        }
    },

    getRecentSentences: async (limitCount = 10) => {
        try {
            const { data, error } = await supabase
                .from(COLLECTION_NAME)
                .select('*')
                .order('fecha_corte', { ascending: false })
                .order('id', { ascending: false })
                .limit(limitCount);

            if (error) throw error;
            return (data || []).map(row => ({ ...row, type: 'jurisprudencia' }));
        } catch (error) {
            if (error.message && error.message.toLowerCase().includes('network')) {
                throw new Error('OFFLINE_ERROR');
            }
            console.error('Error fetching recent jurisprudence:', error);
            return [];
        }
    },

    fetchSentences: async (filters = {}) => {
        const { selectedSala, selectedYear, lastFechaCorte, lastId, pageSize = 20 } = filters;
        try {
            let q = supabase.from(COLLECTION_NAME).select('*');

            if (selectedSala === 'recent') {
                // Última semana (Lógica basada en la FECHA ACTUAL real)
                const today = new Date();
                const lastWeek = new Date();
                lastWeek.setDate(today.getDate() - 7);

                // Formato YYYY-MM-DD para Supabase
                const fmtDate = lastWeek.toISOString().split('T')[0];
                q = q.gte('fecha_corte', fmtDate);
            } else if (selectedSala && selectedSala !== 'all') {
                q = q.eq('sala', selectedSala);
            }

            if (selectedYear && selectedYear !== 'Todos') {
                q = q.eq('ano', parseInt(selectedYear));
            }

            // Keyset pagination: Si hay cursor, pedir elementos anteriores
            if (lastFechaCorte && lastId) {
                q = q.or(`fecha_corte.lt.${lastFechaCorte},and(fecha_corte.eq.${lastFechaCorte},id.lt.${lastId})`);
            }

            q = q.order('fecha_corte', { ascending: false })
                .order('id', { ascending: false })
                .limit(pageSize);

            const { data, error } = await q;
            if (error) throw error;
            return data || [];
        } catch (error) {
            if (error.message && error.message.toLowerCase().includes('network')) {
                throw new Error('OFFLINE_ERROR');
            }
            console.error('Error fetching jurisprudence in service:', error);
            throw error;
        }
    }
};

export default JurisprudenceService;
