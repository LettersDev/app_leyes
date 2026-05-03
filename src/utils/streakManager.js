/**
 * streakManager.js
 *
 * Gestiona la racha de respuestas correctas del usuario en el Quiz Legal Diario.
 *
 * Reglas de racha (confirmadas):
 *  ✅ Responde CORRECTO  → currentStreak++
 *  ❌ Responde INCORRECTO → currentStreak = 0
 *  ⏭️  No responde un día → la racha NO se afecta
 *
 * Estructura guardada en AsyncStorage (@quiz_streak):
 * {
 *   currentStreak: number,   // racha actual de respuestas correctas
 *   longestStreak: number,   // récord histórico
 *   totalAnswered: number,   // total de preguntas respondidas
 *   totalCorrect: number,    // total de respuestas correctas
 * }
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STREAK_KEY = '@quiz_streak';

const DEFAULT_STREAK = {
    currentStreak: 0,
    longestStreak: 0,
    totalAnswered: 0,
    totalCorrect: 0,
};

const StreakManager = {
    /**
     * Obtiene el objeto de racha actual del usuario.
     * @returns {Promise<object>} datos de racha
     */
    getStreak: async () => {
        try {
            const raw = await AsyncStorage.getItem(STREAK_KEY);
            if (!raw) return { ...DEFAULT_STREAK };
            return { ...DEFAULT_STREAK, ...JSON.parse(raw) };
        } catch (e) {
            console.warn('[StreakManager] Error al leer racha:', e.message);
            return { ...DEFAULT_STREAK };
        }
    },

    /**
     * Registra la respuesta del usuario y actualiza la racha.
     *
     * @param {boolean} isCorrect - Si el usuario respondió correctamente
     * @returns {Promise<object>} datos de racha actualizados
     */
    recordAnswer: async (isCorrect) => {
        try {
            const streak = await StreakManager.getStreak();

            streak.totalAnswered += 1;

            if (isCorrect) {
                streak.currentStreak += 1;
                streak.totalCorrect += 1;

                // Actualizar récord histórico
                if (streak.currentStreak > streak.longestStreak) {
                    streak.longestStreak = streak.currentStreak;
                }
            } else {
                // Solo se rompe al responder MAL
                streak.currentStreak = 0;
            }

            await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(streak));
            return streak;
        } catch (e) {
            console.warn('[StreakManager] Error al guardar racha:', e.message);
            return await StreakManager.getStreak();
        }
    },

    /**
     * Resetea la racha completamente (uso interno/debug).
     * @returns {Promise<void>}
     */
    resetStreak: async () => {
        try {
            await AsyncStorage.setItem(STREAK_KEY, JSON.stringify({ ...DEFAULT_STREAK }));
        } catch (e) {
            console.warn('[StreakManager] Error al resetear racha:', e.message);
        }
    },

    /**
     * Calcula el porcentaje de aciertos del usuario.
     * @param {object} streak - Objeto de racha
     * @returns {number} Porcentaje (0-100)
     */
    getAccuracyPercent: (streak) => {
        if (!streak || streak.totalAnswered === 0) return 0;
        return Math.round((streak.totalCorrect / streak.totalAnswered) * 100);
    },
};

export default StreakManager;
