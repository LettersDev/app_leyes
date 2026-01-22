import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = '@appleyes_history';
const MAX_HISTORY = 10;

/**
 * historyManager.js
 * Mantiene un registro de las leyes/sentencias visitadas recientemente.
 */
const HistoryManager = {
    /**
     * Agrega un item al historial (o lo mueve al principio si ya existía)
     * @param {Object} item - { id, type, title, subtitle, data }
     */
    addVisit: async (item) => {
        try {
            const history = await HistoryManager.getHistory();

            // Buscar si ya existe para preservar el lastArticleIndex si no se provee uno nuevo
            const existing = history.find(h => h.id === item.id);

            // Eliminar si ya existía para evitar duplicados y mover al top
            const filtered = history.filter(h => h.id !== item.id);

            const newItem = {
                ...item,
                visitedAt: new Date().toISOString(),
                lastArticleIndex: item.lastArticleIndex !== undefined
                    ? item.lastArticleIndex
                    : (existing ? existing.lastArticleIndex : 0)
            };

            const newHistory = [newItem, ...filtered].slice(0, MAX_HISTORY);
            await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
            return newHistory;
        } catch (error) {
            console.error('Error adding to history:', error);
            return [];
        }
    },

    /**
     * Actualiza solo el índice del último artículo visto sin moverlo al principio
     */
    updateVisitIndex: async (id, index) => {
        try {
            const history = await HistoryManager.getHistory();
            const newHistory = history.map(h => {
                if (h.id === id) {
                    return { ...h, lastArticleIndex: index };
                }
                return h;
            });
            await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
            return newHistory;
        } catch (error) {
            console.error('Error updating history index:', error);
            return [];
        }
    },

    /**
     * Obtiene el historial completo
     */
    getHistory: async () => {
        try {
            const jsonValue = await AsyncStorage.getItem(HISTORY_KEY);
            return jsonValue != null ? JSON.parse(jsonValue) : [];
        } catch (e) {
            return [];
        }
    },

    /**
     * Limpia todo el historial
     */
    clearHistory: async () => {
        try {
            await AsyncStorage.removeItem(HISTORY_KEY);
            return true;
        } catch (e) {
            return false;
        }
    },

    /**
     * Elimina un item específico del historial
     * @param {string} id - ID del item a eliminar
     */
    removeVisit: async (id) => {
        try {
            const history = await HistoryManager.getHistory();
            const newHistory = history.filter(h => h.id !== id);
            await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
            return newHistory;
        } catch (error) {
            console.error('Error removing from history:', error);
            return [];
        }
    }
};

export default HistoryManager;
