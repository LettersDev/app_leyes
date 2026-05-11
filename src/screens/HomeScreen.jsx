import React, { useReducer, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { IconButton } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import HistoryManager from '../utils/historyManager';
import { COLORS, LAW_CATEGORIES, CATEGORY_NAMES, GRADIENTS } from '../utils/constants';
import LawsIndexService from '../services/lawsIndexService';
import QuizService from '../services/quizService';
import StreakManager from '../utils/streakManager';

// Sub-components
import HomeHistory from '../components/HomeHistory';
import HomeCategories from '../components/HomeCategories';
import HomeDialogs from '../components/HomeDialogs';

const initialState = {
    history: [],
    showDisclaimer: false,
    updateAvailable: null,
    updatedCategories: [],
    quizPending: false,
};

function reducer(state, action) {
    switch (action.type) {
        case 'SET_FIELD':
            return { ...state, [action.field]: action.value };
        case 'REMOVE_CATEGORY_UPDATE':
            return { ...state, updatedCategories: state.updatedCategories.filter(c => c !== action.id) };
        default:
            return state;
    }
}

const HomeScreen = ({ navigation }) => {
    const [state, dispatch] = useReducer(reducer, initialState);
    const { history, showDisclaimer, updateAvailable, updatedCategories } = state;

    useFocusEffect(
        useCallback(() => {
            loadHistory();
            checkUpdates();
            loadUpdatedCategories();
            checkQuizPending();
        }, [])
    );

    useEffect(() => {
        const checkDisclaimer = async () => {
            try {
                const hasSeenDisclaimer = await AsyncStorage.getItem('@disclaimer_seen_v2');
                if (!hasSeenDisclaimer) {
                    dispatch({ type: 'SET_FIELD', field: 'showDisclaimer', value: true });
                }
            } catch (error) {
                console.error('Error checking disclaimer:', error);
            }
        };
        checkDisclaimer();
    }, []);

    const acceptDisclaimer = async () => {
        try {
            await AsyncStorage.setItem('@disclaimer_seen_v2', 'true');
            dispatch({ type: 'SET_FIELD', field: 'showDisclaimer', value: false });
        } catch (error) {
            console.error('Error saving disclaimer:', error);
        }
    };

    const loadHistory = async () => {
        const h = await HistoryManager.getHistory();
        dispatch({ type: 'SET_FIELD', field: 'history', value: h });
    };

    const loadUpdatedCategories = async () => {
        const cats = await LawsIndexService.getUpdatedCategories();
        dispatch({ type: 'SET_FIELD', field: 'updatedCategories', value: cats });
    };

    const checkQuizPending = async () => {
        try {
            const [alreadyAnswered, todayQuiz, streak] = await Promise.all([
                QuizService.hasAnsweredToday(),
                QuizService.fetchTodayQuiz(),
                StreakManager.getStreak(),
            ]);

            // Para fines de prueba, permitimos que el banner se muestre si el quiz existe
            // Independientemente de si ya fue respondido en esta sesión de depuración
            const pending = !!todayQuiz;
            dispatch({ type: 'SET_FIELD', field: 'quizPending', value: pending });
        } catch (e) {
            console.warn('[Home] Error al verificar quiz:', e.message);
        }
    };

    const checkUpdates = async () => {
        await LawsIndexService.checkAndUpdateIndex();
    };

    const handleCategoryPress = async (category) => {
        if (category.navigateTo === 'CodesList') {
            navigation.navigate('CodesList');
        } else if (category.navigateTo === 'Jurisprudence') {
            navigation.navigate('Jurisprudence');
        } else if (category.navigateTo === 'Gacetas') {
            navigation.navigate('Gacetas');
        } else if (category.navigateTo === 'DailyQuiz') {
            navigation.navigate('DailyQuiz');
        } else if (category.navigateTo === 'LawsList' && category.id === LAW_CATEGORIES.LEYES) {
            navigation.navigate('LawsCategorySelector');
        } else {
            navigation.navigate('LawsList', {
                category: category.id,
                categoryName: category.name,
            });
        }
    };

    const categoriesList = React.useMemo(() => [
        { id: LAW_CATEGORIES.CONSTITUCION, name: CATEGORY_NAMES[LAW_CATEGORIES.CONSTITUCION], icon: 'book-open-variant', description: 'Constitución Nacional', color: COLORS.primary, navigateTo: 'LawsList' },
        { id: LAW_CATEGORIES.CODIGOS, name: CATEGORY_NAMES[LAW_CATEGORIES.CODIGOS], icon: 'book-multiple', description: 'Códigos vigentes', color: '#059669', navigateTo: 'CodesList' },
        { id: LAW_CATEGORIES.LEYES, name: CATEGORY_NAMES[LAW_CATEGORIES.LEYES], icon: 'bookshelf', description: 'Leyes Orgánicas y Especiales', color: '#8B5CF6', navigateTo: 'LawsList' },
        { id: LAW_CATEGORIES.TSJ, name: CATEGORY_NAMES[LAW_CATEGORIES.TSJ], icon: 'gavel', description: 'Sentencias y Jurisprudencia', color: '#DC2626', navigateTo: 'Jurisprudence' },
        { id: LAW_CATEGORIES.GACETA, name: CATEGORY_NAMES[LAW_CATEGORIES.GACETA], icon: 'newspaper', description: 'Gaceta Oficial', color: '#D97706', navigateTo: 'Gacetas' },
        { id: LAW_CATEGORIES.CONVENIOS, name: CATEGORY_NAMES[LAW_CATEGORIES.CONVENIOS], icon: 'earth', description: 'Acuerdos y tratados internacionales suscritos', color: '#0891B2', navigateTo: 'LawsList' },
        { id: 'daily-quiz', name: 'Evaluación Legal Diaria', icon: 'book-search', description: state.quizPending ? 'Analice un caso práctico basado en la legislación.' : 'Evaluación completada. Pulse para ver detalles.', color: '#6366f1', navigateTo: 'DailyQuiz' },
    ], [state.quizPending]);

    return (
        <View style={{ flex: 1 }}>
            <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
                <LinearGradient colors={GRADIENTS.legal} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <View style={styles.headerTopRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.greeting}>Portal de Consulta Legal</Text>
                            <Text style={styles.title}>TuLey</Text>
                            <View style={styles.titleUnderline} />
                        </View>
                        <Pressable
                            onPress={() => navigation.navigate('Favorites')}
                            style={({ pressed }) => [styles.favoritesButton, pressed && { opacity: 0.7 }]}
                        >
                            <IconButton icon="star" iconColor="#FFD700" size={28} style={{ margin: 0 }} />
                        </Pressable>
                    </View>
                </LinearGradient>

                <Pressable
                    style={({ pressed }) => [styles.searchButton, pressed && { opacity: 0.9 }]}
                    onPress={() => navigation.navigate('Search')}
                >
                    <IconButton icon="magnify" size={24} iconColor={COLORS.textSecondary} />
                    <Text style={styles.searchText}>Buscar en la legislación…</Text>
                </Pressable>


                <HomeHistory
                    history={history}
                    onHistoryPress={(item) => {
                        if (item.type === 'law') {
                            navigation.navigate('LawDetail', { lawId: item.id, jumpToIndex: item.lastArticleIndex });
                        }
                    }}
                    onRemoveHistory={async (id) => {
                        const newH = await HistoryManager.removeVisit(id);
                        dispatch({ type: 'SET_FIELD', field: 'history', value: newH });
                    }}
                />

                <Pressable
                    style={({ pressed }) => [styles.aiBanner, pressed && { opacity: 0.9 }]}
                    onPress={() => navigation.navigate('AIConsult')}
                >
                    <LinearGradient
                        colors={['#0F172A', '#1E293B']}
                        style={styles.aiBannerGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >

                        <Text style={styles.aiTitle}>Asistente Legal Inteligente</Text>
                        <Text style={styles.aiSub}>Plantea tu situación y buscaremos los artículos que te protegen.</Text>
                        <View style={styles.aiAction}>
                            <Text style={styles.aiActionText}>CONSULTAR CASO</Text>
                        </View>
                    </LinearGradient>
                </Pressable>

                <HomeCategories
                    categories={categoriesList}
                    updatedCategories={updatedCategories}
                    onCategoryPress={handleCategoryPress}
                />

                <View style={styles.disclaimerFooter}>
                    <Text style={styles.disclaimerText}>
                        Información de carácter educativo. No constituye asesoría legal.
                    </Text>
                    <Text style={[styles.disclaimerText, { marginTop: 8, opacity: 0.6 }]}>
                        Versión {Constants.expoConfig?.version || '1.1.10'}
                    </Text>
                </View>
            </ScrollView>

            <HomeDialogs
                updateAvailable={updateAvailable}
                setUpdateAvailable={(val) => dispatch({ type: 'SET_FIELD', field: 'updateAvailable', value: val })}
                showDisclaimer={showDisclaimer}
                acceptDisclaimer={acceptDisclaimer}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { paddingTop: 50, paddingBottom: 40, paddingHorizontal: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
    greeting: { fontSize: 13, color: '#CBD5E1', fontWeight: '500', textTransform: 'uppercase' },
    title: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginTop: 4 },
    titleUnderline: { height: 4, width: 40, backgroundColor: COLORS.accent, borderRadius: 2, marginTop: 4 },
    headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    favoritesButton: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 4 },
    searchButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        marginTop: -25,
        marginHorizontal: 20,
        padding: 8,
        borderRadius: 15,
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    },
    searchText: { flex: 1, fontSize: 16, color: COLORS.textSecondary },
    quizBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        marginHorizontal: 20,
        marginTop: 20,
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
    },
    quizBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    quizBannerTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
    quizBannerSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
    quizBannerRight: { flexDirection: 'row', alignItems: 'center' },
    disclaimerFooter: { padding: 40, alignItems: 'center' },
    disclaimerText: { fontSize: 11, color: '#94A3B8', textAlign: 'center', fontStyle: 'italic' },
    aiBanner: {
        marginHorizontal: 20,
        marginTop: 20,
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.3)',
    },
    aiBannerGradient: {
        padding: 24,
    },
    aiTag: {
        color: COLORS.accent,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 2,
        marginBottom: 8,
    },
    aiTitle: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    aiSub: {
        color: '#94A3B8',
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 20,
    },
    aiAction: {
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        paddingTop: 15,
        alignItems: 'flex-end',
    },
    aiActionText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.5,
    },
});

export default HomeScreen;

