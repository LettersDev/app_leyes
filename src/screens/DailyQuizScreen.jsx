import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Modal,
    Animated,
    Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { IconButton } from 'react-native-paper';
import { COLORS } from '../utils/constants';
import QuizService from '../services/quizService';
import StreakManager from '../utils/streakManager';

const OPTION_COLORS = {
    default:   { bg: '#FFFFFF', border: '#E2E8F0', text: '#1E293B' },
    correct:   { bg: '#F0FDF4', border: '#16A34A', text: '#166534' },
    incorrect: { bg: '#FEF2F2', border: '#DC2626', text: '#991B1B' },
    disabled:  { bg: '#F8FAFC', border: '#CBD5E1', text: '#64748B' },
};

const DailyQuizScreen = ({ navigation }) => {
    const [screenState, setScreenState] = useState('LOADING');
    const [quiz, setQuiz] = useState(null);
    const [streak, setStreak] = useState(null);
    const [selectedOption, setSelectedOption] = useState(null);
    const [isCorrect, setIsCorrect] = useState(null);
    const [showExplanation, setShowExplanation] = useState(false);

    const shakeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setScreenState('LOADING');
        try {
            const [data, answered, currentStreak] = await Promise.all([
                QuizService.fetchTodayQuiz(),
                QuizService.hasAnsweredToday(),
                StreakManager.getStreak(),
            ]);

            setStreak(currentStreak);
            if (!data) {
                setScreenState('NO_QUIZ');
                return;
            }

            setQuiz(data);
            if (answered && answered.quizId === data.id) {
                setSelectedOption(answered.selectedOption);
                setIsCorrect(answered.isCorrect);
                setScreenState('ALREADY');
            } else {
                setScreenState('QUESTION');
            }
        } catch (e) {
            console.error('[QuizScreen] Error:', e.message);
            setScreenState('NO_QUIZ');
        }
    };

    const handleAnswer = async (optionId) => {
        if (screenState !== 'QUESTION') return;

        const correct = optionId === quiz.correct_option;
        setSelectedOption(optionId);
        setIsCorrect(correct);

        if (!correct) {
            Animated.sequence([
                Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
                Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
                Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
            ]).start();
        }

        await QuizService.submitAnswer(quiz.id, optionId, correct, streak?.currentStreak || 0);
        setScreenState('ANSWERED');
    };

    const getOptionStyle = (id) => {
        if (screenState === 'QUESTION') return OPTION_COLORS.default;
        if (id === quiz.correct_option) return OPTION_COLORS.correct;
        if (id === selectedOption && !isCorrect) return OPTION_COLORS.incorrect;
        return OPTION_COLORS.disabled;
    };

    if (screenState === 'LOADING') {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.infoText}>Cargando evaluación técnica...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <View style={styles.header}>
                <View style={styles.headerTitleRow}>
                    <IconButton icon="arrow-left" iconColor={COLORS.text} onPress={() => navigation.goBack()} />
                    <Text style={styles.headerTitle}>Evaluación Legal</Text>
                </View>
                <IconButton icon="history" iconColor={COLORS.primary} onPress={() => navigation.navigate('QuizHistory')} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.dateCard}>
                    <Text style={styles.dateLabel}>Sesión de Consulta</Text>
                    <Text style={styles.dateValue}>{new Date().toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
                </View>

                {quiz && (
                    <>
                        <View style={styles.lawCard}>
                            <Text style={styles.lawLabel}>Referencia Legislativa:</Text>
                            <Text style={styles.lawValue}>{quiz.law_title}</Text>
                        </View>

                        <Animated.View style={[styles.questionCard, { transform: [{ translateX: shakeAnim }] }]}>
                            <Text style={styles.questionText}>{quiz.question}</Text>
                        </Animated.View>

                        <View style={styles.optionsContainer}>
                            {quiz.options.map((opt, index) => {
                                const style = getOptionStyle(opt.id);
                                return (
                                    <TouchableOpacity
                                        key={`opt-${index}`}
                                        style={[styles.option, { backgroundColor: style.bg, borderColor: style.border }]}
                                        onPress={() => handleAnswer(opt.id || opt)}
                                        disabled={screenState !== 'QUESTION'}
                                    >
                                        <Text style={[styles.optionId, { color: style.text }]}>
                                            {opt.id || String.fromCharCode(65 + index)}
                                        </Text>
                                        <Text style={[styles.optionText, { color: style.text }]}>
                                            {opt.text || opt}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </>
                )}

                {(screenState === 'ANSWERED' || screenState === 'ALREADY') && (
                    <>
                        <TouchableOpacity style={styles.actionButton} onPress={() => setShowExplanation(true)}>
                            <Text style={styles.actionButtonText}>Analizar Fundamentos Jurídicos</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={{ marginTop: 20, padding: 10, alignSelf: 'center' }} 
                            onPress={async () => {
                                await QuizService.clearTodayAnswer();
                                loadData();
                            }}
                        >
                            <Text style={{ color: '#64748B', fontSize: 13, textDecorationLine: 'underline' }}>
                                Reiniciar Evaluación (Solo Pruebas)
                            </Text>
                        </TouchableOpacity>
                    </>
                )}
            </ScrollView>

            <Modal visible={showExplanation} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Análisis Técnico</Text>
                            <IconButton icon="close" onPress={() => setShowExplanation(false)} />
                        </View>
                        <ScrollView style={styles.modalScroll}>
                            <Text style={styles.explanationText}>{quiz?.explanation}</Text>
                            
                            <TouchableOpacity 
                                style={styles.linkButton} 
                                onPress={() => {
                                    setShowExplanation(false);
                                    navigation.navigate('LawDetail', { 
                                        lawId: quiz.law_id, 
                                        initialItemId: quiz.law_item_id,
                                        initialItemNumber: quiz.article_number
                                    });
                                }}
                            >
                                <Text style={styles.linkButtonText}>Consultar Texto Íntegro</Text>
                            </TouchableOpacity>
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
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
    scrollContent: { padding: 20 },
    dateCard: { marginBottom: 20 },
    dateLabel: { fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 },
    dateValue: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 4 },
    lawCard: { backgroundColor: '#F1F5F9', padding: 12, borderRadius: 8, marginBottom: 15 },
    lawLabel: { fontSize: 10, color: '#475569', fontWeight: '700' },
    lawValue: { fontSize: 13, color: COLORS.primary, marginTop: 2, fontWeight: '600' },
    questionCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 20 },
    questionText: { fontSize: 16, color: COLORS.text, lineHeight: 24, fontWeight: '600' },
    optionsContainer: { gap: 12 },
    option: { flexDirection: 'row', padding: 16, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
    optionId: { fontSize: 15, fontWeight: '800', marginRight: 15 },
    optionText: { fontSize: 14, flex: 1, fontWeight: '500' },
    actionButton: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 10, marginTop: 25, alignItems: 'center' },
    actionButtonText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    modalTitle: { fontSize: 18, fontWeight: '700' },
    explanationText: { fontSize: 15, color: '#334155', lineHeight: 24 },
    linkButton: { marginTop: 25, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 20 },
    linkButtonText: { color: COLORS.primary, fontWeight: '700', textAlign: 'center' },
    infoText: { marginTop: 10, color: '#64748B' }
});

export default DailyQuizScreen;
