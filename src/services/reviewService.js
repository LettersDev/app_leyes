import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
    LAW_CLOSES: '@review_law_closes',   // Contador de leyes cerradas
    REVIEW_DONE: '@review_requested',   // Flag: ya se pidió la reseña
};

// Cuántas leyes debe cerrar el usuario antes de pedir la reseña
const TRIGGER_AFTER_N_CLOSES = 3;

const ReviewService = {
    /**
     * Llamar cada vez que el usuario CIERRA una ley (desmonta la pantalla).
     * En el 3er cierre (y solo esa vez) lanza el diálogo nativo de Play Store.
     */
    recordLawClose: async () => {
        try {
            // Si ya pedimos reseña, no hacer nada más
            const alreadyDone = await AsyncStorage.getItem(KEYS.REVIEW_DONE);
            if (alreadyDone) return;

            // Incrementar el contador
            const current = await AsyncStorage.getItem(KEYS.LAW_CLOSES);
            const count = current ? parseInt(current, 10) + 1 : 1;
            await AsyncStorage.setItem(KEYS.LAW_CLOSES, String(count));

            console.log(`[ReviewService] Leyes cerradas: ${count}/${TRIGGER_AFTER_N_CLOSES}`);

            // Disparar en el umbral exacto
            if (count >= TRIGGER_AFTER_N_CLOSES) {
                await ReviewService.requestReview();
            }
        } catch (e) {
            // Silencioso: nunca romper la UX por esto
            console.warn('[ReviewService] Error:', e.message);
        }
    },

    /**
     * Solicita la reseña nativa si está disponible.
     * En Android usa la Google Play In-App Review API.
     * En simuladores no hace nada.
     */
    requestReview: async () => {
        try {
            const isAvailable = await StoreReview.isAvailableAsync();
            if (!isAvailable) {
                console.log('[ReviewService] In-App Review no disponible en este dispositivo.');
                return;
            }

            // Marcar como solicitada ANTES de mostrar (evita condición de carrera)
            await AsyncStorage.setItem(KEYS.REVIEW_DONE, 'true');

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
        await AsyncStorage.removeItem(KEYS.LAW_CLOSES);
        await AsyncStorage.removeItem(KEYS.REVIEW_DONE);
        console.log('[ReviewService] Estado reseteado.');
    },
};

export default ReviewService;
