import React, { useReducer, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { IconButton, Banner } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
    hasNewLaws: false,
    showDisclaimer: false,
    updateAvailable: null,
    updatedCategories: [],
    quizPending: false,
    quizStreak: 0,
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
    const { history, hasNewLaws, showDisclaimer, updateAvailable, updatedCategories } = state;

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
            dispatch({ type: 'SET_FIELD', field: 'quizStreak', value: streak.currentStreak });
        } catch (e) {
            console.warn('[Home] Error al verificar quiz:', e.message);
        }
    };

    const checkUpdates = async () => {
        const updateResult = await LawsIndexService.checkAndUpdateIndex();
        if (updateResult.hasNewLaws) {
            dispatch({ type: 'SET_FIELD', field: 'hasNewLaws', value: true });
        }
    };

    const handleCategoryPress = async (category) => {
        if (category.navigateTo === 'CodesList') {
            navigation.navigate('CodesList');
        } else if (category.navigateTo === 'Jurisprudence') {
            navigation.navigate('Jurisprudence');
        } else if (category.navigateTo === 'Gacetas') {
            navigation.navigate('Gacetas');
        } else if (category.navigateTo === 'LawsList' && category.id === LAW_CATEGORIES.LEYES) {
            navigation.navigate('LawsCategorySelector');
        } else {
            navigation.navigate('LawsList', {
                category: category.id,
                categoryName: category.name,
            });
        }
    };

    const categoriesList = [
        { id: LAW_CATEGORIES.CONSTITUCION, name: CATEGORY_NAMES[LAW_CATEGORIES.CONSTITUCION], icon: 'book-open-variant', description: 'Constitución Nacional', color: COLORS.primary, navigateTo: 'LawsList' },
        { id: LAW_CATEGORIES.CODIGOS, name: CATEGORY_NAMES[LAW_CATEGORIES.CODIGOS], icon: 'book-multiple', description: 'Códigos vigentes', color: '#059669', navigateTo: 'CodesList' },
        { id: LAW_CATEGORIES.LEYES, name: CATEGORY_NAMES[LAW_CATEGORIES.LEYES], icon: 'bookshelf', description: 'Leyes Orgánicas y Especiales', color: '#8B5CF6', navigateTo: 'LawsList' },
        { id: LAW_CATEGORIES.TSJ, name: CATEGORY_NAMES[LAW_CATEGORIES.TSJ], icon: 'gavel', description: 'Sentencias y Jurisprudencia', color: '#DC2626', navigateTo: 'Jurisprudence' },
        { id: LAW_CATEGORIES.GACETA, name: CATEGORY_NAMES[LAW_CATEGORIES.GACETA], icon: 'newspaper', description: 'Gaceta Oficial', color: '#D97706', navigateTo: 'Gacetas' },
    ];

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
                        <TouchableOpacity onPress={() => navigation.navigate('Favorites')} style={styles.favoritesButton}>
                            <IconButton icon="star" iconColor="#FFD700" size={28} style={{ margin: 0 }} />
                        </TouchableOpacity>
                    </View>
                </LinearGradient>

                <TouchableOpacity style={styles.searchButton} onPress={() => navigation.navigate('Search')}>
                    <IconButton icon="magnify" size={24} iconColor={COLORS.textSecondary} />
                    <Text style={styles.searchText}>Buscar en la legislación...</Text>
                </TouchableOpacity>

                {/* Banner de Evaluación Legal Diaria */}
                <TouchableOpacity
                    style={styles.quizBanner}
                    onPress={() => navigation.navigate('DailyQuiz')}
                    activeOpacity={0.85}
                >
                    <View style={styles.quizBannerLeft}>
                        <IconButton icon="book-search" iconColor={state.quizPending ? "#D97706" : "#64748B"} size={24} style={{ margin: 0 }} />
                        <View>
                            <Text style={styles.quizBannerTitle}>Evaluación Legal Diaria</Text>
                            <Text style={styles.quizBannerSub}>
                                {state.quizPending ? 'Analice un caso práctico basado en la legislación.' : 'Evaluación completada. Pulse para ver detalles.'}
                            </Text>
                            {!state.quizPending && (
                                <TouchableOpacity 
                                    onPress={async (e) => {
                                        e.stopPropagation();
                                        await QuizService.clearTodayAnswer();
                                        dispatch({ type: 'SET_FIELD', field: 'quizPending', value: true });
                                    }}
                                >
                                    <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: 'bold', marginTop: 5, textDecorationLine: 'underline' }}>
                                        REINICIAR PARA PRUEBA
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                    <View style={styles.quizBannerRight}>
                        <IconButton icon="chevron-right" iconColor="#D97706" size={24} style={{ margin: 0 }} />
                    </View>
                </TouchableOpacity>

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

                <HomeCategories
                    categories={categoriesList}
                    updatedCategories={updatedCategories}
                    onCategoryPress={handleCategoryPress}
                />

                <View style={styles.disclaimerFooter}>
                    <Text style={styles.disclaimerText}>
                        Información de carácter educativo. No constituye asesoría legal.
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
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
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
        elevation: 2,
    },
    quizBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    quizBannerTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
    quizBannerSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
    quizBannerRight: { flexDirection: 'row', alignItems: 'center' },
    disclaimerFooter: { padding: 40, alignItems: 'center' },
    disclaimerText: { fontSize: 11, color: '#94A3B8', textAlign: 'center', fontStyle: 'italic' },
});

export default HomeScreen;
