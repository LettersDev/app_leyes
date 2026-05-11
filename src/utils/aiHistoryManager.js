import AsyncStorage from '@react-native-async-storage/async-storage';

const AI_HISTORY_KEY = '@ai_consult_history_v1';
const MAX_HISTORY = 10;

const AIHistoryManager = {
    /**
     * Guarda una nueva consulta en el historial
     */
    saveConsult: async (query, result) => {
        try {
            const historyStr = await AsyncStorage.getItem(AI_HISTORY_KEY);
            let history = historyStr ? JSON.parse(historyStr) : [];
            
            const newEntry = {
                id: Date.now().toString(),
                date: new Date().toISOString(),
                query,
                result
            };
            
            // Agregar al inicio y limitar
            history = [newEntry, ...history].slice(0, MAX_HISTORY);
            
            await AsyncStorage.setItem(AI_HISTORY_KEY, JSON.stringify(history));
            return history;
        } catch (error) {
            console.error('[AIHistoryManager] Error saving consult:', error);
            return [];
        }
    },

    /**
     * Obtiene todo el historial
     */
    getHistory: async () => {
        try {
            const historyStr = await AsyncStorage.getItem(AI_HISTORY_KEY);
            return historyStr ? JSON.parse(historyStr) : [];
        } catch (error) {
            console.error('[AIHistoryManager] Error getting history:', error);
            return [];
        }
    },

    /**
     * Limpia el historial
     */
    clearHistory: async () => {
        try {
            await AsyncStorage.removeItem(AI_HISTORY_KEY);
            return true;
        } catch (error) {
            return false;
        }
    }
};

export default AIHistoryManager;
