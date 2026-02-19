import { supabase } from '../config/supabase';
import OfflineService from './offlineService';
import LawsIndexService from './lawsIndexService';

const normalizeText = (text) => {
    if (!text) return '';
    return text.toString().toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
};

/**
 * Obtener todas las leyes - LOCAL FIRST
 * Primero intenta obtener del índice local, solo usa Supabase si no hay índice
 */
export const getAllLaws = async () => {
    try {
        const localLaws = await LawsIndexService.getAllLawsLocal();
        if (localLaws && localLaws.length > 0) {
            return localLaws;
        }

        console.log('No local index, fetching from Supabase...');
        const { data, error } = await supabase
            .from('laws')
            .select('*');

        if (error) throw error;
        return data || [];
    } catch (error) {
        if (error.message && error.message.toLowerCase().includes('network')) {
            throw new Error('OFFLINE_ERROR');
        }
        console.error('Error al obtener leyes:', error);
        throw error;
    }
};

/**
 * Obtener leyes por categoría - LOCAL FIRST
 */
export const getLawsByCategory = async (category, forceRefresh = false) => {
    try {
        if (!forceRefresh) {
            const localLaws = await LawsIndexService.getLawsByCategoryLocal(category);
            if (localLaws && localLaws.length > 0) {
                return localLaws;
            }
        }

        console.log(`Fetching ${category} from Supabase (Force: ${forceRefresh})`);
        const { data, error } = await supabase
            .from('laws')
            .select('*')
            .eq('category', category);

        if (error) throw error;

        if (forceRefresh) {
            await LawsIndexService.checkAndUpdateIndex();
        }

        return data || [];
    } catch (error) {
        if (error.message && error.message.toLowerCase().includes('network')) {
            throw new Error('OFFLINE_ERROR');
        }
        console.error('Error al obtener leyes por categoría:', error);
        throw error;
    }
};

/**
 * Obtener leyes por categoría padre (Agrupación) - LOCAL FIRST
 */
export const getLawsByParentCategory = async (parentCategory, forceRefresh = false) => {
    try {
        if (!forceRefresh) {
            const localLaws = await LawsIndexService.getLawsByParentCategoryLocal(parentCategory);
            if (localLaws && localLaws.length > 0) {
                return localLaws;
            }
        }

        console.log(`Fetching ${parentCategory} from Supabase (Force: ${forceRefresh})`);
        const { data, error } = await supabase
            .from('laws')
            .select('*')
            .eq('parent_category', parentCategory);

        if (error) throw error;

        if (forceRefresh) {
            await LawsIndexService.checkAndUpdateIndex();
        }

        return data || [];
    } catch (error) {
        if (error.message && error.message.toLowerCase().includes('network')) {
            throw new Error('OFFLINE_ERROR');
        }
        console.error('Error al obtener leyes por categoría padre:', error);
        throw error;
    }
};

export const getLawById = async (lawId) => {
    try {
        // Intentar local primero
        const offlineLaw = await OfflineService.getLaw(lawId);
        if (offlineLaw && offlineLaw.metadata) {
            return offlineLaw.metadata;
        }

        const { data, error } = await supabase
            .from('laws')
            .select('*')
            .eq('id', lawId)
            .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Ley no encontrada');
        return data;
    } catch (error) {
        if (error.message && error.message.toLowerCase().includes('network')) {
            throw new Error('OFFLINE_ERROR');
        }
        console.error('Error al obtener ley:', error);
        throw error;
    }
};

/**
 * Obtener los items (artículos/encabezados) de una ley de forma paginada
 */
export const getLawItems = async (lawId, lastIndex = -1, pageSize = 50) => {
    try {
        // Intentar local primero
        const offlineLaw = await OfflineService.getLaw(lawId);
        if (offlineLaw && offlineLaw.items) {
            return offlineLaw.items
                .filter(item => item.index > lastIndex)
                .slice(0, pageSize);
        }

        const { data, error } = await supabase
            .from('law_items')
            .select('*')
            .eq('law_id', lawId)
            .gt('index', lastIndex)
            .order('index', { ascending: true })
            .limit(pageSize);

        if (error) throw error;
        return data || [];
    } catch (error) {
        if (error.message && error.message.toLowerCase().includes('network')) {
            throw new Error('OFFLINE_ERROR');
        }
        console.error('Error al obtener items de la ley:', error);
        throw error;
    }
};

/**
 * Buscar un artículo específico por su número
 */
export const getLawItemByNumber = async (lawId, articleNumber) => {
    try {
        const { data, error } = await supabase
            .from('law_items')
            .select('*')
            .eq('law_id', lawId)
            .eq('number', parseInt(articleNumber))
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        return data || null;
    } catch (error) {
        if (error.message && error.message.toLowerCase().includes('network')) {
            throw new Error('OFFLINE_ERROR');
        }
        console.error('Error al buscar artículo por número:', error);
        throw error;
    }
};

/**
 * Buscar artículos por texto dentro de una ley específica
 */
export const searchLawItemsByText = async (lawId, searchText) => {
    try {
        // Local-first
        const offlineLaw = await OfflineService.getLaw(lawId);
        if (offlineLaw && offlineLaw.items) {
            const searchNorm = normalizeText(searchText);
            return offlineLaw.items
                .filter(item =>
                    normalizeText(item.text).includes(searchNorm) ||
                    normalizeText(item.title).includes(searchNorm)
                )
                .sort((a, b) => (a.index || 0) - (b.index || 0))
                .slice(0, 50);
        }

        // Supabase: búsqueda ilike (rápido, soporta acentos via unaccent si está configurado)
        const { data, error } = await supabase
            .from('law_items')
            .select('*')
            .eq('law_id', lawId)
            .ilike('text', `%${searchText}%`)
            .order('index', { ascending: true })
            .limit(50);

        if (error) throw error;
        return data || [];
    } catch (error) {
        if (error.message && error.message.toLowerCase().includes('network')) {
            throw new Error('OFFLINE_ERROR');
        }
        console.error('Error en búsqueda interna:', error);
        throw error;
    }
};

/**
 * Obtener artículos vecinos dado un número central
 */
export const getLawItemsAround = async (lawId, articleNumber, windowSize = 2) => {
    try {
        const num = parseInt(articleNumber);

        // Intentar local primero
        const offlineLaw = await OfflineService.getLaw(lawId);
        if (offlineLaw && offlineLaw.items) {
            return offlineLaw.items
                .filter(item => item.number >= num - windowSize && item.number <= num + windowSize)
                .sort((a, b) => (a.number || 0) - (b.number || 0));
        }

        const { data, error } = await supabase
            .from('law_items')
            .select('*')
            .eq('law_id', lawId)
            .gte('number', num - windowSize)
            .lte('number', num + windowSize)
            .order('number', { ascending: true });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error al obtener artículos vecinos:', error);
        throw error;
    }
};

/**
 * Buscar leyes por texto (Global) - LOCAL FIRST
 */
export const searchLaws = async (searchText) => {
    try {
        // Local-first: indexado local (0 lecturas Supabase)
        const localResults = await LawsIndexService.searchLawsLocal(searchText);
        if (localResults !== null) {
            return localResults;
        }

        // Fallback: FTS en Supabase con stemming en español
        console.log('[FTS] Buscando leyes en Supabase:', searchText);
        const { data, error } = await supabase
            .from('laws')
            .select('id, title, category, parent_category, item_count, is_large_law')
            .textSearch('fts', searchText, {
                type: 'websearch',
                config: 'spanish'
            })
            .limit(30);

        if (error) throw error;
        return data || [];
    } catch (error) {
        if (error.message && error.message.toLowerCase().includes('network')) {
            throw new Error('OFFLINE_ERROR');
        }
        console.error('Error al buscar leyes:', error);
        throw error;
    }
};

/**
 * Obtener actualizaciones recientes
 */
export const getRecentUpdates = async (limitCount = 10) => {
    try {
        const { data, error } = await supabase
            .from('laws')
            .select('*')
            .order('last_updated', { ascending: false })
            .limit(limitCount);

        if (error) throw error;
        return data || [];
    } catch (error) {
        if (error.message === 'Network request failed') {
            throw new Error('OFFLINE_ERROR');
        }
        console.error('Error al obtener actualizaciones recientes:', error);
        throw error;
    }
};

/**
 * Descargar todos los artículos de una ley para uso offline
 */
export const downloadLawContent = async (lawId) => {
    try {
        // Primero intentar offline
        const offlineLaw = await OfflineService.getLaw(lawId);
        if (offlineLaw && offlineLaw.items && offlineLaw.items.length > 0) {
            console.log(`[Offline] ${lawId} ya descargada.`);
            return true;
        }

        // Una sola query con JOIN: law + todos sus artículos
        const { data, error } = await supabase
            .from('laws')
            .select('*, law_items(*)')
            .eq('id', lawId)
            .single();

        if (error) throw error;

        const { law_items: items, ...metadata } = data;

        // Ordenar artículos por índice
        const sortedItems = (items || []).sort((a, b) => (a.index || 0) - (b.index || 0));

        const fullData = {
            metadata,
            items: sortedItems,
            downloadedAt: new Date().toISOString()
        };

        return await OfflineService.saveLaw(lawId, fullData);
    } catch (error) {
        if (!error.message || !error.message.toLowerCase().includes('network')) {
            console.error('Error downloading law content:', error);
        }
        return false;
    }
};
