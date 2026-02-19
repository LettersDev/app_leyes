import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Card, Title, Paragraph, Chip } from 'react-native-paper';
import { getLawsByCategory, getLawsByParentCategory } from '../services/lawService';
import { COLORS, LAW_CATEGORIES } from '../utils/constants';
import LawsIndexService from '../services/lawsIndexService';

const LawsListScreen = ({ route, navigation }) => {
    const { category, categoryName } = route.params;
    const [laws, setLaws] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastSyncDate, setLastSyncDate] = useState(null);

    useEffect(() => {
        loadLaws();
    }, [category]);

    const loadLaws = async (forceRefresh = false) => {
        try {
            setLoading(true);
            setError(null);

            let data;
            if (category === LAW_CATEGORIES.LEYES ||
                category === LAW_CATEGORIES.LEYES_ORGANICAS ||
                category === LAW_CATEGORIES.CONVENIOS) {
                console.log(`📂 Cargando leyes por parent_category: ${category} (Force: ${forceRefresh})`);
                data = await getLawsByParentCategory(category, forceRefresh);
            } else {
                data = await getLawsByCategory(category, forceRefresh);
            }

            setLaws(data);

            // Cargar fecha de última sincronización para comparar
            const lsd = await LawsIndexService.getLastSyncTime();
            setLastSyncDate(lsd);
        } catch (err) {
            setError('Error al cargar las leyes. Por favor, intenta de nuevo.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('es-VE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const renderLawItem = ({ item }) => (
        <TouchableOpacity
            onPress={() => navigation.navigate('LawDetail', { lawId: item.id })}
        >
            <Card style={styles.lawCard}>
                <Card.Content>
                    <View style={styles.cardHeader}>
                        <Title style={styles.lawTitle} numberOfLines={2}>
                            {item.title}
                        </Title>
                        {item.type && (
                            <Chip
                                mode="outlined"
                                style={styles.chip}
                                textStyle={styles.chipText}
                            >
                                {item.type}
                            </Chip>
                        )}
                        {lastSyncDate && item.last_updated && new Date(item.last_updated) > lastSyncDate && (
                            <Chip
                                mode="flat"
                                style={styles.newChip}
                                textStyle={styles.newChipText}
                            >
                                NUEVA
                            </Chip>
                        )}
                    </View>

                    {item.date && (
                        <Paragraph style={styles.date}>
                            {formatDate(item.date)}
                        </Paragraph>
                    )}

                    {item.metadata?.gacetaNumber && (
                        <Paragraph style={styles.metadata}>
                            Gaceta N° {item.metadata.gacetaNumber}
                        </Paragraph>
                    )}
                </Card.Content>
            </Card>
        </TouchableOpacity>
    );

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Cargando leyes...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadLaws}>
                    <Text style={styles.retryButtonText}>Reintentar</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (laws.length === 0) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.emptyText}>
                    No hay leyes disponibles en esta categoría aún.
                </Text>
                <Text style={styles.emptySubtext}>
                    Estamos trabajando para agregar más contenido pronto.
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={laws}
                renderItem={renderLawItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContainer}
                refreshing={loading}
                onRefresh={() => loadLaws(true)}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: COLORS.background,
    },
    listContainer: {
        padding: 16,
    },
    lawCard: {
        marginBottom: 12,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    lawTitle: {
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.text,
        marginRight: 8,
    },
    chip: {
        paddingHorizontal: 0,
        backgroundColor: COLORS.secondary + '20',
        borderColor: COLORS.secondary,
        borderWidth: 0.5,
        borderRadius: 4,
        alignSelf: 'flex-start',
    },
    chipText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: COLORS.secondary,
        textTransform: 'uppercase',
        paddingHorizontal: 4,
        paddingVertical: 1,
    },
    newChip: {
        backgroundColor: '#EF4444',
        height: 20,
        borderRadius: 4,
        marginLeft: 8,
    },
    newChipText: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#fff',
        lineHeight: 12,
    },
    date: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginBottom: 4,
    },
    metadata: {
        fontSize: 13,
        color: COLORS.primary,
        fontWeight: '500',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: COLORS.textSecondary,
    },
    errorText: {
        fontSize: 16,
        color: COLORS.error,
        textAlign: 'center',
        marginBottom: 16,
    },
    retryButton: {
        backgroundColor: COLORS.primary,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    retryButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    emptyText: {
        fontSize: 18,
        color: COLORS.text,
        textAlign: 'center',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: COLORS.textSecondary,
        textAlign: 'center',
    },
});

export default LawsListScreen;
