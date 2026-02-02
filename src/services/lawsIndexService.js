import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../config/firebase';

const LAWS_INDEX_FILE = `${FileSystem.documentDirectory}laws_index.json`;
const LAWS_COLLECTION = 'laws';
const STORAGE_KEYS = {
    LAST_SYNC: 'laws_index_last_sync',
    HAS_NEW_LAWS: 'has_new_laws',
    KNOWN_LAW_IDS: 'known_law_ids'
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
 * This dramatically reduces Firebase reads by keeping search data local.
 */
const LawsIndexService = {
    /**
     * Initialize the laws index - call on app start
     * Downloads index if not present or outdated
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
     * Download the full laws index from Firebase
     * Only downloads metadata, not article content
     */
    downloadFullIndex: async () => {
        try {
            const lawsRef = collection(db, LAWS_COLLECTION);
            const snapshot = await getDocs(lawsRef);

            const laws = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

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

            console.log(`Laws index downloaded: ${laws.length} laws`);
            return true;
        } catch (error) {
            console.error('Error downloading laws index:', error);
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
     * Get all codes (Códigos) from local index
     * Supports both old format (category starts with 'codigo_') and new format (parent_category === 'codigos')
     */
    getAllCodesLocal: async () => {
        const laws = await LawsIndexService.getAllLawsLocal();
        if (!laws) return null;

        return laws.filter(law => {
            // New format: has parent_category = 'codigos'
            if (law.parent_category === 'codigos') return true;

            // Old format: category starts with 'codigo_' and type is 'Código'
            if (law.category && law.category.startsWith('codigo_') && law.type === 'Código') return true;

            // Also include if category matches known code patterns
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
            normalizeText(law.searchableText).includes(searchNorm)
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
     * Check for new laws and update index if needed
     */
    checkAndUpdateIndex: async () => {
        try {
            // Get current law count from Firebase
            const lawsRef = collection(db, LAWS_COLLECTION);
            const snapshot = await getDocs(lawsRef);
            const remoteLawIds = snapshot.docs.map(doc => doc.id);

            // Get known law IDs
            const knownIdsStr = await AsyncStorage.getItem(STORAGE_KEYS.KNOWN_LAW_IDS);
            const knownIds = knownIdsStr ? JSON.parse(knownIdsStr) : [];

            // Check for new laws
            const newLaws = remoteLawIds.filter(id => !knownIds.includes(id));

            if (newLaws.length > 0) {
                console.log(`Found ${newLaws.length} new laws!`);
                await AsyncStorage.setItem(STORAGE_KEYS.HAS_NEW_LAWS, 'true');

                // Re-download full index
                await LawsIndexService.downloadFullIndex();
                return { hasNewLaws: true, newCount: newLaws.length };
            }

            await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
            return { hasNewLaws: false, newCount: 0 };
        } catch (error) {
            console.error('Error checking for updates:', error);
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
