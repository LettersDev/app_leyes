import * as FileSystem from 'expo-file-system/legacy';

const OFFLINE_DIR = `${FileSystem.documentDirectory}offline_laws/`;

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
            const filePath = `${OFFLINE_DIR}${lawId}.json`;
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            if (fileInfo.exists) {
                const content = await FileSystem.readAsStringAsync(filePath);
                return JSON.parse(content);
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
    }
};

export default OfflineService;
