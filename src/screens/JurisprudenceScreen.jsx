import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, SectionList, Linking, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import FavoritesManager from '../utils/favoritesManager';
import HistoryManager from '../utils/historyManager';
import {
    Searchbar,
    Card,
    Title,
    Paragraph,
    Text,
    ActivityIndicator,
    Chip,
    Button,
    useTheme,
    IconButton,
    Menu,
    Divider
} from 'react-native-paper';
import { supabase } from '../config/supabase';
import { COLORS } from '../utils/constants';
import JurisprudenceService from '../services/jurisprudenceService';

const SALAS = [
    { id: 'all', label: 'Todas' },
    { id: 'recent', label: 'Recientes (7d)' },
    { id: 'Sala Constitucional', label: 'Constitucional' },
    { id: 'Sala Político-Administrativa', label: 'Político' },
    { id: 'Sala Electoral', label: 'Electoral' },
    { id: 'Sala de Casación Civil', label: 'Civil' },
    { id: 'Sala de Casación Penal', label: 'Penal' },
    { id: 'Sala de Casación Social', label: 'Social' },
    { id: 'Sala Plena', label: 'Plena' },
];
// Helper para obtener los últimos N días en formato DD/MM/YYYY
const getLastNDaysStrings = (n) => {
    const dates = [];
    for (let i = 0; i < n; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const year = d.getFullYear();
        dates.push(`${day}/${month}/${year}`);
    }
    return dates;
};

// Helper para parsear fecha DD/MM/YYYY a objeto Date
const parseDateString = (dateStr) => {
    const [day, month, year] = dateStr.split('/');
    return new Date(year, month - 1, day);
};

// Componente de tarjeta memoizado para evitar re-renders innecesarios
const JurisprudenceCard = React.memo(({
    item,
    isFavorite,
    onToggleFavorite,
    onShare,
    onOpenOriginal
}) => {
    return (
        <Card style={styles.card}>
            <Card.Content>
                <View style={styles.cardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {item.matchType && (
                            <Text style={{ fontSize: 10, color: COLORS.secondary, fontWeight: 'bold', marginRight: 5 }}>
                                [{item.matchType}]
                            </Text>
                        )}
                        <Text style={styles.expediente}>Exp: {item.expediente}</Text>
                        {item.fecha && (new Date() - parseDateString(item.fecha)) < (5 * 24 * 60 * 60 * 1000) && (
                            <View style={{
                                marginLeft: 8,
                                backgroundColor: '#E8F5E9',
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 4,
                                borderWidth: 0.5,
                                borderColor: '#2E7D32'
                            }}>
                                <Text style={{ fontSize: 9, color: '#2E7D32', fontWeight: 'bold' }}>
                                    NUEVO
                                </Text>
                            </View>
                        )}
                    </View>
                    <Chip compact textStyle={{ fontSize: 10 }}>{item.sala}</Chip>
                </View>
                <Title style={styles.title}>{item.titulo}</Title>
                <View style={styles.metaRow}>
                    <Text variant="labelSmall" style={styles.metaLabel}>Ponente:</Text>
                    <Text variant="bodySmall" style={styles.metaValue}>{item.ponente}</Text>
                </View>
                <View style={styles.metaRow}>
                    <Text variant="labelSmall" style={styles.metaLabel}>Fecha:</Text>
                    <Text variant="bodySmall" style={styles.metaValue}>{item.fecha}</Text>
                </View>
                <Paragraph numberOfLines={3} style={styles.resumen}>
                    {item.resumen || 'Sin resumen disponible.'}
                </Paragraph>
            </Card.Content>
            <Card.Actions style={styles.cardActions}>
                <View style={styles.leftActions}>
                    <IconButton
                        icon={isFavorite ? "star" : "star-outline"}
                        iconColor={isFavorite ? "#FFD700" : COLORS.primary}
                        size={24}
                        onPress={() => onToggleFavorite(item)}
                    />
                    <IconButton
                        icon="share-variant"
                        iconColor={COLORS.primary}
                        size={24}
                        onPress={() => onShare(item)}
                    />
                </View>
                <Button
                    mode="contained"
                    onPress={() => onOpenOriginal(item)}
                    buttonColor={COLORS.secondary}
                    labelStyle={{ fontSize: 12 }}
                >
                    Leer Sentencia
                </Button>
            </Card.Actions>
        </Card>
    );
});


const YEARS = ['Todos', ...Array.from({ length: 27 }, (_, i) => (new Date().getFullYear() - i).toString())];

const JurisprudenceScreen = ({ navigation }) => {
    const theme = useTheme();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSala, setSelectedSala] = useState('all');
    const [selectedYear, setSelectedYear] = useState('Todos');
    const [yearMenuVisible, setYearMenuVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [sections, setSections] = useState([]);
    const [lastTimestamp, setLastTimestamp] = useState(null);  // keyset cursor
    const [refreshing, setRefreshing] = useState(false);
    const [indexError, setIndexError] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [favoriteIds, setFavoriteIds] = useState(new Set());

    // Mantenemos una referencia a TODOS los datos planos para poder reconstruir las secciones
    // al paginar sin duplicados ni problemas de orden.
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
        fetchJurisprudence(true);
    }, [selectedSala, selectedYear]);



    const fetchJurisprudence = async (isNewSearch = false) => {
        if (loading || (!isNewSearch && !hasMore)) return;

        setLoading(true);
        setIndexError(false);

        try {
            // MODO BÚSQUEDA
            if (searchQuery.trim()) {
                if (isNewSearch) {
                    const results = await JurisprudenceService.searchSentences(searchQuery.trim());
                    processAndSetData(results, true);
                    setHasMore(false);
                }
                setLoading(false);
                setRefreshing(false);
                return;
            }

            // MODO NAVEGACIÓN — Keyset pagination por timestamp
            const PAGE_SIZE = 20;
            const cursor = isNewSearch ? null : lastTimestamp;

            if (isNewSearch) {
                setRawData([]);
                setSections([]);
                setLastTimestamp(null);
                setHasMore(true);
            }

            let q = supabase.from('jurisprudence').select('*');

            // Filtros
            if (selectedSala === 'recent') {
                const recentDates = getLastNDaysStrings(7);
                q = q.in('fecha', recentDates);
            } else if (selectedSala !== 'all') {
                q = q.eq('sala', selectedSala);
            }

            if (selectedYear !== 'Todos') {
                q = q.eq('ano', parseInt(selectedYear));
            }

            // Keyset cursor: traer récords anteriores al timestamp del último
            if (cursor) {
                q = q.lt('timestamp', cursor);
            }

            q = q.order('timestamp', { ascending: false }).limit(PAGE_SIZE);

            const { data: newData, error } = await q;
            if (error) throw error;

            const rows = newData || [];

            // Actualizar cursor con el timestamp del último elemento
            if (rows.length > 0) {
                setLastTimestamp(rows[rows.length - 1].timestamp);
            }
            if (rows.length < PAGE_SIZE) setHasMore(false);

            processAndSetData(rows, isNewSearch);
        } catch (error) {
            console.error('Error fetching jurisprudence:', error);
            setIndexError(true);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Helper para procesar datos crudos y convertirlos en Secciones (Años)
    const processAndSetData = (newItems, isReset) => {
        setRawData(prev => {
            const allItems = isReset ? newItems : [...prev, ...newItems];

            // Agrupar por Año
            const grouped = allItems.reduce((acc, item) => {
                // Obtener año: campo 'ano' (numérico) o extraer de fecha
                let year = item.ano || (item.fecha ? item.fecha.split('/')[2] : 'Desconocido');
                if (!acc[year]) acc[year] = [];
                acc[year].push(item);
                return acc;
            }, {});

            // Ordenar claves de años descendentemente (2025, 2024...)
            const sortedYears = Object.keys(grouped).sort((a, b) => b - a);

            // Crear estructura para SectionList
            const newSections = sortedYears.map(year => ({
                title: year.toString(),
                data: grouped[year]
            }));

            setSections(newSections);
            return allItems;
        });
    };

    const handleSearch = useCallback(() => {
        fetchJurisprudence(true);
    }, [fetchJurisprudence]);

    const openOriginal = useCallback((item) => {
        if (!item.url_original || item.url_original.endsWith('/null') || item.url_original.includes('/null/')) {
            Alert.alert(
                "Documento No Disponible",
                "El texto completo de esta sentencia aún no ha sido publicado por el TSJ, aunque aparezca en la lista.",
                [{ text: "OK" }]
            );
            return;
        }

        if (item.url_original) {
            HistoryManager.addVisit({
                id: item.id,
                type: 'juris',
                title: item.titulo,
                subtitle: `Exp: ${item.expediente} - ${item.sala}`,
                data: { ...item }
            });

            navigation.navigate('JurisprudenceDetail', {
                url: item.url_original,
                title: `Sentencia Exp: ${item.expediente}`
            });
        }
    }, [navigation]);

    const toggleFavorite = useCallback(async (item) => {
        const favItem = {
            id: item.id,
            type: 'juris',
            title: item.titulo,
            subtitle: `Exp: ${item.expediente} - ${item.sala}`,
            data: { ...item }
        };
        await FavoritesManager.toggleFavorite(favItem);
        loadFavoriteStatus();
    }, []);

    const handleShare = useCallback((item) => {
        const message = `${item.titulo}\nExp: ${item.expediente}\nSala: ${item.sala}\n\nResumen: ${item.resumen}`;
        FavoritesManager.shareContent(item.titulo, message, item.url_original);
    }, []);

    const renderItem = useCallback(({ item }) => (
        <JurisprudenceCard
            item={item}
            isFavorite={favoriteIds.has(item.id)}
            onToggleFavorite={toggleFavorite}
            onShare={handleShare}
            onOpenOriginal={openOriginal}
        />
    ), [favoriteIds, toggleFavorite, handleShare, openOriginal]);

    // Lógica para determinar qué vista principal mostrar
    let MainView;
    if (loading && rawData.length === 0) {
        MainView = (
            <View style={styles.center}>
                <ActivityIndicator animating={true} color={COLORS.primary} size="large" />
                <Text style={styles.loadingText}>Buscando jurisprudencia...</Text>
            </View>
        );
    } else if (indexError) {
        MainView = (
            <View style={styles.center}>
                <IconButton icon="alert-circle" size={48} iconColor={theme.colors.error} />
                <Text style={styles.errorTitle}>Error de Conexión</Text>
                <Text style={styles.errorText}>
                    No se pudo cargar la jurisprudencia. Verifica tu conexión a internet.
                    {selectedYear !== 'Todos' && selectedSala !== 'all' && (
                        `\n(Filtro: ${selectedSala} + Año ${selectedYear})`
                    )}
                </Text>
                <Button
                    mode="contained"
                    onPress={() => fetchJurisprudence(true)}
                    style={styles.errorButton}
                >
                    Reintentar
                </Button>
            </View>
        );
    } else {
        MainView = (

            <SectionList
                sections={sections}
                renderItem={renderItem}
                renderSectionHeader={({ section: { title } }) => (
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{title}</Text>
                    </View>
                )}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.list}
                onEndReached={() => fetchJurisprudence(false)}
                onEndReachedThreshold={0.5}
                onRefresh={() => fetchJurisprudence(true)}
                refreshing={refreshing}
                stickySectionHeadersEnabled={true} // Títulos flotantes
                // Optimizaciones
                initialNumToRender={7}
                maxToRenderPerBatch={10}
                windowSize={10}
                removeClippedSubviews={true}
                ListEmptyComponent={
                    !loading ? (
                        <View style={styles.center}>
                            <Text>No se encontraron sentencias con estos filtros.</Text>
                        </View>
                    ) : null
                }
            />
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Searchbar
                    placeholder="Buscar (Ej: divorcio, amparo...)"
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    onSubmitEditing={handleSearch}
                    style={styles.searchbar}
                />
                <Text style={{ fontSize: 10, color: '#666', paddingHorizontal: 10, marginBottom: 5 }}>
                    * Busca por N° Sentencia, Expediente o Palabras Clave (Ej: "custodia compartido")
                </Text>
                <View>
                    <FlatList
                        horizontal
                        data={SALAS}
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.chipsContainer}
                        renderItem={({ item }) => (
                            <Chip
                                selected={selectedSala === item.id}
                                onPress={() => setSelectedSala(item.id)}
                                style={styles.chip}
                                showSelectedOverlay
                            >
                                {item.label}
                            </Chip>
                        )}
                    />
                    {/* Selector de Años (Menú Desplegable) */}
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
                            contentStyle={{ maxHeight: 300 }} // Limitar altura para scroll
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
            {MainView}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        padding: 10,
        backgroundColor: '#fff',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    searchbar: {
        marginBottom: 10,
        backgroundColor: '#f0f0f0',
    },
    chipsContainer: {
        paddingVertical: 5,
    },
    chip: {
        marginRight: 8,
    },
    list: {
        padding: 10,
    },
    card: {
        marginBottom: 15,
        elevation: 2,
        backgroundColor: '#fff',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 5,
    },
    expediente: {
        fontSize: 12,
        color: '#666',
        fontWeight: 'bold',
    },
    title: {
        fontSize: 16,
        lineHeight: 20,
        marginBottom: 8,
        color: COLORS.primary,
    },
    metaRow: {
        flexDirection: 'row',
        marginBottom: 2,
    },
    metaLabel: {
        fontWeight: 'bold',
        width: 60,
        color: '#777',
    },
    metaValue: {
        flex: 1,
        color: '#333',
    },
    resumen: {
        marginTop: 10,
        fontSize: 13,
        color: '#444',
        fontStyle: 'italic',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    loadingText: {
        marginTop: 10,
        color: '#666',
    },
    errorTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.primary,
        marginTop: 10,
    },
    errorText: {
        textAlign: 'center',
        color: '#666',
        marginVertical: 10,
        paddingHorizontal: 20,
    },
    errorButton: {
        marginTop: 10,
    },
    cardActions: {
        justifyContent: 'space-between',
        paddingHorizontal: 8,
    },
    leftActions: {
        flexDirection: 'row',
    },
    sectionHeader: {
        backgroundColor: '#f5f5f5', // Mismo que el fondo para que parezca separado
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginBottom: 5,
        borderLeftWidth: 4,
        borderLeftColor: COLORS.primary,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    yearFilterContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 5,
        paddingHorizontal: 5
    },
    yearButton: {
        borderColor: COLORS.primary,
    }
});

export default JurisprudenceScreen;
