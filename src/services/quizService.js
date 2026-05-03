/**
 * quizService.js
 *
 * Servicio para el Quiz Legal Diario.
 * La app NUNCA llama a IA directamente — solo lee/escribe en Supabase.
 * Las preguntas son pre-generadas por la Edge Function 'generate-daily-quiz'.
 *
 * Funciones:
 *  - fetchTodayQuiz()             → trae el quiz del día
 *  - hasAnsweredToday()           → verifica si ya respondió hoy
 *  - submitAnswer(quizId, option, streak) → guarda respuesta en quiz_responses
 *  - getTodayDateString()         → helper de fecha local
 */

import { supabase } from '../config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ANSWERED_KEY_PREFIX = '@quiz_answered_'; // + fecha YYYY-MM-DD

const QuizService = {

    /**
     * Retorna la fecha de hoy en formato YYYY-MM-DD (hora local).
     * Importante: usamos la hora local del dispositivo, no UTC.
     * @returns {string}
     */
    getTodayDateString: () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    /**
     * Trae el quiz del día desde Supabase.
     * Retorna null si no hay quiz para hoy (Edge Function aún no corrió).
     *
     * @returns {Promise<object|null>} Quiz del día o null
     */
    fetchTodayQuiz: async () => {
        try {
            const today = QuizService.getTodayDateString();

            const { data, error } = await supabase
                .from('daily_quizzes')
                .select('*')
                .eq('date', today)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    // No hay quiz para hoy todavía
                    console.log('[QuizService] No hay quiz para hoy:', today);
                    return null;
                }
                console.warn('[QuizService] Error fetching quiz:', error.message);
                return null;
            }

            // Parsear options si viene como string
            if (data && typeof data.options === 'string') {
                data.options = JSON.parse(data.options);
            }

            return data;
        } catch (e) {
            console.warn('[QuizService] Exception fetchTodayQuiz:', e.message);
            return null;
        }
    },

    /**
     * Verifica si el usuario ya respondió la pregunta de hoy.
     * Se guarda localmente en AsyncStorage para evitar llamadas a la DB.
     *
     * @returns {Promise<object|null>} Datos de la respuesta guardada o null
     */
    hasAnsweredToday: async () => {
        try {
            const today = QuizService.getTodayDateString();
            const raw = await AsyncStorage.getItem(`${ANSWERED_KEY_PREFIX}${today}`);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            console.warn('[QuizService] Error checking answered today:', e.message);
            return null;
        }
    },

    /**
     * Guarda la respuesta del usuario.
     * - Marca localmente (AsyncStorage) que ya respondió hoy.
     * - Envía la respuesta a Supabase para analytics.
     *
     * @param {string} quizId       - UUID del quiz
     * @param {string} selectedOption - "A", "B", "C" o "D"
     * @param {boolean} isCorrect   - Si la respuesta es correcta
     * @param {number} streakAtTime - Racha actual al momento de responder
     * @param {string|null} deviceToken - Push token del usuario (puede ser null)
     * @returns {Promise<void>}
     */
    submitAnswer: async (quizId, selectedOption, isCorrect, streakAtTime, deviceToken = null) => {
        try {
            const today = QuizService.getTodayDateString();

            // 1. Guardar localmente para evitar responder dos veces
            const answerData = {
                quizId,
                selectedOption,
                isCorrect,
                answeredAt: new Date().toISOString(),
            };
            await AsyncStorage.setItem(
                `${ANSWERED_KEY_PREFIX}${today}`,
                JSON.stringify(answerData)
            );

            // 2. Enviar a Supabase (analytics — no bloquea si falla)
            const { error } = await supabase
                .from('quiz_responses')
                .insert({
                    quiz_id: quizId,
                    device_token: deviceToken,
                    selected_option: selectedOption,
                    is_correct: isCorrect,
                    streak_at_time: streakAtTime,
                });

            if (error) {
                // No crítico — la respuesta ya está guardada localmente
                console.warn('[QuizService] Error guardando respuesta en DB:', error.message);
            }
        } catch (e) {
            console.warn('[QuizService] Exception submitAnswer:', e.message);
        }
    },

    /**
     * Recupera el histórico de quizzes generados.
     * @returns {Promise<Array>} Lista de quizzes anteriores.
     */
    fetchQuizHistory: async () => {
        try {
            const { data, error } = await supabase
                .from('daily_quizzes')
                .select('*')
                .order('date', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('[QuizService] Error al recuperar historial:', e.message);
            return [];
        }
    },

    /**
     * Limpia las respuestas antiguas de AsyncStorage (> 30 días).
     * Llamar ocasionalmente para no acumular datos.
     * @returns {Promise<void>}
     */
    cleanOldAnswers: async () => {
        try {
            const allKeys = await AsyncStorage.getAllKeys();
            const quizKeys = allKeys.filter(k => k.startsWith(ANSWERED_KEY_PREFIX));

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const keysToDelete = quizKeys.filter(key => {
                const dateStr = key.replace(ANSWERED_KEY_PREFIX, '');
                const keyDate = new Date(dateStr);
                return keyDate < thirtyDaysAgo;
            });

            if (keysToDelete.length > 0) {
                await AsyncStorage.multiRemove(keysToDelete);
                console.log('[QuizService] Limpiadas', keysToDelete.length, 'respuestas antiguas');
            }
        } catch (e) {
            console.warn('[QuizService] Error en cleanOldAnswers:', e.message);
        }
    },

    clearTodayAnswer: async () => {
        const today = new Date().toISOString().split('T')[0];
        // Nota: El prefijo suele ser '@daily_quiz_answered_'
        await AsyncStorage.removeItem('@daily_quiz_answered_' + today);
    }
};

export default QuizService;
