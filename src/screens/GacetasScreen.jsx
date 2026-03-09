import React, { useEffect, useCallback, useReducer } from 'react';
import { View, StyleSheet, SectionList, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HistoryManager from '../utils/historyManager';
import FavoritesManager from '../utils/favoritesManager';
import {
    Searchbar,
    Title,
    Paragraph,
    Text,
    ActivityIndicator,
    Button,
    IconButton,
    Menu,
} from 'react-native-paper';
import { COLORS } from '../utils/constants';
import GacetaService from '../services/gacetaService';
import GacetaCard from '../components/GacetaCard';

const initialState = {
    searchQuery: '',
    selectedYear: 'Todos',
    selectedType: 'Todos',
    yearMenuVisible: false,
    typeMenuVisible: false,
    loading: false,
    sections: [],
    rawData: [],
    hasMore: true,
    refreshing: false,
    indexError: false,
    favoriteIds: new Set(),
};

function reducer(state, action) {
    switch (action.type) {
        case 'SET_FIELD':
            return { ...state, [action.field]: action.value };
        case 'RESET_DATA':
            return { ...state, rawData: [], sections: [], hasMore: true, indexError: false };
        case 'SET_DATA':
            return {
                ...state,
                rawData: action.isReset ? action.data : [...state.rawData, ...action.data],
                hasMore: action.hasMore,
                indexError: false
            };
        case 'SET_FAVORITES':
            return { ...state, favoriteIds: action.favorites };
        default:
            return state;
    }
}

const GacetasScreen = ({ navigation }) => {
    const [state, dispatch] = useReducer(reducer, initialState);
    const {
        searchQuery, selectedYear, selectedType, yearMenuVisible, typeMenuVisible,
        loading, sections, rawData, hasMore, refreshing, indexError, favoriteIds
    } = state;

    useFocusEffect(
        useCallback(() => {
            loadFavoriteStatus();
        }, [])
    );

    const loadFavoriteStatus = async () => {
        const favs = await FavoritesManager.getFavorites();
        const ids = new Set(favs.map(f => f.id));
        dispatch({ type: 'SET_FAVORITES', favorites: ids });
    };

    useEffect(() => {
        fetchGacetas(true);
    }, [selectedYear, selectedType]);

    const YEARS = Array.from({ length: 27 }, (_, i) => (2026 - i).toString());

    const cleanTitle = useCallback((titulo) => {
        if (!titulo) return '';
        return titulo
            .replace(/^-{1,2}\s*ir al organismo señalado en el sumario\s*/gi, '')
            .replace(/^señalado en el sumario\s*/gi, '')
            .replace(/^-{1,2}\s*sumario\s*/gi, '')
            .trim();
    }, []);

    const fetchGacetas = async (isReset = false) => {
        if (loading) return;
        dispatch({ type: 'SET_FIELD', field: 'loading', value: true });

        try {
            if (isReset) {
                dispatch({ type: 'RESET_DATA' });
            }

            const PAGE_SIZE = 25;
            const term = searchQuery.trim();
            const offset = isReset ? 0 : rawData.length;

            const data = await GacetaService.fetchGacetas({
                selectedYear,
                selectedType,
                pageOffset: offset,
                searchQuery: term,
                pageSize: PAGE_SIZE
            });

            const newItems = data || [];
            const hasMoreData = newItems.length >= PAGE_SIZE;

            const allItems = isReset ? newItems : [...rawData, ...newItems];

            // Process sections
            const grouped = allItems.reduce((acc, item) => {
                let year = item.ano || (item.fecha ? item.fecha.split('/')[2] : 'Desconocido');
                if (!acc[year]) acc[year] = [];
                acc[year].push(item);
                return acc;
            }, {});

            const sortedYears = Object.keys(grouped).sort((a, b) => b - a);
            const newSections = sortedYears.map(year => ({
                title: year.toString(),
                data: grouped[year]
            }));

            dispatch({
                type: 'SET_DATA',
                data: newItems,
                isReset,
                hasMore: hasMoreData
            });
            dispatch({ type: 'SET_FIELD', field: 'sections', value: newSections });

        } catch (error) {
            dispatch({
                type: 'SET_FIELD',
                field: 'indexError',
                value: error.message === 'OFFLINE_ERROR' ? 'OFFLINE_ERROR' : true
            });
        } finally {
            dispatch({ type: 'SET_FIELD', field: 'loading', value: false });
            dispatch({ type: 'SET_FIELD', field: 'refreshing', value: false });
        }
    };

    const openOriginal = useCallback((item) => {
        if (!item.url_original || item.url_original.endsWith('/null') || item.url_original.includes('/null/')) {
            Alert.alert("Documento No Disponible", "El documento no está disponible.", [{ text: "OK" }]);
            return;
        }

        HistoryManager.addVisit({
            id: item.id,
            type: 'gaceta',
            title: item.titulo,
            subtitle: item.subtitulo,
            data: { ...item }
        });

        navigation.navigate('GacetaDetail', { gaceta: item });
    }, [navigation]);

    const toggleFavorite = useCallback(async (item) => {
        const isFav = favoriteIds.has(item.id);
        if (isFav) {
            await FavoritesManager.removeFavorite(item.id);
            const newSet = new Set(favoriteIds);
            newSet.delete(item.id);
            dispatch({ type: 'SET_FAVORITES', favorites: newSet });
        } else {
            await FavoritesManager.addFavorite({
                id: item.id,
                type: 'gaceta',
                title: item.titulo,
                subtitle: item.subtitulo,
                data: item
            });
            const newSet = new Set(favoriteIds);
            newSet.add(item.id);
            dispatch({ type: 'SET_FAVORITES', favorites: newSet });
        }
    }, [favoriteIds]);

    const renderItem = useCallback(({ item }) => (
        <GacetaCard
            item={item}
            isFavorite={favoriteIds.has(item.id)}
            onToggleFavorite={toggleFavorite}
            onPress={openOriginal}
            cleanTitle={cleanTitle}
        />
    ), [favoriteIds, toggleFavorite, openOriginal, cleanTitle]);

    const renderSectionHeader = useCallback(({ section: { title } }) => (
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{title}</Text>
        </View>
    ), []);

    return (
        <View style={styles.container}>
            <View style={styles.headerContainer}>
                <Searchbar
                    placeholder="Buscar por N° o título..."
                    onChangeText={(v) => dispatch({ type: 'SET_FIELD', field: 'searchQuery', value: v })}
                    value={searchQuery}
                    onSubmitEditing={() => fetchGacetas(true)}
                    style={styles.searchbar}
                    inputStyle={styles.searchInput}
                    iconColor={COLORS.primary}
                />

                <View style={styles.filtersContainer}>
                    <View style={styles.yearFilterContainer}>
                        <Menu
                            visible={yearMenuVisible}
                            onDismiss={() => dispatch({ type: 'SET_FIELD', field: 'yearMenuVisible', value: false })}
                            anchor={
                                <Button
                                    mode="outlined"
                                    onPress={() => dispatch({ type: 'SET_FIELD', field: 'yearMenuVisible', value: true })}
                                    style={styles.yearButton}
                                    icon="calendar"
                                    compact
                                >
                                    <Text>{selectedYear === 'Todos' ? 'Año' : selectedYear}</Text>
                                </Button>
                            }
                        >
                            <ScrollView style={{ maxHeight: 300 }}>
                                {YEARS.map((year) => (
                                    <Menu.Item
                                        key={year}
                                        onPress={() => {
                                            dispatch({ type: 'SET_FIELD', field: 'selectedYear', value: year });
                                            dispatch({ type: 'SET_FIELD', field: 'yearMenuVisible', value: false });
                                        }}
                                        title={year}
                                    />
                                ))}
                            </ScrollView>
                        </Menu>

                        <Menu
                            visible={typeMenuVisible}
                            onDismiss={() => dispatch({ type: 'SET_FIELD', field: 'typeMenuVisible', value: false })}
                            anchor={
                                <Button
                                    mode="outlined"
                                    onPress={() => dispatch({ type: 'SET_FIELD', field: 'typeMenuVisible', value: true })}
                                    style={[styles.yearButton, { marginLeft: 8 }]}
                                    icon="filter-variant"
                                    compact
                                >
                                    <Text>{selectedType === 'Todos' ? 'Tipo' : selectedType}</Text>
                                </Button>
                            }
                        >
                            <Menu.Item onPress={() => { dispatch({ type: 'SET_FIELD', field: 'selectedType', value: 'Todos' }); dispatch({ type: 'SET_FIELD', field: 'typeMenuVisible', value: false }); }} title="Todos" />
                            <Menu.Item onPress={() => { dispatch({ type: 'SET_FIELD', field: 'selectedType', value: 'Ordinaria' }); dispatch({ type: 'SET_FIELD', field: 'typeMenuVisible', value: false }); }} title="Ordinaria" />
                            <Menu.Item onPress={() => { dispatch({ type: 'SET_FIELD', field: 'selectedType', value: 'Extraordinaria' }); dispatch({ type: 'SET_FIELD', field: 'typeMenuVisible', value: false }); }} title="Extraordinaria" />
                        </Menu>
                    </View>

                    {(selectedYear !== 'Todos' || selectedType !== 'Todos') && (
                        <IconButton
                            icon="close-circle"
                            size={20}
                            onPress={() => {
                                dispatch({ type: 'SET_FIELD', field: 'selectedYear', value: 'Todos' });
                                dispatch({ type: 'SET_FIELD', field: 'selectedType', value: 'Todos' });
                            }}
                        />
                    )}
                </View>
            </View>

            {loading && !refreshing && rawData.length === 0 ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={{ marginTop: 10, color: COLORS.textSecondary }}>Cargando Gacetas...</Text>
                </View>
            ) : indexError ? (
                <View style={styles.errorContainer}>
                    <IconButton
                        icon={indexError === 'OFFLINE_ERROR' ? "wifi-off" : "alert-circle"}
                        size={60}
                        iconColor={indexError === 'OFFLINE_ERROR' ? COLORS.textSecondary : COLORS.error}
                    />
                    <Title style={{ textAlign: 'center', marginBottom: 10 }}>
                        <Text>{indexError === 'OFFLINE_ERROR' ? 'Sin Conexión' : 'Error de Conexión'}</Text>
                    </Title>
                    <Paragraph style={{ textAlign: 'center', color: COLORS.textSecondary, marginBottom: 20 }}>
                        <Text>{indexError === 'OFFLINE_ERROR'
                            ? 'No se pudieron cargar las gacetas. Por favor, verifica tu internet.'
                            : 'Error al cargar Gacetas. Verifica tu conexión.'}</Text>
                    </Paragraph>
                    <Button
                        mode="contained"
                        onPress={() => fetchGacetas(true)}
                        style={{ borderRadius: 20 }}
                    >
                        <Text>Reintentar</Text>
                    </Button>
                </View>
            ) : (
                <SectionList
                    sections={sections}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    renderSectionHeader={renderSectionHeader}
                    contentContainerStyle={styles.list}
                    onEndReached={() => {
                        if (hasMore && !loading) fetchGacetas(false);
                    }}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={loading && hasMore ? <ActivityIndicator style={{ margin: 20 }} /> : null}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text>No se encontraron resultados.</Text>
                        </View>
                    }
                    refreshing={refreshing}
                    onRefresh={() => {
                        dispatch({ type: 'SET_FIELD', field: 'refreshing', value: true });
                        fetchGacetas(true);
                    }}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    headerContainer: {
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
    },
    searchbar: {
        backgroundColor: '#f1f5f9',
        borderRadius: 12,
        height: 48,
    },
    searchInput: {
        fontSize: 14,
    },
    filtersContainer: {
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    yearFilterContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    yearButton: {
        borderColor: COLORS.primary,
    },
    list: {
        padding: 16,
        paddingBottom: 80,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sectionHeader: {
        backgroundColor: COLORS.background,
        paddingVertical: 8,
        paddingHorizontal: 4,
        marginBottom: 8,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    emptyContainer: {
        alignItems: 'center',
        marginTop: 50
    }
});

export default GacetasScreen;
