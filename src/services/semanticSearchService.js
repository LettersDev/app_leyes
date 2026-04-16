/**
 * semanticSearchService.js
 *
 * Búsqueda semántica (vectorial) sobre leyes venezolanas usando:
 *  - Google Gemini (gemini-embedding-001, 3072 dims) → convierte la query a vector
 *  - Supabase pgvector → encuentra los documentos más similares semánticamente
 *
 * Funciones RPC disponibles en Supabase (ver docs/pgvector_setup.sql):
 *  · match_laws(query_embedding, match_threshold, match_count)
 *  · match_law_items(query_embedding, match_threshold, match_count)
 *  · match_all_legal_content(query_embedding, match_threshold, match_count)
 *
 * NO genera respuestas de IA. Solo encuentra los documentos más relevantes
 * según el significado de la búsqueda (no palabras clave).
 */

import { supabase } from '../config/supabase';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const EMBED_MODEL    = 'models/gemini-embedding-001';
const EMBED_URL      = `https://generativelanguage.googleapis.com/v1beta/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

// Umbral de similitud (0‒1). 0.40 = relajado, 0.60 = estricto.
const DEFAULT_THRESHOLD = 0.42;

// ─────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────

/**
 * Convierte un texto en un vector 3072-d usando Gemini.
 * taskType: RETRIEVAL_QUERY → optimizado para consultas (no documentos).
 */
const getQueryEmbedding = async (text) => {
    if (!GEMINI_API_KEY) {
        console.warn('[SemanticSearch] Falta EXPO_PUBLIC_GEMINI_API_KEY en .env');
        return null;
    }

    try {
        const response = await fetch(EMBED_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: EMBED_MODEL,
                content: { parts: [{ text: text.substring(0, 500) }] },
                taskType: 'RETRIEVAL_QUERY',
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            console.warn('[SemanticSearch] Gemini error:', err?.error?.message || response.status);
            return null;
        }

        const data = await response.json();
        let values = data?.embedding?.values || null;

        // Matryoshka: truncar a 768 para compatibilidad con pgvector HNSW
        // (igual que en generateEmbeddings.js — los vectores en BD son vector(768))
        if (values && values.length > 768) {
            values = values.slice(0, 768);
        }
        return values;
    } catch (e) {
        console.warn('[SemanticSearch] Fetch error:', e.message);
        return null;
    }
};

// ─────────────────────────────────────────────────────────────
// API Pública
// ─────────────────────────────────────────────────────────────

const SemanticSearchService = {

    /**
     * Búsqueda unificada: retorna leyes Y artículos relevantes mezclados.
     * Recomendada para la pantalla de búsqueda principal.
     *
     * @param {string} query        - Texto en lenguaje natural
     * @param {number} limit        - Máximo de resultados totales
     * @param {number} [threshold]  - Umbral de similitud (0–1)
     * @returns {Promise<Array>}    - Resultados mezclados, ordenados por similitud
     */
    search: async (query, limit = 12, threshold = DEFAULT_THRESHOLD) => {
        try {
            const embedding = await getQueryEmbedding(query);
            if (!embedding) return [];

            const { data, error } = await supabase.rpc('match_all_legal_content', {
                query_embedding: embedding,
                match_threshold: threshold,
                match_count:     limit,
            });

            if (error) {
                console.warn('[SemanticSearch] RPC error (match_all_legal_content):', error.message);
                return [];
            }

            return (data || []).map(item => ({
                ...item,
                searchType: 'semantic',
                // Normalizar para compatibilidad con los componentes existentes
                id: item.result_type === 'article'
                    ? `${item.law_id}-${item.id}`
                    : item.id,
                searchableText: item.excerpt,
            }));
        } catch (e) {
            console.warn('[SemanticSearch] search error:', e.message);
            return [];
        }
    },

    /**
     * Búsqueda solo en LEYES (tabla `laws`).
     * Útil para filtrar por categoría o mostrar leyes relacionadas.
     *
     * @param {string} query
     * @param {number} limit
     * @param {number} [threshold]
     * @returns {Promise<Array>}
     */
    searchLaws: async (query, limit = 8, threshold = DEFAULT_THRESHOLD) => {
        try {
            const embedding = await getQueryEmbedding(query);
            if (!embedding) return [];

            const { data, error } = await supabase.rpc('match_laws', {
                query_embedding: embedding,
                match_threshold: threshold,
                match_count:     limit,
            });

            if (error) {
                console.warn('[SemanticSearch] RPC error (match_laws):', error.message);
                return [];
            }

            return (data || []).map(law => ({
                ...law,
                searchType: 'semantic',
            }));
        } catch (e) {
            console.warn('[SemanticSearch] searchLaws error:', e.message);
            return [];
        }
    },

    /**
     * Búsqueda solo en ARTÍCULOS (tabla `law_items`).
     * Útil cuando el usuario busca algo muy concreto.
     *
     * @param {string} query
     * @param {number} limit
     * @param {number} [threshold]
     * @param {string} [targetLawId] - Opcional: filtro por ley
     * @returns {Promise<Array>}
     */
    searchArticles: async (query, limit = 10, threshold = DEFAULT_THRESHOLD - 0.05, targetLawId = null) => {
        try {
            const embedding = await getQueryEmbedding(query);
            if (!embedding) return [];

            const { data, error } = await supabase.rpc('match_law_items', {
                query_embedding: embedding,
                match_threshold: threshold,
                match_count:     limit,
                target_law_id:   targetLawId, // NUEVO
            });

            if (error) {
                console.warn('[SemanticSearch] RPC error (match_law_items):', error.message);
                return [];
            }

            return (data || []).map(item => ({
                ...item,
                searchType:    'semantic_article',
                // Compatibilidad con SearchScreen / LawArticle
                id:            `${item.law_id}-${item.id}`,
                title:         item.title || `Artículo ${item.number}`,
                searchableText: item.text,
            }));
        } catch (e) {
            console.warn('[SemanticSearch] searchArticles error:', e.message);
            return [];
        }
    },

    /**
     * Verifica en tiempo de ejecución si la búsqueda semántica está disponible.
     * Devuelve false si falta la API key o si la columna embedding no existe aún.
     */
    isAvailable: async () => {
        if (!GEMINI_API_KEY) return false;
        try {
            // Comprobamos que la función RPC existe haciendo una llamada con un vector vacío
            const { error } = await supabase.rpc('match_laws', {
                query_embedding: new Array(768).fill(0),  // 768 = dimensión real en BD
                match_threshold: 0.99,
                match_count:     1,
            });
            return !error;
        } catch {
            return false;
        }
    },
};

export default SemanticSearchService;
