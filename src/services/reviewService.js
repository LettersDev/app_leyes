import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
    INTERACTIONS: '@review_interactions',
    LAST_REQUEST: '@review_last_request_ts',
};

const THRESHOLD = 5;
const COOLDOWN_DAYS = 15;

const ReviewService = {
    /**
     * Registra una interacción de valor (abrir ley, buscar, quiz, IA, favorito).
     * Dispara el diálogo al llegar al umbral si el cooldown lo permite.
     */
    recordInteraction: async () => {
        try {
            // 1. Verificar cooldown
            const lastRequest = await AsyncStorage.getItem(KEYS.LAST_REQUEST);
            if (lastRequest) {
                const lastTs = parseInt(lastRequest, 10);
                const now = Date.now();
                const daysSince = (now - lastTs) / (1000 * 60 * 60 * 24);
                
                if (daysSince < COOLDOWN_DAYS) {
                    return; // Todavía en periodo de enfriamiento
                }
            }

            // 2. Incrementar contador
            const current = await AsyncStorage.getItem(KEYS.INTERACTIONS);
            const count = current ? parseInt(current, 10) + 1 : 1;
            await AsyncStorage.setItem(KEYS.INTERACTIONS, String(count));

            console.log(`[ReviewService] Interacción registrada: ${count}/${THRESHOLD}`);

            // 3. Disparar si llegamos al umbral
            if (count >= THRESHOLD) {
                await ReviewService.requestReview();
            }
        } catch (e) {
            console.warn('[ReviewService] Error:', e.message);
        }
    },

    /**
     * Mantiene compatibilidad con llamadas viejas pero usa la nueva lógica.
     */
    recordLawClose: async () => {
        await ReviewService.recordInteraction();
    },

    /**
     * Solicita la reseña nativa si está disponible.
     */
    requestReview: async () => {
        try {
            const isAvailable = await StoreReview.isAvailableAsync();
            if (!isAvailable) {
                console.log('[ReviewService] In-App Review no disponible en este dispositivo.');
                return;
            }

            // Guardar timestamp del intento y resetear contador para el próximo ciclo
            // Nota: Se hace ANTES del diálogo para evitar spam si hay errores
            await AsyncStorage.setItem(KEYS.LAST_REQUEST, String(Date.now()));
            await AsyncStorage.setItem(KEYS.INTERACTIONS, '0');

            await StoreReview.requestReview();
            console.log('[ReviewService] Diálogo de reseña lanzado ✓');
        } catch (e) {
            console.warn('[ReviewService] Error al solicitar reseña:', e.message);
        }
    },

    /**
     * Solo para desarrollo/testing: resetea el estado del servicio.
     */
    reset: async () => {
        await AsyncStorage.removeItem(KEYS.INTERACTIONS);
        await AsyncStorage.removeItem(KEYS.LAST_REQUEST);
        await AsyncStorage.removeItem('@review_law_closes'); // Limpieza v1
        await AsyncStorage.removeItem('@review_requested'); // Limpieza v1
        console.log('[ReviewService] Estado reseteado para pruebas.');
    },
};

export default ReviewService;

