import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import { LAW_CATEGORIES } from '../utils/constants';

const LAWS_INDEX_FILE = `${FileSystem.documentDirectory}laws_index.json`;
const STORAGE_KEYS = {
    LAST_SYNC: 'laws_index_last_sync',
    HAS_NEW_LAWS: 'has_new_laws',
    KNOWN_LAW_IDS: 'known_law_ids',
    SERVER_TIMESTAMP: 'laws_server_timestamp',
    UPDATED_CATEGORIES: 'updated_categories'
};

// Códigos principales para pre-descarga
const PRIORITY_CODES = [
    'codigo_civil',
    'codigo_penal',
    'constitucion',
    'codigo_comercio',
    'codigo_procedimiento_civil',
    'copp',
    'lot'
];

/**
 * lawsIndexService.js
 * Manages a lightweight local index of all laws for offline-first search and browsing.
 * Dramatically reduces Supabase reads by keeping search data local.
 */
const LawsIndexService = {
    /**
     * Initialize the laws index - call on app start
     */
    initialize: async () => {
        try {
            const hasIndex = await LawsIndexService.hasLocalIndex();

            if (!hasIndex) {
                console.log('No local index found, downloading...');
                return await LawsIndexService.downloadFullIndex();
            }

            // Check if we should update (once per day)
            const shouldUpdate = await LawsIndexService.shouldCheckForUpdates();
            if (shouldUpdate) {
                console.log('Checking for updates...');
                await LawsIndexService.checkAndUpdateIndex();
            }

            return true;
        } catch (error) {
            console.error('Error initializing laws index:', error);
            return false;
        }
    },

    /**
     * Check if local index exists
     */
    hasLocalIndex: async () => {
        try {
            const fileInfo = await FileSystem.getInfoAsync(LAWS_INDEX_FILE);
            return fileInfo.exists;
        } catch (error) {
            return false;
        }
    },

    /**
     * Download the full laws index from Supabase
     * Only downloads metadata, not article content
     */
    downloadFullIndex: async () => {
        try {
            const { data: laws, error } = await supabase
                .from('laws')
                .select('*');

            if (error) throw error;
            if (!laws || laws.length === 0) {
                console.log('⚠️ Supabase returned 0 laws. Skipping index overwrite.');
                return false;
            }

            const indexData = {
                version: '1.0.0',
                lastUpdated: new Date().toISOString(),
                lawCount: laws.length,
                laws: laws
            };

            await FileSystem.writeAsStringAsync(
                LAWS_INDEX_FILE,
                JSON.stringify(indexData)
            );

            // Save current law IDs for new law detection
            const lawIds = laws.map(l => l.id);
            await AsyncStorage.setItem(STORAGE_KEYS.KNOWN_LAW_IDS, JSON.stringify(lawIds));
            await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
            await AsyncStorage.setItem(STORAGE_KEYS.HAS_NEW_LAWS, 'false');
            await AsyncStorage.setItem(STORAGE_KEYS.UPDATED_CATEGORIES, JSON.stringify([]));

            console.log(`Laws index downloaded: ${laws.length} laws`);
            return true;
        } catch (error) {
            if (!error.message || !error.message.toLowerCase().includes('network')) {
                console.error('Error downloading laws index:', error);
            }
            return false;
        }
    },

    /**
     * Get all laws from local index
     */
    getAllLawsLocal: async () => {
        try {
            const fileInfo = await FileSystem.getInfoAsync(LAWS_INDEX_FILE);
            if (!fileInfo.exists) {
                return null;
            }

            const content = await FileSystem.readAsStringAsync(LAWS_INDEX_FILE);
            const indexData = JSON.parse(content);
            return indexData.laws || [];
        } catch (error) {
            console.error('Error reading local laws index:', error);
            return null;
        }
    },

    /**
     * Get laws by category from local index
     */
    getLawsByCategoryLocal: async (category) => {
        const laws = await LawsIndexService.getAllLawsLocal();
        if (!laws) return null;
        return laws.filter(law => law.category === category);
    },

    /**
     * Get laws by parent category from local index
     */
    getLawsByParentCategoryLocal: async (parentCategory) => {
        const laws = await LawsIndexService.getAllLawsLocal();
        if (!laws) return null;
        return laws.filter(law => law.parent_category === parentCategory);
    },

    /**
     * Get all Convenios from local index
     */
    getConveniosLocal: async () => {
        const laws = await LawsIndexService.getAllLawsLocal();
        if (!laws) return null;
        return laws.filter(law => law.category === 'convenios');
    },

    /**
     * Get all codes (Códigos) from local index
     */
    getAllCodesLocal: async () => {
        const laws = await LawsIndexService.getAllLawsLocal();
        if (!laws) return null;

        return laws.filter(law => {
            if (law.parent_category === 'codigos') return true;
            if (law.category && law.category.startsWith('codigo_') && law.type === 'Código') return true;

            const codeCategories = [
                'codigo_civil', 'codigo_penal', 'codigo_comercio',
                'codigo_procedimiento_civil', 'codigo_organico_procesal_penal',
                'codigo_organico_tributario', 'codigo_organico_justicia_militar'
            ];
            if (codeCategories.includes(law.category)) return true;

            return false;
        });
    },

    /**
     * Search laws locally by text
     */
    searchLawsLocal: async (searchText) => {
        const laws = await LawsIndexService.getAllLawsLocal();
        if (!laws) return null;

        const normalizeText = (text) => {
            if (!text) return '';
            return text.toString().toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
        };

        const searchNorm = normalizeText(searchText);

        return laws.filter(law =>
            normalizeText(law.title).includes(searchNorm) ||
            normalizeText(law.searchable_text).includes(searchNorm)
        );
    },

    /**
     * Check if we should check for updates (once per day)
     */
    shouldCheckForUpdates: async () => {
        try {
            const lastSync = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
            if (!lastSync) return true;

            const lastSyncDate = new Date(lastSync);
            const now = new Date();
            const hoursSinceSync = (now - lastSyncDate) / (1000 * 60 * 60);

            return hoursSinceSync >= 24;
        } catch (error) {
            return true;
        }
    },

    /**
     * Check for new laws and update index if needed.
     * OPTIMIZADO: Lee UN solo row (app_metadata) en vez de toda la tabla.
     * Costo: 1 lectura (antes: ~90 lecturas)
     */
    checkAndUpdateIndex: async () => {
        try {
            // 1. Leer el row de metadata global (1 sola lectura)
            const { data: serverData, error } = await supabase
                .from('app_metadata')
                .select('laws_last_updated, last_upload_count, latest_app_version')
                .eq('id', 'singleton')
                .maybeSingle();

            if (error) throw error;

            if (!serverData) {
                // Si no existe el row de metadata, hacer check legacy
                console.log('No metadata row found, using legacy check...');
                return await LawsIndexService._legacyCheckAndUpdate();
            }

            const serverTimestamp = serverData.laws_last_updated;

            // 2. Comparar con el timestamp local guardado
            const localTimestamp = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_TIMESTAMP);

            if (localTimestamp === serverTimestamp) {
                console.log('Laws index up to date (metadata match).');
                await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
                return { hasNewLaws: false, newCount: 0 };
            }

            // 3. Hay cambios! Descargar el índice completo
            console.log('Laws updated on server, downloading new index...');
            await AsyncStorage.setItem(STORAGE_KEYS.HAS_NEW_LAWS, 'true');

            // Guardar el previous sync para comparar
            const previousSync = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);

            // Descargar el nuevo índice ACTUALIZADO
            await LawsIndexService.downloadFullIndex();

            // 4. Identificar qué categorías tienen novedades (usando el índice recién descargado)
            const laws = await LawsIndexService.getAllLawsLocal();
            const updatedCats = new Set();

            if (previousSync && laws) {
                const prevDate = new Date(previousSync);

                laws.forEach(law => {
                    const lawDate = new Date(law.last_updated);
                    if (lawDate > prevDate) {
                        if (law.parent_category) updatedCats.add(law.parent_category);
                        if (law.category) updatedCats.add(law.category);
                    }
                });

                if (updatedCats.size > 0) {
                    const currentUpdated = JSON.parse(await AsyncStorage.getItem(STORAGE_KEYS.UPDATED_CATEGORIES) || '[]');
                    const combined = Array.from(new Set([...currentUpdated, ...Array.from(updatedCats)]));
                    await AsyncStorage.setItem(STORAGE_KEYS.UPDATED_CATEGORIES, JSON.stringify(combined));
                }
            }

            // 6. ADICIONAL: Verificar Gacetas y Jurisprudencia (NUEVO)
            // Esto permite que el punto rojo aparezca en Jurisprudencia y Gacetas
            try {
                const previousSync = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
                if (previousSync) {
                    const prevDate = new Date(previousSync).toISOString();

                    // Check Gacetas
                    const { data: latestGaceta } = await supabase
                        .from('gacetas')
                        .select('timestamp')
                        .gt('timestamp', prevDate)
                        .limit(1);

                    if (latestGaceta && latestGaceta.length > 0) {
                        const currentUpdated = JSON.parse(await AsyncStorage.getItem(STORAGE_KEYS.UPDATED_CATEGORIES) || '[]');
                        if (!currentUpdated.includes(LAW_CATEGORIES.GACETA)) {
                            currentUpdated.push(LAW_CATEGORIES.GACETA);
                            await AsyncStorage.setItem(STORAGE_KEYS.UPDATED_CATEGORIES, JSON.stringify(currentUpdated));
                        }
                    }

                    // Check Jurisprudence
                    const { data: latestJuris } = await supabase
                        .from('jurisprudence')
                        .select('timestamp')
                        .gt('timestamp', prevDate)
                        .limit(1);

                    if (latestJuris && latestJuris.length > 0) {
                        const currentUpdated = JSON.parse(await AsyncStorage.getItem(STORAGE_KEYS.UPDATED_CATEGORIES) || '[]');
                        if (!currentUpdated.includes(LAW_CATEGORIES.TSJ)) {
                            currentUpdated.push(LAW_CATEGORIES.TSJ);
                            await AsyncStorage.setItem(STORAGE_KEYS.UPDATED_CATEGORIES, JSON.stringify(currentUpdated));
                        }
                    }
                }
            } catch (err) {
                console.log('Error checking non-law updates:', err);
                // No lanzamos error para no romper el flujo principal de leyes
            }

            // 5. Guardar el nuevo timestamp del servidor
            if (serverTimestamp) {
                await AsyncStorage.setItem(STORAGE_KEYS.SERVER_TIMESTAMP, serverTimestamp);
            }

            return {
                hasNewLaws: true,
                newCount: serverData.last_upload_count || 0,
                updatedCategories: Array.from(updatedCats),
                latestAppVersion: serverData.latest_app_version
            };
        } catch (error) {
            if (!error.message || !error.message.toLowerCase().includes('network')) {
                console.error('Error checking for updates:', error);
            }
            return { hasNewLaws: false, newCount: 0, error: true };
        }
    },

    /**
     * Get current app version from app.json
     */
    getCurrentAppVersion: () => {
        try {
            const appJson = require('../../app.json');
            return appJson.expo.version;
        } catch (e) {
            return '1.1.0'; // Fallback
        }
    },

    /**
     * Legacy check (fallback si no existe app_metadata)
     */
    _legacyCheckAndUpdate: async () => {
        try {
            const { data: laws, error } = await supabase
                .from('laws')
                .select('id');

            if (error) throw error;
            const remoteLawIds = (laws || []).map(l => l.id);

            const knownIdsStr = await AsyncStorage.getItem(STORAGE_KEYS.KNOWN_LAW_IDS);
            const knownIds = knownIdsStr ? JSON.parse(knownIdsStr) : [];

            const newLaws = remoteLawIds.filter(id => !knownIds.includes(id));
            const deletedLaws = knownIds.filter(id => !remoteLawIds.includes(id));

            if (newLaws.length > 0 || deletedLaws.length > 0) {
                console.log(`Index update needed: ${newLaws.length} new, ${deletedLaws.length} deleted.`);
                await AsyncStorage.setItem(STORAGE_KEYS.HAS_NEW_LAWS, 'true');
                await LawsIndexService.downloadFullIndex();
                return { hasNewLaws: true, newCount: newLaws.length };
            }

            await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
            return { hasNewLaws: false, newCount: 0 };
        } catch (error) {
            if (!error.message || !error.message.toLowerCase().includes('network')) {
                console.error('Error in legacy check:', error);
            }
            return { hasNewLaws: false, newCount: 0, error: true };
        }
    },

    /**
     * Check if there are new laws to notify user
     */
    hasNewLawsNotification: async () => {
        try {
            const hasNew = await AsyncStorage.getItem(STORAGE_KEYS.HAS_NEW_LAWS);
            return hasNew === 'true';
        } catch (error) {
            return false;
        }
    },

    /**
     * Mark new laws notification as seen
     */
    clearNewLawsNotification: async () => {
        try {
            await AsyncStorage.setItem(STORAGE_KEYS.HAS_NEW_LAWS, 'false');
        } catch (error) {
            console.error('Error clearing notification:', error);
        }
    },

    /**
     * Get list of categories that have new content
     */
    getUpdatedCategories: async () => {
        try {
            const data = await AsyncStorage.getItem(STORAGE_KEYS.UPDATED_CATEGORIES);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            return [];
        }
    },

    /**
     * Clear notification for a specific category
     */
    clearCategoryNotification: async (category) => {
        try {
            const current = JSON.parse(await AsyncStorage.getItem(STORAGE_KEYS.UPDATED_CATEGORIES) || '[]');
            const filtered = current.filter(c => c !== category);
            await AsyncStorage.setItem(STORAGE_KEYS.UPDATED_CATEGORIES, JSON.stringify(filtered));
        } catch (error) {
            console.error('Error clearing category notification:', error);
        }
    },

    /**
     * Get last sync time for display
     */
    getLastSyncTime: async () => {
        try {
            const lastSync = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
            return lastSync ? new Date(lastSync) : null;
        } catch (error) {
            return null;
        }
    },

    /**
     * Get the list of priority codes to pre-download
     */
    getPriorityCodes: () => PRIORITY_CODES,

    /**
     * Force refresh the index
     */
    forceRefresh: async () => {
        return await LawsIndexService.downloadFullIndex();
    },

    /**
     * Get index stats for debugging/display
     */
    getIndexStats: async () => {
        try {
            const fileInfo = await FileSystem.getInfoAsync(LAWS_INDEX_FILE);
            if (!fileInfo.exists) {
                return { exists: false };
            }

            const content = await FileSystem.readAsStringAsync(LAWS_INDEX_FILE);
            const indexData = JSON.parse(content);
            const lastSync = await LawsIndexService.getLastSyncTime();

            return {
                exists: true,
                lawCount: indexData.lawCount || indexData.laws?.length || 0,
                version: indexData.version,
                lastUpdated: indexData.lastUpdated,
                lastSync: lastSync,
                fileSizeBytes: fileInfo.size
            };
        } catch (error) {
            return { exists: false, error: error.message };
        }
    }
};

export default LawsIndexService;
