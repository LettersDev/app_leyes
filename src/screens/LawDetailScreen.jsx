import React, { useReducer, useCallback, useEffect, useRef } from 'react';
import { useSettings } from '../context/SettingsContext';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Searchbar, IconButton, Title, Paragraph, Button } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HistoryManager from '../utils/historyManager';
import FavoritesManager from '../utils/favoritesManager';
import NotesManager from '../utils/notesManager';
import OfflineService from '../services/offlineService';
import { getLawById, getLawItems, getLawItemsAround, searchLawItemsByText, downloadLawContent } from '../services/lawService';
import HybridSearchService from '../services/hybridSearchService';
import ReviewService from '../services/reviewService';
import { COLORS } from '../utils/constants';

// Components
import LawArticle from '../components/LawArticle';
import ReadingSettingsModal from '../components/ReadingSettingsModal';
import LawDetailHeader from '../components/LawDetailHeader';
import LawDetailDialogs from '../components/LawDetailDialogs';
import SearchInfoModal from '../components/SearchInfoModal';

const PAGE_SIZE = 20;
const INTERNAL_SEARCH_INTRO_KEY = '@internal_search_intro_shown';

const initialState = {
    law: null,
    items: [],
    searchResults: [],
    loading: true,
    loadingMore: false,
    hasMore: true,
    lastIndex: 0,
    searching: false,
    searchQuery: '',
    isSearching: false,
    searchTargetNum: null,
    error: null,
    settingsVisible: false,
    favoriteIds: new Set(),
    notes: {},
    noteDialogVisible: false,
    editingNote: { id: '', text: '', title: '' },
    isDownloadingContent: false,
    isOfflineAvailable: false,
    infoVisible: false,
};

function reducer(state, action) {
    switch (action.type) {
        case 'UPDATE':
            return { ...state, ...action.updates };
        case 'SET_FIELD':
            const newValue = typeof action.value === 'function' ? action.value(state[action.field]) : action.value;
            return { ...state, [action.field]: newValue };
        case 'RESET_SEARCH':
            return { ...state, searchQuery: '', isSearching: false, searchResults: [], searchTargetNum: null };
        default:
            return state;
    }
}

const LawDetailScreen = ({ route, navigation }) => {
    const { lawId, jumpToIndex } = route.params;
    const [state, dispatch] = useReducer(reducer, initialState);
    const {
        law, items, searchResults, loading, loadingMore, hasMore, lastIndex,
        searching, searchQuery, isSearching, searchTargetNum, error,
        settingsVisible, favoriteIds, notes,
        noteDialogVisible, editingNote, isDownloadingContent, isOfflineAvailable,
        infoVisible
    } = state;
    const { fontSize, fontFamily } = useSettings();

    const flatListRef = useRef(null);
    const searchTimeout = useRef(null);
    const introShownRef = useRef(false); // evita doble disparo

    // Mostrar intro la primera vez que el usuario toca la barra de búsqueda
    const checkAndShowInternalIntro = useCallback(async () => {
        if (introShownRef.current) return;
        introShownRef.current = true;
        const seen = await AsyncStorage.getItem(INTERNAL_SEARCH_INTRO_KEY);
        if (!seen) {
            dispatch({ type: 'SET_FIELD', field: 'infoVisible', value: true });
        }
    }, []);

    const loadInitialData = useCallback(async () => {
        dispatch({ type: 'SET_FIELD', field: 'loading', value: true });
        dispatch({ type: 'SET_FIELD', field: 'error', value: null });
        try {
            const lawData = await getLawById(lawId);
            if (!lawData) throw new Error('Ley no encontrada');
            dispatch({ type: 'SET_FIELD', field: 'law', value: lawData });

            const offline = await OfflineService.isLawOffline(lawId);
            dispatch({ type: 'SET_FIELD', field: 'isOfflineAvailable', value: offline });

            const startIdx = (jumpToIndex !== undefined && jumpToIndex > 0) ? jumpToIndex - 1 : -1;
            const initialItems = await getLawItems(lawId, startIdx, PAGE_SIZE);
            dispatch({ type: 'SET_FIELD', field: 'items', value: initialItems });
            dispatch({ type: 'SET_FIELD', field: 'lastIndex', value: initialItems[initialItems.length - 1]?.index || (startIdx === -1 ? 0 : startIdx) });

            loadFavoriteStatus();
            loadNotes();

            if (jumpToIndex !== undefined) {
                setTimeout(() => {
                    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
                }, 500);
            }
        } catch (err) {
            dispatch({ type: 'SET_FIELD', field: 'error', value: err.message });
        } finally {
            dispatch({ type: 'SET_FIELD', field: 'loading', value: false });
        }
    }, [lawId, jumpToIndex, loadFavoriteStatus, loadNotes]);

    useEffect(() => {
        loadInitialData();
        // Al desmontar la pantalla (usuario cierra la ley) → registrar cierre para la reseña
        return () => {
            ReviewService.recordLawClose();
        };
    }, [loadInitialData]);

    const loadFavoriteStatus = async () => {
        const favs = await FavoritesManager.getFavorites();
        dispatch({ type: 'SET_FIELD', field: 'favoriteIds', value: new Set(favs.map(f => f.id)) });
    };

    const loadNotes = async () => {
        const allNotes = await NotesManager.getNotes(lawId);
        dispatch({ type: 'SET_FIELD', field: 'notes', value: allNotes });
    };

    const loadMoreItems = async () => {
        if (loadingMore || !hasMore || isSearching) return;
        dispatch({ type: 'SET_FIELD', field: 'loadingMore', value: true });
        try {
            const nextItems = await getLawItems(lawId, lastIndex + 1, PAGE_SIZE);
            if (nextItems.length < PAGE_SIZE) dispatch({ type: 'SET_FIELD', field: 'hasMore', value: false });
            dispatch({ type: 'SET_FIELD', field: 'items', value: [...items, ...nextItems] });
            dispatch({ type: 'SET_FIELD', field: 'lastIndex', value: nextItems[nextItems.length - 1]?.index || lastIndex });
        } finally {
            dispatch({ type: 'SET_FIELD', field: 'loadingMore', value: false });
        }
    };

    // Extrae palabras clave descartando stopwords del español
    const extractKeywords = (text) => {
        const stopwords = new Set([
            'me', 'mi', 'mis', 'tu', 'te', 'se', 'le', 'lo', 'la', 'los', 'las',
            'el', 'de', 'en', 'un', 'una', 'por', 'con', 'que', 'del', 'al', 'y',
            'a', 'es', 'no', 'si', 'su', 'sus', 'fue', 'han', 'hay', 'ser',
        ]);
        return text
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 3 && !stopwords.has(w));
    };

    const handleSearch = async (query = searchQuery) => {
        const trimmed = query.trim();
        if (!trimmed) { dispatch({ type: 'RESET_SEARCH' }); return; }
        dispatch({ type: 'SET_FIELD', field: 'searching', value: true });
        dispatch({ type: 'SET_FIELD', field: 'isSearching', value: true });

        try {
            const numMatch = trimmed.match(/\d+/);
            const isPotentialSemantic = trimmed.split(' ').length > 2;

            if (numMatch && trimmed.length < 5) {
                // 1. Salto directo por número de artículo
                const targetNum = parseInt(numMatch[0]);
                dispatch({ type: 'SET_FIELD', field: 'searchTargetNum', value: targetNum });
                const res = await getLawItemsAround(lawId, targetNum, 1);
                dispatch({ type: 'SET_FIELD', field: 'searchResults', value: res });

            } else if (isPotentialSemantic) {
                // 2. Búsqueda semántica (IA) para frases largas
                const semanticRes = await HybridSearchService.searchInLaw(lawId, trimmed);
                if (semanticRes && semanticRes.length > 0) {
                    dispatch({ type: 'SET_FIELD', field: 'searchResults', value: semanticRes });
                } else {
                    // Fallback inteligente: buscar cada palabra clave por separado
                    const keywords = extractKeywords(trimmed);
                    const combinedResults = [];
                    const seenIds = new Set();
                    for (const kw of keywords) {
                        const res = await searchLawItemsByText(lawId, kw);
                        for (const item of res) {
                            const uid = item.id || item.index;
                            if (!seenIds.has(uid)) {
                                seenIds.add(uid);
                                combinedResults.push(item);
                            }
                        }
                    }
                    // Si keywords no dieron resultado, intentar con la frase completa
                    if (combinedResults.length === 0) {
                        const res = await searchLawItemsByText(lawId, trimmed);
                        combinedResults.push(...res);
                    }
                    dispatch({ type: 'SET_FIELD', field: 'searchResults', value: combinedResults });
                }
            } else {
                // 3. Búsqueda por palabra clave normal (1-2 palabras)
                dispatch({ type: 'SET_FIELD', field: 'searchTargetNum', value: null });
                const res = await searchLawItemsByText(lawId, trimmed);
                dispatch({ type: 'SET_FIELD', field: 'searchResults', value: res });
            }
        } finally {
            dispatch({ type: 'SET_FIELD', field: 'searching', value: false });
        }
    };

    const toggleFavoriteLaw = async () => {
        if (!law) return;
        await FavoritesManager.toggleFavorite({ id: lawId, type: 'law', title: law.title, subtitle: `${law.itemCount} artículos`, data: { lawId } });
        loadFavoriteStatus();
    };

    const toggleFavoriteArticle = useCallback(async (item) => {
        if (!law) return;
        const id = `${lawId}-${item.id || item.index}`;
        await FavoritesManager.toggleFavorite({ id, type: 'law_article', title: `Art. ${item.number} - ${law.title}`, subtitle: item.text.substring(0, 100) + '...', data: { lawId, itemIndex: item.index, articleNumber: item.number } });
        loadFavoriteStatus();
    }, [law, lawId, loadFavoriteStatus]);

    const handleShareLaw = () => {
        if (!law) return;
        FavoritesManager.shareContent(law.title, `Te comparto la ${law.title} desde TuLey.`);
    };
    const handleShareArticle = useCallback((item) => {
        if (!law) return;
        FavoritesManager.shareContent(item.title || 'Artículo', `"${item.text}"\n\nFuente: ${law.title}`);
    }, [law]);

    const handleOpenNote = useCallback((it) => {
        dispatch({
            type: 'UPDATE',
            updates: {
                editingNote: {
                    id: `${lawId}-${it.id || it.index}`,
                    text: notes[`${lawId}-${it.id || it.index}`]?.text || '',
                    title: it.title || `Art. ${it.number}`
                },
                noteDialogVisible: true
            }
        });
    }, [lawId, notes]);

    const handleJumpToContext = useCallback((idx) => {
        dispatch({ type: 'SET_FIELD', field: 'loading', value: true });
        dispatch({ type: 'RESET_SEARCH' });
        navigation.setParams({ jumpToIndex: idx });
    }, [navigation]);

    const handleDownloadContent = async () => {
        dispatch({ type: 'SET_FIELD', field: 'isDownloadingContent', value: true });
        if (await downloadLawContent(lawId)) {
            dispatch({ type: 'SET_FIELD', field: 'isOfflineAvailable', value: true });
            Alert.alert('Éxito', 'Ley descargada.');
        }
        dispatch({ type: 'SET_FIELD', field: 'isDownloadingContent', value: false });
    };

    const handleRemoveOffline = async () => {
        Alert.alert('Eliminar', '¿Eliminar descarga?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Eliminar', style: 'destructive', onPress: async () => {
                    await OfflineService.deleteLaw(lawId);
                    dispatch({ type: 'SET_FIELD', field: 'isOfflineAvailable', value: false });
                }
            }
        ]);
    };

    const renderItem = useCallback(({ item, index }) => (
        <LawArticle
            item={item} index={index} fontSize={fontSize} fontFamily={fontFamily} searchQuery={searchQuery}
            isSearching={isSearching} isExactMatch={searchTargetNum && item.number === searchTargetNum}
            onOpenNote={handleOpenNote}
            onToggleFavorite={toggleFavoriteArticle}
            onShare={handleShareArticle}
            onJumpToContext={handleJumpToContext}
            hasNote={!!notes[`${lawId}-${item.id || item.index}`]}
            noteText={notes[`${lawId}-${item.id || item.index}`]?.text}
            isFavorite={favoriteIds.has(`${lawId}-${item.id || item.index}`)}
        />
    ), [fontSize, fontFamily, searchQuery, isSearching, searchTargetNum, handleOpenNote, toggleFavoriteArticle, handleShareArticle, handleJumpToContext, notes, lawId, favoriteIds]);

    if (loading && !isSearching) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /><Text>Cargando ley...</Text></View>;
    if (error || !law) {
        if (error === 'OFFLINE_ERROR') {
            return (
                <View style={[styles.center, { paddingHorizontal: 40 }]}>
                    <IconButton icon="wifi-off" size={60} iconColor={COLORS.textSecondary} />
                    <Title style={{ textAlign: 'center', marginBottom: 10 }}>
                        <Text>Sin Conexión</Text>
                    </Title>
                    <Paragraph style={{ textAlign: 'center', color: COLORS.textSecondary, marginBottom: 20 }}>
                        <Text>Esta ley no ha sido descargada para uso sin internet. Conéctate a una red para leerla o descargarla.</Text>
                    </Paragraph>
                    <Button
                        mode="contained"
                        onPress={() => loadInitialData()}
                        style={{ borderRadius: 20 }}
                    >
                        <Text>Reintentar</Text>
                    </Button>
                </View>
            );
        }

        return (
            <View style={styles.center}>
                <Text>{error || 'No encontrado'}</Text>
                <Button onPress={() => navigation.goBack()}>
                    <Text>Volver</Text>
                </Button>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.searchRow}>
                <Searchbar
                    placeholder="Buscar..."
                    onChangeText={(q) => dispatch({ type: 'SET_FIELD', field: 'searchQuery', value: q })}
                    onIconPress={() => handleSearch()}
                    onSubmitEditing={() => handleSearch()}
                    onFocus={checkAndShowInternalIntro}
                    value={searchQuery}
                    style={styles.searchBar}
                    onClearIconPress={() => dispatch({ type: 'RESET_SEARCH' })}
                    loading={searching}
                />
            </View>
            <SearchInfoModal
                visible={infoVisible}
                onDismiss={async () => {
                    await AsyncStorage.setItem(INTERNAL_SEARCH_INTRO_KEY, 'true');
                    dispatch({ type: 'SET_FIELD', field: 'infoVisible', value: false });
                }}
                mode="internal"
            />
            {isSearching && (
                <View style={styles.searchResultsHeader}>
                    {searchResults.length === 0 && !searching ? (
                        <View style={{ flex: 1 }}>
                            <Text style={styles.resultsText}>
                                No hay resultados en esta ley.
                            </Text>
                            <TouchableOpacity 
                                style={styles.globalSearchBtn}
                                onPress={() => {
                                    navigation.navigate('Search', { screen: 'Search', params: { initialQuery: searchQuery } });
                                }}
                            >
                                <Text style={styles.globalSearchBtnText}>🔎 Buscar en todas las leyes</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <Text style={styles.resultsText}>{searching ? 'Buscando...' : `${searchResults.length} resultados`}</Text>
                    )}
                    <TouchableOpacity onPress={() => dispatch({ type: 'RESET_SEARCH' })}><Text style={styles.clearText}>Ver todo</Text></TouchableOpacity>
                </View>
            )}
            <FlatList
                ref={flatListRef}
                data={isSearching ? searchResults : items}
                renderItem={renderItem}
                keyExtractor={(it) => `it-${it.id || it.index}`}
                ListHeaderComponent={isSearching ? null : (
                    <LawDetailHeader
                        law={law} isOfflineAvailable={isOfflineAvailable} isDownloadingContent={isDownloadingContent}
                        isSearching={isSearching} favoriteIds={favoriteIds} lawId={lawId}
                        toggleFavoriteLaw={toggleFavoriteLaw} handleShareLaw={handleShareLaw}
                        handleRemoveOffline={handleRemoveOffline} handleDownloadContent={handleDownloadContent}
                        setSettingsVisible={(v) => dispatch({ type: 'SET_FIELD', field: 'settingsVisible', value: v })}
                        formatDate={(ts) => ts ? new Date(ts.toDate ? ts.toDate() : ts).toLocaleDateString() : ''}
                    />
                )}
                onEndReached={isSearching ? null : loadMoreItems}
                onEndReachedThreshold={0.5}
                contentContainerStyle={{ paddingBottom: 20 }}
                initialNumToRender={6}
                maxToRenderPerBatch={5}
                windowSize={5}
                updateCellsBatchingPeriod={50}
                removeClippedSubviews={true}
            />
            <ReadingSettingsModal visible={settingsVisible} onDismiss={() => dispatch({ type: 'SET_FIELD', field: 'settingsVisible', value: false })} />
            <LawDetailDialogs
                noteDialogVisible={noteDialogVisible} setNoteDialogVisible={(v) => dispatch({ type: 'SET_FIELD', field: 'noteDialogVisible', value: v })}
                editingNote={editingNote} setEditingNote={(val) => dispatch({ type: 'SET_FIELD', field: 'editingNote', value: val })}
                handleSaveNote={async () => { await NotesManager.saveNote(editingNote?.id, editingNote?.text); dispatch({ type: 'SET_FIELD', field: 'noteDialogVisible', value: false }); loadNotes(); }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    searchBar: {
        flex: 1,
        margin: 10,
        borderRadius: 10,
        backgroundColor: '#fff',
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.2)',
    },
    searchResultsHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: '#f1f5f9' },
    resultsText: { fontWeight: 'bold', color: COLORS.primary },
    clearText: { color: COLORS.accent, fontWeight: 'bold' },
    globalSearchBtn: {
        marginTop: 8,
        backgroundColor: COLORS.primary,
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderRadius: 20,
        alignSelf: 'flex-start'
    },
    globalSearchBtnText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '700'
    }
});

export default LawDetailScreen;
