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
            // Lanzamos búsquedas en paralelo
            const [keywordLaws, jurisprudence, semanticItems] = await Promise.all([
                searchLaws(query),
                JurisprudenceService.searchSentences(query),
                SemanticSearchService.search(query, 12)
            ]);

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

            // 2. Jurisprudencia
            jurisprudence.forEach(item => {
                const jurId = `jur-${item.id}`;
                if (!seenIds.has(jurId)) {
                    seenIds.add(jurId);
                    merged.push({ ...item, searchType: 'keyword' });
                }
            });

            // 3. Resultados Semánticos (Significado)
            semanticItems.forEach(item => {
                // El ID semántico para artículos es lawId-itemId
                const semId = item.id; 
                if (!seenIds.has(semId)) {
                    seenIds.add(semId);
                    merged.push({ ...item, searchType: 'semantic' });
                }
            });

            return merged;
        } catch (error) {
            console.error('[HybridSearch] Error:', error);
            // Fallback: solo palabras clave si algo falla
            return searchLaws(query);
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
