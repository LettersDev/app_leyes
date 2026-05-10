import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    ActivityIndicator,
    Modal,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSequence,
    withTiming,
    withSpring,
    Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { IconButton } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../utils/constants';
import QuizService from '../services/quizService';
import StreakManager from '../utils/streakManager';
import ReviewService from '../services/reviewService';
import { supabase } from '../config/supabase';

const DEVICE_TOKEN_KEY = '@push_token';

// ─── Colores por estado de opción ────────────────────────────────────────────
const OPTION_STATES = {
    default:   { bg: '#FFFFFF', border: '#E2E8F0', text: '#1E293B', idBg: '#F1F5F9', idText: '#475569' },
    correct:   { bg: '#F0FDF4', border: '#16A34A', text: '#166534', idBg: '#16A34A', idText: '#FFFFFF' },
    incorrect: { bg: '#FEF2F2', border: '#DC2626', text: '#991B1B', idBg: '#DC2626', idText: '#FFFFFF' },
    disabled:  { bg: '#F8FAFC', border: '#E2E8F0', text: '#94A3B8', idBg: '#F1F5F9', idText: '#94A3B8' },
};

const initialState = {
    screenState: 'LOADING',
    quiz: null,
    streak: null,
    selectedOption: null,
    isCorrect: null,
    showExplanation: false,
    userStats: null,   // { correctas, incorrectas, total }
};

function quizReducer(state, action) {
    switch (action.type) {
        case 'SET_INITIAL':
            return { ...state, quiz: action.quiz, streak: action.streak, screenState: action.screenState, selectedOption: action.selectedOption || null, isCorrect: action.isCorrect !== undefined ? action.isCorrect : null, userStats: action.userStats || null };
        case 'SET_LOADING':
            return { ...state, screenState: 'LOADING' };
        case 'SET_ERROR':
            return { ...state, screenState: 'NO_QUIZ' };
        case 'ANSWER_SUBMITTED':
            return { ...state, selectedOption: action.optionId, isCorrect: action.isCorrect, screenState: 'ANSWERED' };
        case 'TOGGLE_EXPLANATION':
            return { ...state, showExplanation: action.value };
        case 'RESET':
            return initialState;
        default:
            return state;
    }
}

// ─── Componente Racha ─────────────────────────────────────────────────────────
const StreakBadge = ({ streak }) => {
    if (!streak) return null;
    const count = streak.currentStreak || 0;
    return (
        <View style={styles.streakBadge}>
            <Text style={styles.streakIcon}>🔥</Text>
            <Text style={styles.streakCount}>{count}</Text>
        </View>
    );
};

// ─── Componente Resultado ─────────────────────────────────────────────────────
const ResultBanner = ({ isCorrect }) => {
    if (isCorrect === null) return null;
    return (
        <View style={[styles.resultBanner, isCorrect ? styles.resultBannerCorrect : styles.resultBannerIncorrect]}>
            <Text style={styles.resultEmoji}>{isCorrect ? '✅' : '❌'}</Text>
            <View>
                <Text style={[styles.resultTitle, { color: isCorrect ? '#166534' : '#991B1B' }]}>
                    {isCorrect ? '¡Correcto!' : 'Incorrecto'}
                </Text>
                <Text style={[styles.resultSub, { color: isCorrect ? '#166534' : '#991B1B' }]}>
                    {isCorrect ? 'Excelente dominio de la legislación.' : 'Revisa los fundamentos jurídicos.'}
                </Text>
            </View>
        </View>
    );
};

// ─── Pantalla Principal ───────────────────────────────────────────────────────
const DailyQuizScreen = ({ navigation, route }) => {
    const [state, dispatch] = React.useReducer(quizReducer, initialState);
    const { screenState, quiz, streak, selectedOption, isCorrect, showExplanation, userStats } = state;
    const quizIdFromHistory = route?.params?.quizId || null;
    const deviceTokenRef = useRef(null);

    const shakeX = useSharedValue(0);
    const resultScale = useSharedValue(0);

    const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
    const resultStyle = useAnimatedStyle(() => ({ transform: [{ scale: resultScale.value }] }));

    const [todayStr, setTodayStr] = useState('');

    useEffect(() => {
        setTodayStr(new Date().toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' }));
        loadData();
    }, []);

    const loadData = async () => {
        dispatch({ type: 'SET_LOADING' });
        try {
            // Obtener token del dispositivo (guardado por NotificationService)
            const token = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
            deviceTokenRef.current = token;

            let data;
            if (quizIdFromHistory) {
                const { data: histQuiz } = await supabase.from('daily_quizzes').select('*').eq('id', quizIdFromHistory).single();
                if (histQuiz && typeof histQuiz.options === 'string') histQuiz.options = JSON.parse(histQuiz.options);
                data = histQuiz;
            } else {
                data = await QuizService.fetchTodayQuiz();
            }

            const [answered, currentStreak] = await Promise.all([
                QuizService.hasAnsweredToday(),
                StreakManager.getStreak(),
            ]);

            // Obtener estadísticas del usuario si tiene token
            let userStats = null;
            if (token) {
                const { data: statsRows } = await supabase
                    .from('quiz_responses')
                    .select('is_correct')
                    .eq('device_token', token);
                if (statsRows && statsRows.length > 0) {
                    const correctas = statsRows.filter(r => r.is_correct).length;
                    userStats = {
                        correctas,
                        incorrectas: statsRows.length - correctas,
                        total: statsRows.length,
                    };
                }
            }

            if (!data) { dispatch({ type: 'SET_ERROR' }); return; }

            let sState = 'QUESTION';
            let selOpt = null;
            let isCorr = null;

            // 1. Para el quiz de hoy: verificar AsyncStorage primero (rápido)
            if (answered && answered.quizId === data.id) {
                selOpt = answered.selectedOption;
                isCorr = answered.isCorrect;
                sState = 'ALREADY';
            }

            // 2. Para quizzes históricos (o si el AsyncStorage fue limpiado):
            //    verificar en la DB si este dispositivo ya respondió este quiz
            if (sState === 'QUESTION' && token && data.id) {
                const { data: existingResponse } = await supabase
                    .from('quiz_responses')
                    .select('selected_option, is_correct')
                    .eq('quiz_id', data.id)
                    .eq('device_token', token)
                    .maybeSingle();

                if (existingResponse) {
                    selOpt = existingResponse.selected_option;
                    isCorr = existingResponse.is_correct;
                    sState = 'ALREADY';
                }
            }

            dispatch({ type: 'SET_INITIAL', quiz: data, streak: currentStreak, screenState: sState, selectedOption: selOpt, isCorrect: isCorr, userStats });
        } catch (e) {
            console.error('[QuizScreen] Error:', e.message);
            dispatch({ type: 'SET_ERROR' });
        }
    };

    const handleAnswer = async (optionId) => {
        if (screenState !== 'QUESTION') return;
        const correct = optionId === quiz.correct_option;

        if (!correct) {
            shakeX.value = withSequence(
                withTiming(12, { duration: 60 }),
                withTiming(-12, { duration: 60 }),
                withTiming(8, { duration: 60 }),
                withTiming(-8, { duration: 60 }),
                withTiming(0, { duration: 60 })
            );
        } else {
            resultScale.value = withSpring(1, { damping: 8, stiffness: 200 });
        }

        // Pasa el device token para evitar respuestas duplicadas
        await QuizService.submitAnswer(quiz.id, optionId, correct, streak?.currentStreak || 0, deviceTokenRef.current);
        dispatch({ type: 'ANSWER_SUBMITTED', optionId, isCorrect: correct });
        ReviewService.recordInteraction();
    };

    const getOptionState = (id) => {
        if (screenState === 'QUESTION') return OPTION_STATES.default;
        if (id === quiz.correct_option) return OPTION_STATES.correct;
        if (id === selectedOption && !isCorrect) return OPTION_STATES.incorrect;
        return OPTION_STATES.disabled;
    };

    // ── LOADING ───────────────────────────────────────────────────────────────
    if (screenState === 'LOADING') {
        return (
            <LinearGradient colors={['#0F172A', '#1E293B']} style={styles.loadingScreen}>
                <ActivityIndicator size="large" color={COLORS.accent} />
                <Text style={styles.loadingText}>Cargando evaluación...</Text>
            </LinearGradient>
        );
    }

    // ── SIN QUIZ ──────────────────────────────────────────────────────────────
    if (screenState === 'NO_QUIZ') {
        return (
            <LinearGradient colors={['#0F172A', '#1E293B']} style={styles.loadingScreen}>
                <IconButton icon="calendar-clock" size={56} iconColor="#475569" style={{ margin: 0 }} />
                <Text style={[styles.loadingText, { fontSize: 20, marginTop: 12, fontWeight: '700', color: '#CBD5E1' }]}>Sin evaluación hoy</Text>
                <Text style={{ color: '#94A3B8', fontSize: 14, textAlign: 'center', marginTop: 8, paddingHorizontal: 40, lineHeight: 22 }}>
                    La evaluación se genera automáticamente cada mañana. Vuelve mañana para continuar tu racha.
                </Text>
                <Pressable
                    style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.8 }]}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.backButtonText}>Volver al inicio</Text>
                </Pressable>
            </LinearGradient>
        );
    }

    // ── PREGUNTA / RESPONDIDA ─────────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            {/* Header con Gradiente */}
            <LinearGradient colors={['#0F172A', '#1E293B']} style={styles.header}>
                <View style={styles.headerRow}>
                    <Pressable
                        onPress={() => navigation.goBack()}
                        style={({ pressed }) => [styles.headerBackBtn, pressed && { opacity: 0.7 }]}
                    >
                        <IconButton icon="arrow-left" iconColor="#FFFFFF" size={22} style={{ margin: 0 }} />
                    </Pressable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTag}>EVALUACIÓN DIARIA</Text>
                        <Text style={styles.headerDate}>{todayStr}</Text>
                    </View>
                    <View style={styles.headerRight}>
                        <StreakBadge streak={streak} />
                        <Pressable
                            onPress={() => navigation.navigate('QuizHistory')}
                            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                        >
                            <IconButton icon="history" iconColor="#94A3B8" size={22} style={{ margin: 0 }} />
                        </Pressable>
                    </View>
                </View>
                {/* Stats bar */}
                {userStats && (
                    <View style={styles.statsBar}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{userStats.correctas}</Text>
                            <Text style={styles.statLabel}>Correctas</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={[styles.statValue, { color: '#F87171' }]}>{userStats.incorrectas}</Text>
                            <Text style={styles.statLabel}>Incorrectas</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={[styles.statValue, { color: '#FCD34D' }]}>{userStats.total}</Text>
                            <Text style={styles.statLabel}>Total</Text>
                        </View>
                    </View>
                )}
            </LinearGradient>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* Referencia Legal */}
                {quiz && (
                    <View style={styles.lawRefCard}>
                        <View style={styles.lawRefIcon}>
                            <IconButton icon="scale-balance" size={20} iconColor={COLORS.primary} style={{ margin: 0 }} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.lawRefLabel}>REFERENCIA LEGISLATIVA</Text>
                            <Text style={styles.lawRefValue}>{quiz.law_title}</Text>
                        </View>
                    </View>
                )}

                {/* Resultado banner */}
                {(screenState === 'ANSWERED' || screenState === 'ALREADY') && (
                    <Animated.View style={resultStyle}>
                        <ResultBanner isCorrect={isCorrect} />
                    </Animated.View>
                )}

                {/* Pregunta */}
                {quiz && (
                    <Animated.View style={[styles.questionCard, shakeStyle]}>
                        <Text style={styles.questionLabel}>CASO PRÁCTICO</Text>
                        <Text style={styles.questionText}>{quiz.question}</Text>
                    </Animated.View>
                )}

                {/* Opciones */}
                {quiz && (
                    <View style={styles.optionsContainer}>
                        {quiz.options.map((opt, index) => {
                            const s = getOptionState(opt.id);
                            const isSelected = selectedOption === opt.id;
                            const isCorrectOpt = opt.id === quiz.correct_option;
                            const showCheck = (screenState === 'ANSWERED' || screenState === 'ALREADY') && isCorrectOpt;
                            return (
                                <Pressable
                                    key={opt.id || `opt-${index}`}
                                    style={({ pressed }) => [
                                        styles.option,
                                        { backgroundColor: s.bg, borderColor: s.border },
                                        pressed && screenState === 'QUESTION' && { transform: [{ scale: 0.98 }] }
                                    ]}
                                    onPress={() => handleAnswer(opt.id || opt)}
                                    disabled={screenState !== 'QUESTION'}
                                >
                                    <View style={[styles.optionBadge, { backgroundColor: s.idBg }]}>
                                        <Text style={[styles.optionBadgeText, { color: s.idText }]}>
                                            {showCheck ? '✓' : (opt.id || String.fromCharCode(65 + index))}
                                        </Text>
                                    </View>
                                    <Text style={[styles.optionText, { color: s.text }]}>
                                        {opt.text || opt}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                )}

                {/* Acciones post-respuesta */}
                {(screenState === 'ANSWERED' || screenState === 'ALREADY') && (
                    <View style={styles.actionsContainer}>
                        <Pressable
                            style={({ pressed }) => [styles.primaryAction, pressed && { opacity: 0.85 }]}
                            onPress={() => dispatch({ type: 'TOGGLE_EXPLANATION', value: true })}
                        >
                            <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.primaryActionGradient}>
                                <Text style={styles.primaryActionText}>Ver Fundamentos Jurídicos</Text>
                            </LinearGradient>
                        </Pressable>

                        {__DEV__ && (
                            <Pressable
                                style={({ pressed }) => [styles.devButton, pressed && { opacity: 0.7 }]}
                                onPress={async () => { await QuizService.clearTodayAnswer(); loadData(); }}
                            >
                                <Text style={styles.devButtonText}>🔄 Reiniciar (solo dev)</Text>
                            </Pressable>
                        )}
                    </View>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Modal Explicación */}
            <Modal visible={showExplanation} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {/* Handle */}
                        <View style={styles.modalHandle} />

                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTag}>ANÁLISIS JURÍDICO</Text>
                                <Text style={styles.modalTitle}>Fundamentos del Caso</Text>
                            </View>
                            <Pressable
                                onPress={() => dispatch({ type: 'TOGGLE_EXPLANATION', value: false })}
                                style={({ pressed }) => [styles.modalClose, pressed && { opacity: 0.7 }]}
                            >
                                <IconButton icon="close" size={20} iconColor="#64748B" style={{ margin: 0 }} />
                            </Pressable>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.explanationText}>{quiz?.explanation}</Text>

                            <Pressable
                                style={({ pressed }) => [styles.linkButton, pressed && { opacity: 0.8 }]}
                                onPress={() => {
                                    dispatch({ type: 'TOGGLE_EXPLANATION', value: false });
                                    navigation.navigate('LawDetail', {
                                        lawId: quiz.law_id,
                                        initialItemId: quiz.law_item_id,
                                        initialItemNumber: quiz.article_number
                                    });
                                }}
                            >
                            <Text style={styles.linkButtonText}>Consultar Artículo Completo</Text>
                            </Pressable>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    // ── Contenedores base ─────────────────────────────────────────────────────
    container: { flex: 1, backgroundColor: '#F1F5F9' },
    loadingScreen: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { color: '#94A3B8', fontSize: 15, marginTop: 16 },

    // ── Header ────────────────────────────────────────────────────────────────
    header: { paddingHorizontal: 8, paddingVertical: 12, paddingBottom: 16 },

    // ── Stats Bar ─────────────────────────────────────────────────────────────
    statsBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', marginTop: 12, paddingTop: 12 },
    statItem: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 20, fontWeight: '800', color: '#4ADE80' },
    statLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600', letterSpacing: 0.5, marginTop: 2 },
    statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.1)' },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerBackBtn: { padding: 4 },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTag: { fontSize: 10, color: COLORS.accent, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' },
    headerDate: { fontSize: 13, color: '#CBD5E1', marginTop: 2, fontWeight: '500' },
    headerRight: { flexDirection: 'row', alignItems: 'center' },

    // ── Racha ─────────────────────────────────────────────────────────────────
    streakBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginRight: 4 },
    streakIcon: { fontSize: 14 },
    streakCount: { fontSize: 14, fontWeight: '800', color: '#FCD34D', marginLeft: 4 },

    // ── Scroll ────────────────────────────────────────────────────────────────
    scrollContent: { padding: 16, paddingTop: 20 },

    // ── Referencia Legal ──────────────────────────────────────────────────────
    lawRefCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0', boxShadow: '0px 1px 3px rgba(0,0,0,0.06)' },
    lawRefIcon: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    lawRefLabel: { fontSize: 9, color: '#94A3B8', fontWeight: '800', letterSpacing: 1.5 },
    lawRefValue: { fontSize: 13, color: COLORS.primary, fontWeight: '700', marginTop: 2, lineHeight: 18 },

    // ── Resultado ─────────────────────────────────────────────────────────────
    resultBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 16, marginBottom: 16, gap: 14, borderWidth: 1 },
    resultBannerCorrect: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
    resultBannerIncorrect: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
    resultEmoji: { fontSize: 28 },
    resultTitle: { fontSize: 16, fontWeight: '800' },
    resultSub: { fontSize: 13, marginTop: 2, opacity: 0.8 },

    // ── Pregunta ──────────────────────────────────────────────────────────────
    questionCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#E2E8F0', boxShadow: '0px 2px 6px rgba(0,0,0,0.06)' },
    questionLabel: { fontSize: 9, color: COLORS.accent, fontWeight: '900', letterSpacing: 2, marginBottom: 10 },
    questionText: { fontSize: 16, color: '#0F172A', lineHeight: 26, fontWeight: '600' },

    // ── Opciones ──────────────────────────────────────────────────────────────
    optionsContainer: { gap: 10, marginBottom: 8 },
    option: { flexDirection: 'row', padding: 14, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', backgroundColor: '#FFF' },
    optionBadge: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    optionBadgeText: { fontSize: 14, fontWeight: '900' },
    optionText: { fontSize: 14, flex: 1, fontWeight: '500', lineHeight: 20 },

    // ── Acciones ──────────────────────────────────────────────────────────────
    actionsContainer: { marginTop: 20, gap: 12 },
    primaryAction: { borderRadius: 14, overflow: 'hidden' },
    primaryActionGradient: { padding: 16, alignItems: 'center' },
    primaryActionText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
    devButton: { alignSelf: 'center', padding: 10 },
    devButtonText: { color: '#94A3B8', fontSize: 13 },
    backButton: { marginTop: 28, backgroundColor: 'rgba(255,255,255,0.1)', paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
    backButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

    // ── Modal ─────────────────────────────────────────────────────────────────
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%', padding: 24, paddingBottom: 48, flexDirection: 'column' },
    modalHandle: { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    modalTag: { fontSize: 9, color: COLORS.accent, fontWeight: '900', letterSpacing: 2 },
    modalTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 4 },
    modalClose: { backgroundColor: '#F1F5F9', borderRadius: 10 },
    explanationText: { fontSize: 15, color: '#334155', lineHeight: 26, marginBottom: 28 },
    linkButton: { backgroundColor: COLORS.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
    linkButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});

export default DailyQuizScreen;
