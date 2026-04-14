import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
    LAW_OPENS: '@review_law_opens',     // Contador de leyes abiertas
    REVIEW_DONE: '@review_requested',   // Flag: ya se pidió la reseña
};

// Cuántas leyes debe abrir el usuario antes de pedir la reseña
const TRIGGER_AFTER_N_OPENS = 1;

const ReviewService = {
    /**
     * Llamar cada vez que el usuario entra a una ley.
     * En la 5ª apertura (y solo esa vez) lanza el diálogo nativo de Play Store.
     */
    recordLawOpen: async () => {
        try {
            // Si ya pedimos reseña, no hacer nada más
            const alreadyDone = await AsyncStorage.getItem(KEYS.REVIEW_DONE);
            if (alreadyDone) return;

            // Incrementar el contador
            const current = await AsyncStorage.getItem(KEYS.LAW_OPENS);
            const count = current ? parseInt(current, 10) + 1 : 1;
            await AsyncStorage.setItem(KEYS.LAW_OPENS, String(count));

            console.log(`[ReviewService] Leyes abiertas: ${count}/${TRIGGER_AFTER_N_OPENS}`);

            // Disparar en el umbral exacto
            if (count >= TRIGGER_AFTER_N_OPENS) {
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
        await AsyncStorage.removeItem(KEYS.LAW_OPENS);
        await AsyncStorage.removeItem(KEYS.REVIEW_DONE);
        console.log('[ReviewService] Estado reseteado.');
    },
};

export default ReviewService;
