import React, { useReducer, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { IconButton, Banner } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HistoryManager from '../utils/historyManager';
import { COLORS, LAW_CATEGORIES, CATEGORY_NAMES, GRADIENTS } from '../utils/constants';
import LawsIndexService from '../services/lawsIndexService';

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

    const checkUpdates = async () => {
        const updateResult = await LawsIndexService.checkAndUpdateIndex();

        if (updateResult.hasNewLaws) {
            dispatch({ type: 'SET_FIELD', field: 'hasNewLaws', value: true });
            dispatch({ type: 'SET_FIELD', field: 'updatedCategories', value: updateResult.updatedCategories || [] });
        }

        if (updateResult.latestAppVersion) {
            const currentVersion = LawsIndexService.getCurrentAppVersion();
            if (isVersionLower(currentVersion, updateResult.latestAppVersion)) {
                dispatch({ type: 'SET_FIELD', field: 'updateAvailable', value: { latestVersion: updateResult.latestAppVersion } });
            }
        }
    };

    const isVersionLower = (current, latest) => {
        const c = current.split('.').map(Number);
        const l = latest.split('.').map(Number);
        for (let i = 0; i < 3; i++) {
            if (l[i] > (c[i] || 0)) return true;
            if (l[i] < (c[i] || 0)) return false;
        }
        return false;
    };

    const dismissNewLawsBanner = async () => {
        await LawsIndexService.clearNewLawsNotification();
        dispatch({ type: 'SET_FIELD', field: 'hasNewLaws', value: false });
    };

    const handleHistoryPress = useCallback((item) => {
        if (item.type === 'law') {
            navigation.navigate('LawDetail', {
                lawId: item.id,
                jumpToIndex: item.lastArticleIndex
            });
        } else if (item.type === 'juris') {
            navigation.navigate('JurisprudenceDetail', {
                url: item.data.url_original,
                title: `Sentencia Exp: ${item.data.expediente}`
            });
        }
    }, [navigation]);

    const handleRemoveHistory = useCallback(async (id) => {
        const newHistory = await HistoryManager.removeVisit(id);
        dispatch({ type: 'SET_FIELD', field: 'history', value: newHistory });
    }, []);

    const categoriesList = [
        { id: LAW_CATEGORIES.CONSTITUCION, name: CATEGORY_NAMES[LAW_CATEGORIES.CONSTITUCION], icon: 'book-open-variant', description: 'Constitución de la República Bolivariana de Venezuela', color: COLORS.primary, navigateTo: 'LawsList' },
        { id: LAW_CATEGORIES.CODIGOS, name: CATEGORY_NAMES[LAW_CATEGORIES.CODIGOS], icon: 'book-multiple', description: 'Códigos Civil, Penal, Comercio y más', color: '#059669', navigateTo: 'CodesList' },
        { id: LAW_CATEGORIES.LEYES, name: CATEGORY_NAMES[LAW_CATEGORIES.LEYES], icon: 'bookshelf', description: 'Leyes Orgánicas, Especiales y Reglamentos', color: '#8B5CF6', navigateTo: 'LawsList' },
        { id: LAW_CATEGORIES.TSJ, name: CATEGORY_NAMES[LAW_CATEGORIES.TSJ], icon: 'gavel', description: 'Sentencias del Tribunal Supremo de Justicia', color: '#DC2626', navigateTo: 'Jurisprudence' },
        { id: LAW_CATEGORIES.GACETA, name: CATEGORY_NAMES[LAW_CATEGORIES.GACETA], icon: 'newspaper', description: 'Gaceta Oficial de la República', color: '#D97706', navigateTo: 'Gacetas' },
        { id: LAW_CATEGORIES.CONVENIOS, name: CATEGORY_NAMES[LAW_CATEGORIES.CONVENIOS], icon: 'earth', description: 'Acuerdos y tratados internacionales suscritos', color: '#0891B2', navigateTo: 'LawsList' },
    ];

    const handleCategoryPress = async (category) => {
        if (updatedCategories.includes(category.id)) {
            await LawsIndexService.clearCategoryNotification(category.id);
            dispatch({ type: 'REMOVE_CATEGORY_UPDATE', id: category.id });
        }

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

    return (
        <View style={{ flex: 1 }}>
            <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
                {hasNewLaws && (
                    <Banner
                        visible={hasNewLaws}
                        icon="new-box"
                        actions={[{ label: 'Entendido', onPress: dismissNewLawsBanner }]}
                        style={styles.newLawsBanner}
                    >
                        <Text>¡Nuevas leyes disponibles! Revisa las categorías para ver las actualizaciones.</Text>
                    </Banner>
                )}
                <LinearGradient colors={GRADIENTS.legal} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <View style={styles.headerTopRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.greeting}>Hola, Bienvenido</Text>
                            <Text style={styles.title}>TuLey</Text>
                            <View style={styles.titleUnderline} />
                        </View>
                        <TouchableOpacity onPress={() => navigation.navigate('Favorites')} style={styles.favoritesButton}>
                            <IconButton icon="star" iconColor="#FFD700" size={28} style={{ margin: 0 }} />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.subtitle}>Tu guía legal digital en Venezuela</Text>
                </LinearGradient>

                <TouchableOpacity style={styles.searchButton} onPress={() => navigation.navigate('Search')}>
                    <IconButton icon="magnify" size={24} iconColor={COLORS.textSecondary} />
                    <Text style={styles.searchText}>Buscar leyes...</Text>
                </TouchableOpacity>

                <HomeHistory
                    history={history}
                    onHistoryPress={handleHistoryPress}
                    onRemoveHistory={handleRemoveHistory}
                />

                <HomeCategories
                    categories={categoriesList}
                    updatedCategories={updatedCategories}
                    onCategoryPress={handleCategoryPress}
                />

                <View style={styles.disclaimerFooter}>
                    <Text style={styles.disclaimerText}>
                        <Text>Esta aplicación NO representa a ninguna entidad gubernamental.</Text>
                        <Text>{'\n'}</Text>
                        <Text>Fuentes: TSJ, Asamblea Nacional, Gaceta Oficial.</Text>
                    </Text>
                    <Text style={styles.versionText}>
                        <Text>TuLey v{LawsIndexService.getCurrentAppVersion()}</Text>
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
    container: { flex: 1, backgroundColor: COLORS.background },
    header: { paddingTop: 50, paddingBottom: 40, paddingHorizontal: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
    greeting: { fontSize: 14, color: '#CBD5E1', fontWeight: '500' },
    title: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginTop: 4 },
    titleUnderline: { height: 4, width: 40, backgroundColor: COLORS.accent, borderRadius: 2, marginTop: 4 },
    subtitle: { fontSize: 14, color: '#94A3B8', marginTop: 20, fontStyle: 'italic' },
    headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    favoritesButton: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 4 },
    searchButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        marginTop: -25,
        marginHorizontal: 20,
        padding: 12,
        borderRadius: 15,
        boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
    },
    searchText: { flex: 1, fontSize: 16, color: COLORS.textSecondary, fontWeight: '500' },
    newLawsBanner: { backgroundColor: '#ECFDF5', marginHorizontal: 16, marginTop: 10, borderRadius: 12 },
    disclaimerFooter: { paddingHorizontal: 24, paddingVertical: 15, marginBottom: 80, alignItems: 'center' },
    disclaimerText: { fontSize: 11, color: '#94A3B8', textAlign: 'center', lineHeight: 16, fontStyle: 'italic' },
    versionText: { fontSize: 10, color: '#CBD5E1', marginTop: 8 },
});

export default HomeScreen;
