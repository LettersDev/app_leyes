import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { Card, Title, Paragraph, Chip, IconButton, Button } from 'react-native-paper';
import { getLawsByCategory, getLawsByParentCategory } from '../services/lawService';
import { COLORS, LAW_CATEGORIES } from '../utils/constants';
import LawsIndexService from '../services/lawsIndexService';

const LawsListScreen = ({ route, navigation }) => {
    const { category, categoryName } = route.params;
    const [laws, setLaws] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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

            // Cargar fecha de última sincronización para comparar
            const lsd = await LawsIndexService.getLastSyncTime();

            // Pre-procesar leyes para incluir isNew y fechas formateadas
            const processed = (data || []).map(item => {
                const itemDate = item.date?.toDate ? item.date.toDate() : (item.date ? new Date(item.date) : null);
                return {
                    ...item,
                    isNew: lsd && item.last_updated && new Date(item.last_updated) > lsd,
                    displayDate: itemDate ? itemDate.toLocaleDateString('es-VE', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    }) : null
                };
            });

            setLaws(processed);
        } catch (err) {
            if (err.message === 'OFFLINE_ERROR') {
                setError('OFFLINE_ERROR');
            } else {
                setError('Error al cargar las leyes. Por favor, intenta de nuevo.');
                console.error(err);
            }
        } finally {
            setLoading(false);
        }
    };

    const renderLawItem = ({ item }) => (
        <Pressable
            style={({ pressed }) => [
                styles.lawCard,
                { opacity: pressed ? 0.8 : 1 }
            ]}
            onPress={() => navigation.navigate('LawDetail', { lawId: item.id })}
        >
            <Card style={[styles.lawCard, { marginBottom: 0 }]}>
                <Card.Content>
                    <Title style={styles.lawTitle} numberOfLines={3}>
                        {item.title}
                    </Title>
                    <View style={styles.chipsRow}>
                        {item.type && (
                            <Chip
                                mode="outlined"
                                style={styles.chip}
                                textStyle={styles.chipText}
                            >
                                <Text>{item.type}</Text>
                            </Chip>
                        )}
                        {item.isNew && (
                            <Chip
                                mode="flat"
                                style={styles.newChip}
                                textStyle={styles.newChipText}
                            >
                                <Text>NUEVA</Text>
                            </Chip>
                        )}
                    </View>
                    <View style={styles.footerRow}>
                        {item.displayDate && (
                            <Paragraph style={styles.date}>
                                {item.displayDate}
                            </Paragraph>
                        )}

                        {item.metadata?.gacetaNumber && (
                            <Paragraph style={styles.metadata}>
                                <Text>Gaceta N° {item.metadata.gacetaNumber}</Text>
                            </Paragraph>
                        )}
                    </View>
                </Card.Content>
            </Card>
        </Pressable>
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
        if (error === 'OFFLINE_ERROR') {
            return (
                <View style={styles.centerContainer}>
                    <IconButton icon="wifi-off" size={60} iconColor={COLORS.textSecondary} />
                    <Title style={{ textAlign: 'center', marginBottom: 10 }}>
                        <Text>Sin Conexión</Text>
                    </Title>
                    <Paragraph style={{ textAlign: 'center', color: COLORS.textSecondary, marginBottom: 20 }}>
                        <Text>No se pudieron cargar las leyes de esta categoría. Por favor, verifica tu internet.</Text>
                    </Paragraph>
                    <Button
                        mode="contained"
                        onPress={() => loadLaws()}
                        style={{ borderRadius: 20 }}
                    >
                        <Text>Reintentar</Text>
                    </Button>
                </View>
            );
        }

        return (
            <View style={styles.centerContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable 
                    style={({ pressed }) => [
                        styles.retryButton,
                        pressed && { opacity: 0.8 }
                    ]} 
                    onPress={loadLaws}
                >
                    <Text style={styles.retryButtonText}>Reintentar</Text>
                </Pressable>
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
        marginBottom: 16,
        borderRadius: 16,
        backgroundColor: '#fff',
        boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.08)',
        overflow: 'hidden',
    },
    lawTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.text,
        lineHeight: 24,
        marginBottom: 8,
    },
    chipsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: 12,
        gap: 8,
    },
    chip: {
        backgroundColor: COLORS.secondary + '15',
        borderColor: COLORS.secondary,
        borderWidth: 1,
        borderRadius: 8,
        height: 28,
    },
    chipText: {
        fontSize: 11,
        fontWeight: '700',
        color: COLORS.secondary,
        textTransform: 'uppercase',
        paddingHorizontal: 8,
    },
    newChip: {
        backgroundColor: '#EF4444',
        height: 28,
        borderRadius: 8,
    },
    newChipText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#fff',
        paddingHorizontal: 10,
    },
    footerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        paddingTop: 8,
    },
    date: {
        fontSize: 13,
        color: COLORS.textSecondary,
        marginBottom: 0,
    },
    metadata: {
        fontSize: 13,
        color: COLORS.primary,
        fontWeight: '600',
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
