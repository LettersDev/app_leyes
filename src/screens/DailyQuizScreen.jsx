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
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { IconButton } from 'react-native-paper';
import { COLORS } from '../utils/constants';
import QuizService from '../services/quizService';
import StreakManager from '../utils/streakManager';
import ReviewService from '../services/reviewService';

const OPTION_COLORS = {
    default:   { bg: '#FFFFFF', border: '#E2E8F0', text: '#1E293B' },
    correct:   { bg: '#F0FDF4', border: '#16A34A', text: '#166534' },
    incorrect: { bg: '#FEF2F2', border: '#DC2626', text: '#991B1B' },
    disabled:  { bg: '#F8FAFC', border: '#CBD5E1', text: '#64748B' },
};

const initialState = {
    screenState: 'LOADING',
    quiz: null,
    streak: null,
    selectedOption: null,
    isCorrect: null,
    showExplanation: false,
};

function quizReducer(state, action) {
    switch (action.type) {
        case 'SET_INITIAL':
            return { 
                ...state, 
                quiz: action.quiz, 
                streak: action.streak, 
                screenState: action.screenState,
                selectedOption: action.selectedOption || null,
                isCorrect: action.isCorrect !== undefined ? action.isCorrect : null
            };
        case 'SET_LOADING':
            return { ...state, screenState: 'LOADING' };
        case 'SET_ERROR':
            return { ...state, screenState: 'NO_QUIZ' };
        case 'ANSWER_SUBMITTED':
            return { 
                ...state, 
                selectedOption: action.optionId, 
                isCorrect: action.isCorrect, 
                screenState: 'ANSWERED' 
            };
        case 'TOGGLE_EXPLANATION':
            return { ...state, showExplanation: action.value };
        case 'RESET':
            return initialState;
        default:
            return state;
    }
}

const DailyQuizScreen = ({ navigation }) => {
    const [state, dispatch] = React.useReducer(quizReducer, initialState);
    const { screenState, quiz, streak, selectedOption, isCorrect, showExplanation } = state;

    const shakeX = useSharedValue(0);
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shakeX.value }],
    }));
    
    const [todayStr, setTodayStr] = useState('');
    
    useEffect(() => {
        setTodayStr(new Date().toLocaleDateString('es-VE', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }));
        loadData();
    }, []);

    const loadData = async () => {
        dispatch({ type: 'SET_LOADING' });
        try {
            const [data, answered, currentStreak] = await Promise.all([
                QuizService.fetchTodayQuiz(),
                QuizService.hasAnsweredToday(),
                StreakManager.getStreak(),
            ]);

            if (!data) {
                dispatch({ type: 'SET_ERROR' });
                return;
            }

            let sState = 'QUESTION';
            let selOpt = null;
            let isCorr = null;

            if (answered && answered.quizId === data.id) {
                selOpt = answered.selectedOption;
                isCorr = answered.isCorrect;
                sState = 'ALREADY';
            }

            dispatch({ 
                type: 'SET_INITIAL', 
                quiz: data, 
                streak: currentStreak, 
                screenState: sState,
                selectedOption: selOpt,
                isCorrect: isCorr
            });
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
                withTiming(10, { duration: 50 }),
                withTiming(-10, { duration: 50 }),
                withTiming(10, { duration: 50 }),
                withTiming(0, { duration: 50 })
            );
        }

        await QuizService.submitAnswer(quiz.id, optionId, correct, streak?.currentStreak || 0);
        
        dispatch({ type: 'ANSWER_SUBMITTED', optionId, isCorrect: correct });
        
        // Registrar interacción de valor
        ReviewService.recordInteraction();
    };

    const getOptionStyle = (id) => {
        if (screenState === 'QUESTION') return OPTION_COLORS.default;
        if (id === quiz.correct_option) return OPTION_COLORS.correct;
        if (id === selectedOption && !isCorrect) return OPTION_COLORS.incorrect;
        return OPTION_COLORS.disabled;
    };

    if (screenState === 'LOADING') {
        return (
            <SafeAreaView style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.infoText}>Cargando evaluación técnica...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <View style={styles.headerTitleRow}>
                    <IconButton 
                        icon="arrow-left" 
                        iconColor={COLORS.text} 
                        onPress={() => navigation.goBack()} 
                        style={{ marginLeft: 0 }}
                    />
                    <Text style={styles.headerTitle} numberOfLines={1}>Evaluación Legal</Text>
                </View>
                <IconButton 
                    icon="history" 
                    iconColor={COLORS.primary} 
                    onPress={() => navigation.navigate('QuizHistory')} 
                    style={{ marginRight: 0 }}
                />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.dateCard}>
                    <Text style={styles.dateLabel}>Sesión de Consulta</Text>
                    <Text style={styles.dateValue}>{todayStr}</Text>
                </View>

                {quiz && (
                    <>
                        <View style={styles.lawCard}>
                            <Text style={styles.lawLabel}>Referencia Legislativa:</Text>
                            <Text style={styles.lawValue}>{quiz.law_title}</Text>
                        </View>

                        <Animated.View style={[styles.questionCard, animatedStyle]}>
                            <Text style={styles.questionText}>{quiz.question}</Text>
                        </Animated.View>

                        <View style={styles.optionsContainer}>
                            {quiz.options.map((opt, index) => {
                                const style = getOptionStyle(opt.id);
                                return (
                                    <Pressable
                                        key={opt.id || `opt-${index}`}
                                        style={({ pressed }) => [
                                            styles.option, 
                                            { backgroundColor: style.bg, borderColor: style.border },
                                            pressed && screenState === 'QUESTION' && { opacity: 0.7 }
                                        ]}
                                        onPress={() => handleAnswer(opt.id || opt)}
                                        disabled={screenState !== 'QUESTION'}
                                    >
                                        <Text style={[styles.optionId, { color: style.text }]}>
                                            {opt.id || String.fromCharCode(65 + index)}
                                        </Text>
                                        <Text style={[styles.optionText, { color: style.text }]}>
                                            {opt.text || opt}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </>
                )}

                {(screenState === 'ANSWERED' || screenState === 'ALREADY') && (
                    <>
                        <Pressable 
                            style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.8 }]} 
                            onPress={() => dispatch({ type: 'TOGGLE_EXPLANATION', value: true })}
                        >
                            <Text style={styles.actionButtonText}>Analizar Fundamentos Jurídicos</Text>
                        </Pressable>

                        <Pressable 
                            style={({ pressed }) => [
                                { marginTop: 20, padding: 10, alignSelf: 'center' },
                                pressed && { opacity: 0.7 }
                            ]} 
                            onPress={async () => {
                                await QuizService.clearTodayAnswer();
                                loadData();
                            }}
                        >
                            <Text style={{ color: '#64748B', fontSize: 13, textDecorationLine: 'underline' }}>
                                Reiniciar Evaluación (Solo Pruebas)
                            </Text>
                        </Pressable>
                    </>
                )}
            </ScrollView>

            <Modal visible={showExplanation} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Análisis Técnico</Text>
                            <IconButton icon="close" onPress={() => dispatch({ type: 'TOGGLE_EXPLANATION', value: false })} />
                        </View>
                        <ScrollView style={styles.modalScroll}>
                            <Text style={styles.explanationText}>{quiz?.explanation}</Text>
                            
                            <Pressable 
                                style={({ pressed }) => [
                                    styles.linkButton,
                                    pressed && { opacity: 0.8 }
                                ]} 
                                onPress={() => {
                                    dispatch({ type: 'TOGGLE_EXPLANATION', value: false });
                                    navigation.navigate('LawDetail', { 
                                        lawId: quiz.law_id, 
                                        initialItemId: quiz.law_item_id,
                                        initialItemNumber: quiz.article_number
                                    });
                                }}
                            >
                                <Text style={styles.linkButtonText}>Consultar Texto Íntegro</Text>
                            </Pressable>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        backgroundColor: '#FFF', 
        borderBottomWidth: 1, 
        borderBottomColor: '#E2E8F0',
        paddingHorizontal: 16,
    },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginLeft: -4 },
    scrollContent: { padding: 20 },
    dateCard: { marginBottom: 20 },
    dateLabel: { fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 },
    dateValue: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 4 },
    lawCard: { backgroundColor: '#F1F5F9', padding: 12, borderRadius: 8, marginBottom: 15 },
    lawLabel: { fontSize: 10, color: '#475569', fontWeight: '700' },
    lawValue: { fontSize: 13, color: COLORS.primary, marginTop: 2, fontWeight: '600', lineHeight: 18 },
    questionCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 20 },
    questionText: { fontSize: 16, color: COLORS.text, lineHeight: 24, fontWeight: '600' },
    optionsContainer: { gap: 12 },
    option: { flexDirection: 'row', padding: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', backgroundColor: '#FFF' },
    optionId: { fontSize: 15, fontWeight: '800', marginRight: 15 },
    optionText: { fontSize: 14, flex: 1, fontWeight: '500', lineHeight: 20 },
    actionButton: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 10, marginTop: 25, alignItems: 'center' },
    actionButtonText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { 
        backgroundColor: '#FFF', 
        borderTopLeftRadius: 24, 
        borderTopRightRadius: 24, 
        maxHeight: '85%', 
        padding: 24,
        paddingBottom: 40, // Espacio extra para el margen inferior
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
    explanationText: { fontSize: 16, color: '#334155', lineHeight: 26 },
    linkButton: { 
        marginTop: 30, 
        borderTopWidth: 1, 
        borderTopColor: '#F1F5F9', 
        paddingTop: 20,
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        paddingVertical: 12,
    },
    linkButtonText: { color: COLORS.primary, fontWeight: '700', textAlign: 'center' },
    infoText: { marginTop: 12, color: '#64748B', fontSize: 14, fontWeight: '500' }
});

export default DailyQuizScreen;
