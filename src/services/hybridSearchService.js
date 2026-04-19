/**
 * hybridSearchService.js
 * 
 * Orquestador de búsqueda que combina:
 *  1. Búsqueda por Palabras Clave (FTS / Exacta)
 *  2. Búsqueda Semántica (IA / Significado)
 *  3. Búsqueda de Jurisprudencia
 * 
 * Ofrece resultados unificados y deduplicados.
 */

import { searchLaws } from './lawService';
import JurisprudenceService from './jurisprudenceService';
import SemanticSearchService from './semanticSearchService';

const HybridSearchService = {

    /**
     * Búsqueda Global Unificada
     */
    searchAll: async (query, limit = 20) => {
        try {
            // Lanzamos búsquedas en paralelo (allSettled para robustez)
            const results = await Promise.allSettled([
                searchLaws(query),
                JurisprudenceService.searchSentences(query),
                SemanticSearchService.search(query, 12)
            ]);

            const keywordLaws = results[0].status === 'fulfilled' ? results[0].value : [];
            const jurisprudence = results[1].status === 'fulfilled' ? results[1].value : [];
            const semanticItems = results[2].status === 'fulfilled' ? results[2].value : [];

            // Logs de depuración para identificar fallos silenciosos
            if (results[2].status === 'rejected') console.warn('[HybridSearch] Semantic search failed:', results[2].reason);
            if (results[1].status === 'rejected') console.warn('[HybridSearch] Jurisprudence search failed:', results[1].reason);

            // Mezclar y deduplicar
            const merged = [];
            const seenIds = new Set();

            // 1. Prioridad: Coincidencias exactas (Keyword)
            keywordLaws.forEach(item => {
                if (!seenIds.has(item.id)) {
                    seenIds.add(item.id);
                    merged.push({ ...item, searchType: 'keyword' });
                }
            });

            // 2. Resultados Semánticos (Significado)
            semanticItems.forEach(item => {
                const semId = item.id; 
                if (!seenIds.has(semId)) {
                    seenIds.add(semId);
                    merged.push({ ...item, searchType: 'semantic' });
                }
            });

            // 3. Jurisprudencia (Al final, como solicitó el usuario)
            jurisprudence.forEach(item => {
                const jurId = `jur-${item.id}`;
                if (!seenIds.has(jurId)) {
                    seenIds.add(jurId);
                    merged.push({ ...item, searchType: 'jurisprudencia' });
                }
            });

            return merged;

        } catch (error) {
            console.error('[HybridSearch] Critical Failure:', error);
            // Fallback total a búsqueda local de leyes
            return searchLaws(query).catch(() => []);
        }
    },


    /**
     * Búsqueda Interna en una Ley (Híbrida)
     */
    searchInLaw: async (lawId, query, limit = 15) => {
        try {
            // Buscamos semánticamente solo en esta ley
            const semanticResults = await SemanticSearchService.searchArticles(query, limit, 0.40, lawId);
            
            // Si no hay resultados o falló, devolvemos null para que la UI use fallback
            if (!semanticResults || semanticResults.length === 0) {
                return null;
            }

            return semanticResults.map(item => ({
                ...item,
                searchType: 'semantic_article'
            }));
        } catch (error) {
            console.warn('[HybridSearch] searchInLaw failed:', error);
            return null;
        }
    }
};

export default HybridSearchService;
