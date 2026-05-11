import React, { useCallback, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList,
    Pressable,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Searchbar, Card, ActivityIndicator } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { searchLaws } from '../services/lawService';
import JurisprudenceService from '../services/jurisprudenceService';
import HybridSearchService from '../services/hybridSearchService';
import ReviewService from '../services/reviewService';
import { COLORS } from '../utils/constants';
import SearchInfoModal from '../components/SearchInfoModal';

const SEARCH_INTRO_KEY = '@search_intro_shown';

// Eliminamos MODES ya que ahora es híbrido e invisible

// ─── Debounce para no spamear la API ─────────────────────────
function useDebounce(fn, delay) {
    const timer = useRef(null);
    return useCallback((...args) => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => fn(...args), delay);
    }, [fn, delay]);
}

// ─── Badge de tipo de resultado ──────────────────────────────
const ResultBadge = ({ type, similarity }) => {
    const config = {
        semantic: { label: '🔮 Semántico', color: '#7C3AED', bg: '#EDE9FE' },
        semantic_article: { label: '📄 Artículo', color: '#0369A1', bg: '#E0F2FE' },
        law: { label: '📚 Ley', color: '#065F46', bg: '#D1FAE5' },
        article: { label: '📄 Artículo', color: '#0369A1', bg: '#E0F2FE' },
        jurisprudencia: { label: '⚖️ Jurisprudencia', color: '#92400E', bg: '#FEF3C7' },
    };
    const c = config[type] || config.law;
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <View style={[styles.badge, { backgroundColor: c.bg }]}>
                <Text style={[styles.badgeText, { color: c.color }]}>{c.label}</Text>
            </View>
            {similarity != null && (
                <Text style={styles.similarityText}>
                    {Math.round(similarity * 100)}% relevante
                </Text>
            )}
        </View>
    );
};

const initialState = {
    searchQuery: '',
    results: [],
    loading: false,
    searched: false,
    mode: 'hybrid',
    semanticAvailable: true,
    infoVisible: false,
};

function searchReducer(state, action) {
    switch (action.type) {
        case 'SET_QUERY':
            return { ...state, searchQuery: action.payload };
        case 'START_SEARCH':
            return { ...state, loading: true, searched: true };
        case 'SEARCH_SUCCESS':
            return { ...state, loading: false, results: action.payload, searched: true };
        case 'SEARCH_ERROR':
            return { ...state, loading: false, results: [] };
        case 'SET_INFO_VISIBLE':
            return { ...state, infoVisible: action.payload };
        default:
            return state;
    }
}

// ─── Componente principal ─────────────────────────────────────
const SearchScreen = ({ navigation, route }) => {
    const [state, dispatch] = React.useReducer(searchReducer, {
        ...initialState,
        searchQuery: route.params?.initialQuery || ''
    });

    const { searchQuery, results, loading, searched, infoVisible, mode } = state;

    // Mostrar intro una sola vez en la primera visita
    useEffect(() => {
        AsyncStorage.getItem(SEARCH_INTRO_KEY).then(seen => {
            if (!seen) dispatch({ type: 'SET_INFO_VISIBLE', payload: true });
        });
    }, []);

    // Efecto para búsquedas iniciales (desde otras pantallas)
    useEffect(() => {
        if (route.params?.initialQuery) {
            dispatch({ type: 'SET_QUERY', payload: route.params.initialQuery });
            runUnifiedSearch(route.params.initialQuery);
        }
    }, [route.params?.initialQuery, runUnifiedSearch]);

    // Animación del spinner semántico con Reanimated
    const spinValue = useSharedValue(0);

    const spinStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${spinValue.value * 360}deg` }]
    }));

    const startSpin = useCallback(() => {
        spinValue.value = withRepeat(
            withTiming(1, { duration: 1200, easing: Easing.linear }),
            -1,
            false
        );
    }, []);

    const stopSpin = useCallback(() => {
        spinValue.value = 0;
    }, []);

    // ── Búsqueda Unificada (Híbrida) ──────────────────────────
    const runUnifiedSearch = useCallback(async (query) => {
        dispatch({ type: 'START_SEARCH' });
        startSpin();
        try {
            const data = await HybridSearchService.searchAll(query);
            dispatch({ type: 'SEARCH_SUCCESS', payload: data });
            
            if (data && data.length > 0) {
                ReviewService.recordInteraction();
            }
        } catch (e) {
            console.warn('Search error:', e);
            dispatch({ type: 'SEARCH_ERROR' });
        } finally {
            stopSpin();
        }
    }, [startSpin, stopSpin]);

    // ── Manejador de texto con debounce ───────────────────────
    const performSearch = useCallback(async (query) => {
        if (query.trim().length < 3) {
            dispatch({ type: 'SEARCH_SUCCESS', payload: [] });
            return;
        }
        await runUnifiedSearch(query);
    }, [runUnifiedSearch]);

    const debouncedSearch = useDebounce(performSearch, 600);

    const handleChangeText = (text) => {
        dispatch({ type: 'SET_QUERY', payload: text });
        debouncedSearch(text);
    };

    // Ya no manejamos cambios de modo manuales

    // ── highlight de texto para modo keyword ─────────────────
    const highlightText = (text, query) => {
        if (!text || !query) return <Text>{text}</Text>;
        const normalize = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const normText = normalize(text);
        const normQuery = normalize(query.trim());
        if (!normQuery) return <Text>{text}</Text>;
        const parts = [];
        let last = 0;
        const regex = new RegExp(normQuery, 'gi');
        let match;
        while ((match = regex.exec(normText)) !== null) {
            parts.push(text.substring(last, match.index));
            parts.push(
                <Text key={match.index} style={styles.highlight}>
                    {text.substring(match.index, match.index + normQuery.length)}
                </Text>
            );
            last = match.index + normQuery.length;
        }
        parts.push(text.substring(last));
        return <Text>{parts}</Text>;
    };

    // ── Render de cada resultado ──────────────────────────────
    const renderResultItem = useCallback(({ item }) => {
        const isJур = item.type === 'jurisprudencia';
        const isSemantic = item.searchType?.startsWith('semantic');
        const isArticle = item.result_type === 'article' || item.searchType === 'semantic_article';
        const resultType = item.result_type || item.searchType || (isJур ? 'jurisprudencia' : 'law');

        // Nombre de la ley fuente (para artículos)
        const lawSourceName = item.law_title || item.law_id || null;

        const onPress = () => {
            if (isJур) {
                navigation.navigate('JurisprudenceDetail', {
                    url: item.url_original,
                    title: `Sentencia Exp: ${item.expediente}`,
                });
            } else if (isArticle) {
                // Artículo → ir a la ley y hacer scroll al artículo
                navigation.navigate('LawDetail', {
                    lawId: item.law_id,
                    jumpToIndex: item.index,
                    initialItemId: item.id,
                    initialItemNumber: item.number || item.item_number
                });
            } else {
                navigation.navigate('LawDetail', { lawId: item.id });
            }
        };

        const title = item.title || item.titulo || '';
        const snippet = (item.excerpt || item.searchableText || item.resumen || item.description || '').substring(0, 180);

        return (
            <Pressable 
                onPress={onPress} 
                style={({ pressed }) => [
                    { opacity: pressed ? 0.85 : 1 }
                ]}
            >
                <Card style={[
                    styles.resultCard,
                    isSemantic && styles.resultCardSemantic,
                    isJур && styles.resultCardJur,
                ]}>
                    <Card.Content>
                        <ResultBadge type={resultType} similarity={item.similarity} />

                        <Text style={styles.resultTitle} numberOfLines={2}>
                            {highlightText(title, searchQuery)}
                        </Text>

                        {/* Ley de origen — solo para artículos */}
                        {isArticle && lawSourceName ? (
                            <View style={styles.lawSourceRow}>
                                <Text style={styles.lawSourceIcon}>📚</Text>
                                <Text style={styles.lawSourceText} numberOfLines={1}>
                                    {lawSourceName}
                                </Text>
                            </View>
                        ) : null}

                        {snippet ? (
                            <Text style={styles.resultSnippet} numberOfLines={3}>
                                {isSemantic ? snippet : highlightText(snippet, searchQuery)}
                                <Text style={{ color: COLORS.textSecondary }}>…</Text>
                            </Text>
                        ) : null}

                        {isJур && (
                            <Text style={styles.jurMeta}>
                                {item.sala} · {item.fecha} · EXP: {item.expediente}
                            </Text>
                        )}
                    </Card.Content>
                </Card>
            </Pressable>
        );
    }, [navigation, searchQuery, mode]);


    return (
        <View style={styles.container}>

            {/* ── Barra de búsqueda ── */}
            <Searchbar
                placeholder={'Buscar en leyes venezolanas…'}
                onChangeText={handleChangeText}
                value={searchQuery}
                style={styles.searchBar}
                iconColor={COLORS.primary}
                inputStyle={styles.searchInput}
            />

            <SearchInfoModal
                visible={infoVisible}
                onDismiss={async () => {
                    await AsyncStorage.setItem(SEARCH_INTRO_KEY, 'true');
                    dispatch({ type: 'SET_INFO_VISIBLE', payload: false });
                }}
                mode="general"
            />

            {/* Eliminamos el selector de modo y el hint semántico */}

            {/* ── Loading ── */}
            {loading && (
                <View style={styles.centerContainer}>
                    <View style={styles.semanticLoading}>
                        <Animated.View style={spinStyle}>
                            <ActivityIndicator size="large" color={COLORS.primary} />
                        </Animated.View>
                        <Text style={styles.loadingText}>Buscando…</Text>
                    </View>
                </View>
            )}

            {/* ── Estado inicial (sin búsqueda aún) ── */}
            {!loading && !searched && (
                <View style={styles.centerContainer}>
                    <Text style={styles.emptyIcon}>⚖️</Text>
                    <Text style={styles.instructionText}>
                        Escribe al menos 3 caracteres para buscar o escribe una frase para buscar semánticamente.
                    </Text>
                </View>
            )}

            {/* ── Lista de resultados ── */}
            {!loading && results.length > 0 && (
                <FlatList
                    data={results}
                    renderItem={renderResultItem}
                    keyExtractor={(item, idx) => `${item.id ?? idx}`}
                    contentContainerStyle={styles.resultsList}
                    ListHeaderComponent={
                        <Text style={styles.resultsCount}>
                            {results.length} resultado{results.length !== 1 ? 's' : ''} para "{searchQuery}"
                        </Text>
                    }
                />
            )}
        </View>
    );
};

// ─── Estilos ──────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    searchBar: {
        margin: 16,
        marginBottom: 8,
        borderRadius: 14,
        backgroundColor: '#fff',
        boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    },
    searchInput: { fontSize: 15 },

    // ── Selector de modo
    modeRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 8,
        marginBottom: 4,
    },
    modeBtn: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
    },
    modeBtnActive: {
        backgroundColor: COLORS.primary,
    },
    modeBtnActiveSemantic: {
        backgroundColor: '#7C3AED',
    },
    modeBtnDisabled: {
        opacity: 0.4,
    },
    modeBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: COLORS.textSecondary,
    },
    modeBtnTextActive: {
        color: '#fff',
    },
    modeBtnTextActiveSemantic: {
        color: '#fff',
    },
    modeBtnTextDisabled: {
        color: '#999',
    },

    // ── Hint semántico
    semanticHint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginHorizontal: 16,
        marginBottom: 4,
        marginTop: 2,
    },
    semanticHintText: {
        fontSize: 12,
        color: '#7C3AED',
    },

    // ── Resultados
    resultsList: {
        padding: 16,
        paddingTop: 8,
    },
    resultsCount: {
        fontSize: 13,
        color: COLORS.textSecondary,
        marginBottom: 12,
        fontWeight: '600',
    },
    resultCard: {
        marginBottom: 10,
        borderRadius: 14,
        backgroundColor: '#fff',
        boxShadow: '0px 1px 6px rgba(0, 0, 0, 0.06)',
    },
    resultCardSemantic: {
        borderLeftWidth: 3,
        borderLeftColor: '#7C3AED',
    },
    resultCardJur: {
        borderLeftWidth: 3,
        borderLeftColor: COLORS.accent,
    },
    resultTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: COLORS.text,
        marginBottom: 6,
        lineHeight: 21,
    },
    resultSnippet: {
        fontSize: 13,
        color: COLORS.textSecondary,
        lineHeight: 19,
    },
    jurMeta: {
        marginTop: 6,
        fontSize: 11,
        color: COLORS.accent,
        fontWeight: '600',
    },
    lawSourceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        marginBottom: 4,
        gap: 4,
    },
    lawSourceIcon: {
        fontSize: 11,
    },
    lawSourceText: {
        fontSize: 11,
        color: COLORS.primary,
        fontWeight: '700',
        flexShrink: 1,
    },
    highlight: {
        backgroundColor: '#FBBF24',
        color: '#000',
        fontWeight: 'bold',
    },

    // ── Badge
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    similarityText: {
        fontSize: 11,
        color: '#7C3AED',
        fontWeight: '600',
    },

    // ── Loading
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    semanticLoading: {
        alignItems: 'center',
        gap: 12,
    },
    semanticSpinner: {
        fontSize: 48,
    },
    loadingText: {
        marginTop: 8,
        fontSize: 16,
        color: COLORS.text,
        fontWeight: '600',
    },
    loadingSubtext: {
        fontSize: 13,
        color: COLORS.textSecondary,
        textAlign: 'center',
    },

    // ── Vacío / inicial
    emptyIcon: {
        fontSize: 48,
        marginBottom: 12,
    },
    emptyText: {
        fontSize: 16,
        color: COLORS.text,
        textAlign: 'center',
        fontWeight: '600',
        marginBottom: 6,
    },
    emptySubtext: {
        fontSize: 13,
        color: COLORS.textSecondary,
        textAlign: 'center',
    },
    instructionText: {
        fontSize: 15,
        color: COLORS.textSecondary,
        textAlign: 'center',
        marginBottom: 20,
    },

    // ── Chips de ejemplo
    examplesContainer: {
        gap: 8,
        alignItems: 'center',
        marginTop: 4,
    },
    exampleChip: {
        backgroundColor: '#EDE9FE',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
    },
    exampleChipText: {
        color: '#7C3AED',
        fontSize: 13,
        fontWeight: '600',
    },
});

export default SearchScreen;

