import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, Linking, TouchableOpacity, Alert } from 'react-native';
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
    IconButton
} from 'react-native-paper';
import { db } from '../config/firebase';
import { collection, query, where, getDocs, orderBy, limit, startAfter } from 'firebase/firestore';
import { COLORS } from '../utils/constants';

const SALAS = [
    { id: 'all', label: 'Todas' },
    { id: 'Sala Constitucional', label: 'Constitucional' },
    { id: 'Sala Político-Administrativa', label: 'Político' },
    { id: 'Sala Electoral', label: 'Electoral' },
    { id: 'Sala de Casación Civil', label: 'Civil' },
    { id: 'Sala de Casación Penal', label: 'Penal' },
    { id: 'Sala de Casación Social', label: 'Social' },
    { id: 'Sala Plena', label: 'Plena' },
];


const JurisprudenceScreen = ({ navigation }) => {
    const theme = useTheme();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSala, setSelectedSala] = useState('all');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [lastDoc, setLastDoc] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [indexError, setIndexError] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [favoriteIds, setFavoriteIds] = useState(new Set());

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
    }, [selectedSala]);

    const fetchJurisprudence = async (isNewSearch = false) => {
        if (loading || (!isNewSearch && !hasMore)) return;

        // Bloqueo de seguridad: si no es búsqueda nueva y no tenemos cursor, no hay nada que hacer
        if (!isNewSearch && !lastDoc) return;

        setLoading(true);
        setIndexError(false);

        if (isNewSearch) {
            setData([]);
            setLastDoc(null);
            setHasMore(true);
        }

        try {
            let q = collection(db, 'jurisprudence');
            const constraints = [];

            // 1. Filtro por Sala
            if (selectedSala !== 'all') {
                console.log(`🏛️ Filtrando por sala: ${selectedSala}`);
                constraints.push(where('sala', '==', selectedSala));
            }

            // 2. Lógica de Búsqueda
            const queryText = searchQuery.trim();
            if (queryText) {
                // Detectar si es una fecha (DD/MM/YYYY) o (DD-MM-YYYY)
                const dateRegex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
                const dateMatch = queryText.match(dateRegex);

                if (dateMatch) {
                    // Normalizar a DD/MM/YYYY que es como guarda el scraper
                    const day = dateMatch[1].padStart(2, '0');
                    const month = dateMatch[2].padStart(2, '0');
                    const year = dateMatch[3];
                    const normalizedDate = `${day}/${month}/${year}`;

                    console.log(`📅 Filtrando por fecha exacta: ${normalizedDate}`);
                    constraints.push(where('fecha', '==', normalizedDate));
                    constraints.push(orderBy('timestamp', 'desc'));
                } else {
                    console.log(`🔍 Buscando expediente que empiece con: ${queryText}`);
                    constraints.push(where('expediente', '>=', queryText));
                    constraints.push(where('expediente', '<=', queryText + '\uf8ff'));
                    constraints.push(orderBy('expediente'));
                }
            } else {
                constraints.push(orderBy('timestamp', 'desc'));
            }

            constraints.push(limit(20));

            // Aplicar cursor si es scroll infinito
            if (!isNewSearch && lastDoc) {
                console.log("⏬ Cargando más resultados...");
                constraints.push(startAfter(lastDoc));
            }

            const finalQ = query(q, ...constraints);
            const querySnapshot = await getDocs(finalQ);
            console.log(`✅ Resultados obtenidos: ${querySnapshot.size}`);

            const newData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            if (isNewSearch) {
                setData(newData);
            } else {
                setData(prev => [...prev, ...newData]);
            }

            // Si trajimos menos de 20, ya no hay más datos para pedir
            if (querySnapshot.size < 20) {
                setHasMore(false);
            }

            setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
        } catch (error) {
            console.error("Error fetching jurisprudence:", error);
            if (error.message.includes('requires an index')) {
                setIndexError(true);
                if (__DEV__) {
                    console.log("🔗 CREAR ÍNDICE AQUÍ: https://console.firebase.google.com/v1/r/project/appley-3f0fb/firestore/indexes?create_composite=ClJwcm9qZWN0cy9hcHBsZXktM2YwZmIvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL2p1cmlzcHJ1ZGVuY2UvaW5kZXhlcy9fEAEaCAoEc2FsYRABGg0KCXRpbWVzdGFtcBACGgwKCF9fbmFtZV9fEAI");
                }
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleSearch = () => {
        fetchJurisprudence(true);
    };

    const openOriginal = (item) => {
        if (item.url_original) {
            // Registrar en historial
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
    };

    const toggleFavorite = async (item) => {
        const favItem = {
            id: item.id,
            type: 'juris',
            title: item.titulo,
            subtitle: `Exp: ${item.expediente} - ${item.sala}`,
            data: { ...item }
        };
        await FavoritesManager.toggleFavorite(favItem);
        loadFavoriteStatus();
    };

    const handleShare = (item) => {
        const message = `${item.titulo}\nExp: ${item.expediente}\nSala: ${item.sala}\n\nResumen: ${item.resumen}`;
        FavoritesManager.shareContent(item.titulo, message, item.url_original);
    };

    const renderItem = ({ item }) => (
        <Card style={styles.card}>
            <Card.Content>
                <View style={styles.cardHeader}>
                    <Text style={styles.expediente}>Exp: {item.expediente}</Text>
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
                        icon={favoriteIds.has(item.id) ? "star" : "star-outline"}
                        iconColor={favoriteIds.has(item.id) ? "#FFD700" : COLORS.primary}
                        size={24}
                        onPress={() => toggleFavorite(item)}
                    />
                    <IconButton
                        icon="share-variant"
                        iconColor={COLORS.primary}
                        size={24}
                        onPress={() => handleShare(item)}
                    />
                </View>
                <Button
                    mode="contained"
                    onPress={() => openOriginal(item)}
                    buttonColor={COLORS.secondary}
                    labelStyle={{ fontSize: 12 }}
                >
                    Leer Sentencia
                </Button>
            </Card.Actions>
        </Card>
    );

    // Lógica para determinar qué vista principal mostrar
    let MainView;
    if (loading && data.length === 0) {
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
                <Text style={styles.errorTitle}>Error de Configuración</Text>
                <Text style={styles.errorText}>
                    Esta consulta requiere un índice compuesto en Firebase.
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
            <FlatList
                data={data}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.list}
                onEndReached={() => fetchJurisprudence(false)}
                onEndReachedThreshold={0.5}
                onRefresh={() => fetchJurisprudence(true)}
                refreshing={refreshing}
                ListEmptyComponent={
                    !loading ? (
                        <View style={styles.center}>
                            <Text>No se encontraron sentencias en esta sala.</Text>
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
                    placeholder="Buscador de Jurisprudencia"
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    onSubmitEditing={handleSearch}
                    style={styles.searchbar}
                />
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
    }
});

export default JurisprudenceScreen;
