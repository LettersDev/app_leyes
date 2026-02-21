import * as FileSystem from 'expo-file-system/legacy';

const OFFLINE_DIR = `${FileSystem.documentDirectory}offline_laws/`;

// Mapping of laws included in the APK
const BUNDLED_LAWS = {
    'constitucion': require('../../assets/bundled_laws/constitucion.json'),
    'codigo_civil': require('../../assets/bundled_laws/codigo_civil.json'),
    'codigo_penal': require('../../assets/bundled_laws/codigo_penal.json'),
    'codigo_comercio': require('../../assets/bundled_laws/codigo_comercio.json'),
    'codigo_procedimiento_civil': require('../../assets/bundled_laws/codigo_procedimiento_civil.json'),
    'copp': require('../../assets/bundled_laws/copp.json'),
    'lottt': require('../../assets/bundled_laws/lottt.json')
};

/**
 * offlineService.js
 * Gestiona el almacenamiento local de las leyes (JSON) para lectura sin internet.
 */
const OfflineService = {
    /**
     * Asegura que el directorio offline exista
     */
    init: async () => {
        const dirInfo = await FileSystem.getInfoAsync(OFFLINE_DIR);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(OFFLINE_DIR, { intermediates: true });
        }
    },

    /**
     * Guarda una ley completa (metadata + items) en el disco
     */
    saveLaw: async (lawId, data) => {
        try {
            await OfflineService.init();
            const filePath = `${OFFLINE_DIR}${lawId}.json`;
            await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data));
            console.log(`Ley ${lawId} guardada offline.`);
            return true;
        } catch (error) {
            console.error('Error saving law offline:', error);
            return false;
        }
    },

    /**
     * Obtiene una ley guardada localmente
     */
    getLaw: async (lawId) => {
        try {
            // 1. Try local file system first (most up to date)
            const filePath = `${OFFLINE_DIR}${lawId}.json`;
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            if (fileInfo.exists) {
                const content = await FileSystem.readAsStringAsync(filePath);
                return JSON.parse(content);
            }

            // 2. Try bundled assets (fallback)
            if (BUNDLED_LAWS[lawId]) {
                console.log(`[Offline] Serving bundled law: ${lawId}`);
                return BUNDLED_LAWS[lawId];
            }

            return null;
        } catch (error) {
            console.error('Error reading law offline:', error);
            return null;
        }
    },

    /**
     * Elimina una ley del almacenamiento local
     */
    deleteLaw: async (lawId) => {
        try {
            const filePath = `${OFFLINE_DIR}${lawId}.json`;
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            if (fileInfo.exists) {
                await FileSystem.deleteAsync(filePath);
            }
            return true;
        } catch (error) {
            console.error('Error deleting law offline:', error);
            return false;
        }
    },

    /**
     * Verifica si una ley está disponible offline
     */
    isLawOffline: async (lawId) => {
        // Check if bundled or on disk
        if (BUNDLED_LAWS[lawId]) return true;

        const filePath = `${OFFLINE_DIR}${lawId}.json`;
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        return fileInfo.exists;
    },

    /**
     * Lista todas las leyes descargadas (solo IDs)
     */
    getDownloadedLawIds: async () => {
        try {
            await OfflineService.init();
            const files = await FileSystem.readDirectoryAsync(OFFLINE_DIR);
            return files.map(f => f.replace('.json', ''));
        } catch (error) {
            return [];
        }
    },

    /**
     * Get total storage used by offline laws (in bytes)
     */
    getTotalStorageUsed: async () => {
        try {
            await OfflineService.init();
            const files = await FileSystem.readDirectoryAsync(OFFLINE_DIR);
            let totalSize = 0;

            for (const file of files) {
                const filePath = `${OFFLINE_DIR}${file}`;
                const fileInfo = await FileSystem.getInfoAsync(filePath);
                if (fileInfo.exists && fileInfo.size) {
                    totalSize += fileInfo.size;
                }
            }

            return totalSize;
        } catch (error) {
            console.error('Error getting storage size:', error);
            return 0;
        }
    },

    /**
     * Get storage stats for display
     */
    getStorageStats: async () => {
        try {
            const downloadedIds = await OfflineService.getDownloadedLawIds();
            const totalSize = await OfflineService.getTotalStorageUsed();

            return {
                lawCount: downloadedIds.length,
                totalSizeBytes: totalSize,
                totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
            };
        } catch (error) {
            return { lawCount: 0, totalSizeBytes: 0, totalSizeMB: '0' };
        }
    },

    /**
     * Delete all offline laws to free space
     */
    clearAllOfflineLaws: async () => {
        try {
            const files = await FileSystem.readDirectoryAsync(OFFLINE_DIR);
            for (const file of files) {
                await FileSystem.deleteAsync(`${OFFLINE_DIR}${file}`);
            }
            console.log('All offline laws cleared');
            return true;
        } catch (error) {
            console.error('Error clearing offline laws:', error);
            return false;
        }
    },

    /**
     * Get detailed info about each downloaded law
     */
    getDownloadedLawsInfo: async () => {
        try {
            await OfflineService.init();
            const files = await FileSystem.readDirectoryAsync(OFFLINE_DIR);
            const lawsInfo = [];

            for (const file of files) {
                const filePath = `${OFFLINE_DIR}${file}`;
                const fileInfo = await FileSystem.getInfoAsync(filePath);
                const lawId = file.replace('.json', '');

                if (fileInfo.exists) {
                    try {
                        const content = await FileSystem.readAsStringAsync(filePath);
                        const data = JSON.parse(content);
                        lawsInfo.push({
                            id: lawId,
                            title: data.metadata?.title || lawId,
                            sizeBytes: fileInfo.size,
                            sizeMB: ((fileInfo.size || 0) / (1024 * 1024)).toFixed(2),
                            downloadedAt: data.downloadedAt,
                            itemCount: data.items?.length || 0
                        });
                    } catch (e) {
                        lawsInfo.push({
                            id: lawId,
                            title: lawId,
                            sizeBytes: fileInfo.size,
                            sizeMB: ((fileInfo.size || 0) / (1024 * 1024)).toFixed(2)
                        });
                    }
                }
            }

            return lawsInfo;
        } catch (error) {
            console.error('Error getting downloaded laws info:', error);
            return [];
        }
    }
};

export default OfflineService;
