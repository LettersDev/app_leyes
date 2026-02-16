import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, SectionList, Linking, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HistoryManager from '../utils/historyManager';
import FavoritesManager from '../utils/favoritesManager';
import {
    Searchbar,
    Card,
    Title,
    Paragraph,
    Text,
    ActivityIndicator,
    Button,
    useTheme,
    IconButton,
    Menu,
    Divider
} from 'react-native-paper';
import { db } from '../config/firebase';
import { collection, query, where, getDocs, orderBy, limit, startAfter } from 'firebase/firestore';
import { COLORS } from '../utils/constants';

const GacetasScreen = ({ navigation }) => {
    const theme = useTheme();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedYear, setSelectedYear] = useState('Todos');
    const [yearMenuVisible, setYearMenuVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [sections, setSections] = useState([]);
    const [lastDoc, setLastDoc] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [indexError, setIndexError] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [favoriteIds, setFavoriteIds] = useState(new Set());
    const [rawData, setRawData] = useState([]);

    useFocusEffect(
        useCallback(() => {
            loadFavoriteStatus();
        }, [])
    );

    const loadFavoriteStatus = async () => {
        const favs = await FavoritesManager.getFavorites();
        const ids = new Set(favs.map(f => f.id));
        setFavoriteIds(ids);
    };

    useEffect(() => {
        fetchGacetas(true);
    }, [selectedYear]);

    // Generate years 2000-2026
    const YEARS = Array.from({ length: 27 }, (_, i) => (2026 - i).toString());

    // Helper para normalizar texto (quitar acentos y minúsculas)
    const normalizeText = (text) => {
        if (!text) return '';
        return text.toString().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    };

    const fetchGacetas = async (isReset = false) => {
        if (loading) return;
        setLoading(true);
        setIndexError(false);
        try {
            if (isReset) {
                setLastDoc(null);
                setSections([]);
                setRawData([]);
                setHasMore(true);
            }

            const constraints = [];
            const term = searchQuery.trim();
            const isTextSearch = term && isNaN(parseInt(term));

            // Si es búsqueda numérica, filtrar en Firestore
            if (term && !isTextSearch) {
                const num = parseInt(term);
                constraints.push(where('numero', '==', num));
            }

            // Year Filter
            if (selectedYear !== 'Todos') {
                constraints.push(where('ano', '==', parseInt(selectedYear)));
                constraints.push(orderBy('numero', 'desc'));
                constraints.push(limit(30)); // Optimizado: era 300, ahora pagina con scroll infinito
            } else if (!isTextSearch) {
                constraints.push(orderBy('ano', 'desc'));
                constraints.push(orderBy('numero', 'desc'));
                constraints.push(limit(20));
            } else {
                // Para búsqueda por texto, traer un lote para filtrar client-side
                constraints.push(orderBy('ano', 'desc'));
                constraints.push(orderBy('numero', 'desc'));
                constraints.push(limit(50)); // Optimizado: era 200
            }

            if (!isReset && lastDoc && !isTextSearch) {
                constraints.push(startAfter(lastDoc));
            }

            const q = query(collection(db, 'gacetas'), ...constraints);
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                setHasMore(false);
                if (isReset) {
                    setSections([]);
                    setRawData([]);
                }
            } else {
                if (!isTextSearch) {
                    setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
                }

                let newItems = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                // Filtrado client-side por texto (título o subtítulo)
                if (isTextSearch) {
                    const normTerm = normalizeText(term);
                    newItems = newItems.filter(item =>
                        normalizeText(item.titulo).includes(normTerm) ||
                        normalizeText(item.subtitulo).includes(normTerm)
                    );
                    setHasMore(false);
                }

                const allItems = isReset ? newItems : [...rawData, ...newItems];
                setRawData(allItems);

                processAndSetData(allItems);
            }
        } catch (error) {
            console.error("Error fetching gacetas:", error);
            if (error.message.includes('index')) {
                setIndexError(true);
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const processAndSetData = (allItems) => {
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

        setSections(newSections);
    };

    const onSearch = () => {
        fetchGacetas(true);
    };

    const openOriginal = useCallback((item) => {
        if (!item.url_original || item.url_original.endsWith('/null') || item.url_original.includes('/null/')) {
            Alert.alert(
                "Documento No Disponible",
                "El documento de esta Gaceta no está disponible para visualización directa.",
                [{ text: "OK" }]
            );
            return;
        }

        if (item.url_original) {
            HistoryManager.addVisit({
                id: item.id,
                type: 'gaceta',
                title: item.titulo,
                subtitle: item.subtitulo,
                data: { ...item }
            });

            // Use JurisprudenceDetail logic or just create GacetaDetail if needed
            // Reusing JurisprudenceDetail for WebView is fine if params match
            navigation.navigate('JurisprudenceDetail', {
                url: item.url_original,
                title: item.titulo
            });
        }
    }, [navigation]);

    const toggleFavorite = async (item) => {
        const isFav = favoriteIds.has(item.id);
        if (isFav) {
            await FavoritesManager.removeFavorite(item.id);
            const newSet = new Set(favoriteIds);
            newSet.delete(item.id);
            setFavoriteIds(newSet);
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
            setFavoriteIds(newSet);
        }
    };

    const renderItem = ({ item }) => (
        <Card style={styles.card} onPress={() => openOriginal(item)}>
            <Card.Content>
                <View style={styles.cardHeader}>
                    <View style={styles.headerLeft}>
                        {/* Use different icon or color for Ordinaria vs Extra? */}
                        <Title style={styles.cardTitle}>{item.titulo}</Title>
                        <Paragraph style={styles.cardSubtitle}>{item.subtitulo}</Paragraph>
                    </View>
                    <IconButton
                        icon={favoriteIds.has(item.id) ? "star" : "star-outline"}
                        iconColor={favoriteIds.has(item.id) ? "#FFD700" : COLORS.textSecondary}
                        size={24}
                        onPress={() => toggleFavorite(item)}
                    />
                </View>
                <View style={styles.chipsRow}>
                    <Text style={styles.dateText}>{item.fecha}</Text>
                    {item.tipo && (
                        <View style={[styles.badge, item.tipo.includes('Extra') ? styles.badgeExtra : styles.badgeOrd]}>
                            <Text style={styles.badgeText}>{item.tipo}</Text>
                        </View>
                    )}
                </View>
            </Card.Content>
        </Card>
    );

    const renderSectionHeader = ({ section: { title } }) => (
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{title}</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.headerContainer}>
                <Searchbar
                    placeholder="Buscar por N° o título..."
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    onSubmitEditing={onSearch}
                    style={styles.searchbar}
                    inputStyle={styles.searchInput}
                    iconColor={COLORS.primary}
                />

                <View style={styles.filtersContainer}>
                    <View style={styles.yearFilterContainer}>
                        <Menu
                            visible={yearMenuVisible}
                            onDismiss={() => setYearMenuVisible(false)}
                            anchor={
                                <Button
                                    mode="outlined"
                                    onPress={() => setYearMenuVisible(true)}
                                    style={styles.yearButton}
                                    icon="calendar"
                                    compact
                                >
                                    {selectedYear === 'Todos' ? 'Filtrar Año' : `Año: ${selectedYear}`}
                                </Button>
                            }
                            contentStyle={{ maxHeight: 300 }}
                        >
                            <ScrollView style={{ maxHeight: 300 }}>
                                {YEARS.map((year) => (
                                    <Menu.Item
                                        key={year}
                                        onPress={() => {
                                            setSelectedYear(year);
                                            setYearMenuVisible(false);
                                        }}
                                        title={year}
                                        leadingIcon={selectedYear === year ? "check" : undefined}
                                    />
                                ))}
                            </ScrollView>
                        </Menu>
                        {selectedYear !== 'Todos' && (
                            <IconButton
                                icon="close-circle"
                                size={20}
                                onPress={() => setSelectedYear('Todos')}
                                style={{ margin: 0 }}
                            />
                        )}
                    </View>
                </View>
            </View>

            {loading && !refreshing && rawData.length === 0 ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={{ marginTop: 10, color: COLORS.textSecondary }}>Cargando Gacetas...</Text>
                </View>
            ) : indexError ? (
                <View style={styles.errorContainer}>
                    <IconButton icon="alert-circle" size={48} iconColor={COLORS.error} />
                    <Text style={styles.errorText}>Se requiere crear un índice nuevo en Firestore.</Text>
                    <Text style={styles.errorSubtext}>Revisa la consola de Firebase.</Text>
                    <Button mode="contained" onPress={() => fetchGacetas(true)} style={{ marginTop: 10 }}>Retry</Button>
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
                        setRefreshing(true);
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
        elevation: 2,
    },
    searchbar: {
        elevation: 0,
        backgroundColor: '#f1f5f9',
        borderRadius: 12,
        height: 48,
    },
    searchInput: {
        fontSize: 14, // Prevent zoom on iOS
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
    card: {
        marginBottom: 12,
        borderRadius: 12,
        backgroundColor: '#fff',
        elevation: 1,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    headerLeft: {
        flex: 1,
        marginRight: 8,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.text,
        lineHeight: 22,
    },
    cardSubtitle: {
        fontSize: 13,
        color: COLORS.textSecondary,
        marginTop: 4,
    },
    chipsRow: {
        flexDirection: 'row',
        marginTop: 12,
        alignItems: 'center',
    },
    dateText: {
        fontSize: 12,
        color: COLORS.textSecondary,
        marginRight: 10,
        fontFamily: 'monospace'
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    badgeOrd: {
        backgroundColor: '#DBEAFE', // blue-100
    },
    badgeExtra: {
        backgroundColor: '#FEE2E2', // red-100
    },
    badgeText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#1E40AF', // blue-800
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
    errorText: {
        color: COLORS.error,
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center',
        marginTop: 10
    },
    emptyContainer: {
        alignItems: 'center',
        marginTop: 50
    }
});

export default GacetasScreen;
