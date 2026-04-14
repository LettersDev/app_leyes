import React, { useState, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, FlatList,
    TouchableOpacity, Animated, Easing,
} from 'react-native';
import { Searchbar, Card, ActivityIndicator } from 'react-native-paper';

import { searchLaws } from '../services/lawService';
import JurisprudenceService from '../services/jurisprudenceService';
import SemanticSearchService from '../services/semanticSearchService';
import { COLORS } from '../utils/constants';

// ─── Modos de búsqueda ───────────────────────────────────────
const MODES = {
    KEYWORD:  'keyword',   // Búsqueda por palabra clave (actual)
    SEMANTIC: 'semantic',  // Búsqueda por significado (nueva)
};

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
        semantic:         { label: '🔮 Semántico',    color: '#7C3AED', bg: '#EDE9FE' },
        semantic_article: { label: '📄 Artículo',     color: '#0369A1', bg: '#E0F2FE' },
        law:              { label: '📚 Ley',           color: '#065F46', bg: '#D1FAE5' },
        article:          { label: '📄 Artículo',      color: '#0369A1', bg: '#E0F2FE' },
        jurisprudencia:   { label: '⚖️ Jurisprudencia', color: '#92400E', bg: '#FEF3C7' },
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

// ─── Componente principal ─────────────────────────────────────
const SearchScreen = ({ navigation }) => {
    const [searchQuery, setSearchQuery]   = useState('');
    const [results, setResults]           = useState([]);
    const [loading, setLoading]           = useState(false);
    const [searched, setSearched]         = useState(false);
    const [mode, setMode]                 = useState(MODES.KEYWORD);
    const [semanticAvailable, setSemanticAvailable] = useState(true);

    // Animación del spinner semántico
    const spin = useRef(new Animated.Value(0)).current;
    const startSpin = () => {
        spin.setValue(0);
        Animated.loop(
            Animated.timing(spin, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })
        ).start();
    };
    const stopSpin = () => spin.stopAnimation();

    // ── Búsqueda por palabra clave ────────────────────────────
    const runKeywordSearch = useCallback(async (query) => {
        setLoading(true);
        try {
            const [lawsData, jurData] = await Promise.all([
                searchLaws(query),
                JurisprudenceService.searchSentences(query),
            ]);
            setResults([...jurData, ...lawsData]);
            setSearched(true);
        } catch (e) {
            if (e.message !== 'OFFLINE_ERROR') console.error('Keyword search error:', e);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // ── Búsqueda semántica ────────────────────────────────────
    const runSemanticSearch = useCallback(async (query) => {
        setLoading(true);
        startSpin();
        try {
            const data = await SemanticSearchService.search(query, 12);
            if (data.length === 0 && !searched) {
                // Si no hay resultados semánticos, caer a keyword
                await runKeywordSearch(query);
                return;
            }
            setResults(data);
            setSearched(true);
        } catch (e) {
            console.warn('Semantic search error:', e);
            setSemanticAvailable(false);
            await runKeywordSearch(query);
        } finally {
            setLoading(false);
            stopSpin();
        }
    }, [runKeywordSearch]);

    // ── Manejador de texto con debounce ───────────────────────
    const performSearch = useCallback(async (query) => {
        if (query.trim().length < 3) {
            setResults([]);
            setSearched(false);
            return;
        }
        if (mode === MODES.SEMANTIC && semanticAvailable) {
            await runSemanticSearch(query);
        } else {
            await runKeywordSearch(query);
        }
    }, [mode, semanticAvailable, runSemanticSearch, runKeywordSearch]);

    const debouncedSearch = useDebounce(performSearch, 600);

    const handleChangeText = (text) => {
        setSearchQuery(text);
        debouncedSearch(text);
    };

    const handleModeChange = async (newMode) => {
        setMode(newMode);
        if (searchQuery.trim().length >= 3) {
            if (newMode === MODES.SEMANTIC && semanticAvailable) {
                await runSemanticSearch(searchQuery);
            } else {
                await runKeywordSearch(searchQuery);
            }
        }
    };

    // ── highlight de texto para modo keyword ─────────────────
    const highlightText = (text, query) => {
        if (!text || !query || mode === MODES.SEMANTIC) return <Text>{text}</Text>;
        const normalize = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const normText  = normalize(text);
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
        const isJур    = item.type === 'jurisprudencia';
        const isSemantic = item.searchType?.startsWith('semantic');
        const resultType = item.result_type || item.searchType || (isJур ? 'jurisprudencia' : 'law');

        const onPress = () => {
            if (isJур) {
                navigation.navigate('JurisprudenceDetail', {
                    url:   item.url_original,
                    title: `Sentencia Exp: ${item.expediente}`,
                });
            } else if (item.result_type === 'article' || item.searchType === 'semantic_article') {
                // Artículo → ir a la ley y hacer scroll al artículo
                navigation.navigate('LawDetail', { lawId: item.law_id });
            } else {
                navigation.navigate('LawDetail', { lawId: item.id });
            }
        };

        const title   = item.title || item.titulo || '';
        const snippet = (item.excerpt || item.searchableText || item.resumen || item.description || '').substring(0, 180);

        return (
            <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
                <Card style={[
                    styles.resultCard,
                    isSemantic && styles.resultCardSemantic,
                    isJур      && styles.resultCardJur,
                ]}>
                    <Card.Content>
                        <ResultBadge type={resultType} similarity={item.similarity} />

                        <Text style={styles.resultTitle} numberOfLines={2}>
                            {highlightText(title, searchQuery)}
                        </Text>

                        {snippet ? (
                            <Text style={styles.resultSnippet} numberOfLines={3}>
                                {isSemantic ? snippet : highlightText(snippet, searchQuery)}
                                <Text style={{ color: COLORS.textSecondary }}>...</Text>
                            </Text>
                        ) : null}

                        {isJур && (
                            <Text style={styles.jurMeta}>
                                {item.sala} · {item.fecha} · EXP: {item.expediente}
                            </Text>
                        )}
                    </Card.Content>
                </Card>
            </TouchableOpacity>
        );
    }, [navigation, searchQuery, mode]);

    // ── Spinner semántico ─────────────────────────────────────
    const spinInterpolation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

    return (
        <View style={styles.container}>

            {/* ── Barra de búsqueda ── */}
            <Searchbar
                placeholder={mode === MODES.SEMANTIC
                    ? '🔮 Busca por significado: "me despidieron"'
                    : '🔍 Buscar en leyes y jurisprudencia...'}
                onChangeText={handleChangeText}
                value={searchQuery}
                style={styles.searchBar}
                iconColor={mode === MODES.SEMANTIC ? '#7C3AED' : COLORS.primary}
                inputStyle={styles.searchInput}
            />

            {/* ── Selector de modo ── */}
            <View style={styles.modeRow}>
                <TouchableOpacity
                    style={[styles.modeBtn, mode === MODES.KEYWORD && styles.modeBtnActive]}
                    onPress={() => handleModeChange(MODES.KEYWORD)}
                >
                    <Text style={[styles.modeBtnText, mode === MODES.KEYWORD && styles.modeBtnTextActive]}>
                        🔍 Palabras clave
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.modeBtn,
                        mode === MODES.SEMANTIC && styles.modeBtnActiveSemantic,
                        !semanticAvailable && styles.modeBtnDisabled,
                    ]}
                    onPress={() => semanticAvailable && handleModeChange(MODES.SEMANTIC)}
                    disabled={!semanticAvailable}
                >
                    <Text style={[
                        styles.modeBtnText,
                        mode === MODES.SEMANTIC && styles.modeBtnTextActiveSemantic,
                        !semanticAvailable && styles.modeBtnTextDisabled,
                    ]}>
                        🔮 Búsqueda semántica
                    </Text>
                </TouchableOpacity>
            </View>

            {/* ── Hint del modo semántico ── */}
            {mode === MODES.SEMANTIC && (
                <View style={styles.semanticHint}>
                    <Text style={{ fontSize: 13, color: '#7C3AED' }}>ℹ️</Text>
                    <Text style={styles.semanticHintText}>
                        Busca por el <Text style={{ fontWeight: '700' }}>significado</Text>, no solo las palabras exactas
                    </Text>
                </View>
            )}

            {/* ── Loading ── */}
            {loading && (
                <View style={styles.centerContainer}>
                    {mode === MODES.SEMANTIC ? (
                        <View style={styles.semanticLoading}>
                            <Animated.Text style={[styles.semanticSpinner, { transform: [{ rotate: spinInterpolation }] }]}>
                                🔮
                            </Animated.Text>
                            <Text style={styles.loadingText}>Analizando el significado...</Text>
                            <Text style={styles.loadingSubtext}>Comparando con {results.length > 0 ? 'más de ' : ''}26 leyes venezolanas</Text>
                        </View>
                    ) : (
                        <>
                            <ActivityIndicator size="large" color={COLORS.primary} />
                            <Text style={styles.loadingText}>Buscando...</Text>
                        </>
                    )}
                </View>
            )}

            {/* ── Sin resultados ── */}
            {!loading && searched && results.length === 0 && (
                <View style={styles.centerContainer}>
                    <Text style={styles.emptyIcon}>🔎</Text>
                    <Text style={styles.emptyText}>
                        No se encontraron resultados para "{searchQuery}"
                    </Text>
                    {mode === MODES.SEMANTIC && (
                        <Text style={styles.emptySubtext}>
                            Prueba con otras palabras o cambia a búsqueda por palabras clave
                        </Text>
                    )}
                </View>
            )}

            {/* ── Estado vacío inicial ── */}
            {!loading && !searched && (
                <View style={styles.centerContainer}>
                    <Text style={styles.emptyIcon}>{mode === MODES.SEMANTIC ? '🔮' : '⚖️'}</Text>
                    <Text style={styles.instructionText}>
                        {mode === MODES.SEMANTIC
                            ? 'Describe tu situación en lenguaje natural'
                            : 'Escribe al menos 3 caracteres para buscar'}
                    </Text>
                    {mode === MODES.SEMANTIC && (
                        <View style={styles.examplesContainer}>
                            {[
                                '"me despidieron injustamente"',
                                '"herencia de bienes inmuebles"',
                                '"accidente de tránsito"',
                            ].map((ex, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={styles.exampleChip}
                                    onPress={() => {
                                        const q = ex.replace(/"/g, '');
                                        setSearchQuery(q);
                                        runSemanticSearch(q);
                                    }}
                                >
                                    <Text style={styles.exampleChipText}>{ex}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
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
                            {results.length} resultado{results.length !== 1 ? 's' : ''}
                            {mode === MODES.SEMANTIC ? ' semánticos' : ''} para "{searchQuery}"
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
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
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
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
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
