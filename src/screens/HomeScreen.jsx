import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Title, Paragraph, IconButton, Avatar } from 'react-native-paper';
import HistoryManager from '../utils/historyManager';
import { COLORS, LAW_CATEGORIES, CATEGORY_NAMES } from '../utils/constants';

const HomeScreen = ({ navigation }) => {
    const [history, setHistory] = useState([]);

    useFocusEffect(
        useCallback(() => {
            loadHistory();
        }, [])
    );

    const loadHistory = async () => {
        const h = await HistoryManager.getHistory();
        setHistory(h);
    };

    const handleHistoryPress = (item) => {
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
    };

    const handleRemoveHistory = async (id) => {
        const newHistory = await HistoryManager.removeVisit(id);
        setHistory(newHistory);
    };
    const categories = [
        {
            id: LAW_CATEGORIES.CONSTITUCION,
            name: CATEGORY_NAMES[LAW_CATEGORIES.CONSTITUCION],
            icon: 'book-open-variant',
            description: 'Constitución de la República Bolivariana de Venezuela',
            color: COLORS.primary,
            navigateTo: 'LawsList',
        },
        {
            id: LAW_CATEGORIES.CODIGOS,
            name: CATEGORY_NAMES[LAW_CATEGORIES.CODIGOS],
            icon: 'book-multiple',
            description: 'Códigos Civil, Penal, Comercio y más',
            color: '#059669',
            navigateTo: 'CodesList',
        },
        {
            id: LAW_CATEGORIES.TSJ,
            name: CATEGORY_NAMES[LAW_CATEGORIES.TSJ],
            icon: 'gavel',
            description: 'Sentencias del Tribunal Supremo de Justicia',
            color: '#DC2626',
            navigateTo: 'Jurisprudence',
        },
        {
            id: LAW_CATEGORIES.GACETA,
            name: CATEGORY_NAMES[LAW_CATEGORIES.GACETA],
            icon: 'newspaper',
            description: 'Gaceta Oficial de la República',
            color: '#D97706',
            navigateTo: 'LawsList',
        },
    ];

    const handleCategoryPress = (category) => {
        if (category.navigateTo === 'CodesList') {
            navigation.navigate('CodesList');
        } else if (category.navigateTo === 'Jurisprudence') {
            navigation.navigate('Jurisprudence');
        } else {
            navigation.navigate('LawsList', {
                category: category.id,
                categoryName: category.name,
            });
        }
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerTopRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.title}>Bienvenido</Text>
                        <Text style={styles.subtitle}>
                            Consulta las leyes de Venezuela de forma rápida
                        </Text>
                    </View>
                    <IconButton
                        icon="star"
                        iconColor="#FFD700"
                        size={28}
                        onPress={() => navigation.navigate('Favorites')}
                    />
                </View>
            </View>

            <TouchableOpacity
                style={styles.searchButton}
                onPress={() => navigation.navigate('Search')}
            >
                <IconButton icon="magnify" size={24} iconColor={COLORS.textSecondary} />
                <Text style={styles.searchText}>Buscar leyes...</Text>
            </TouchableOpacity>

            {history.length > 0 && (
                <View style={styles.historySection}>
                    <Text style={styles.sectionTitle}>Continuar leyendo</Text>
                    <FlatList
                        horizontal
                        data={history}
                        keyExtractor={(item, index) => `hist-${item.id}-${index}`}
                        showsHorizontalScrollIndicator={false}
                        renderItem={({ item }) => (
                            <View style={styles.historyCardContainer}>
                                <TouchableOpacity onPress={() => handleHistoryPress(item)} style={{ flex: 1 }}>
                                    <Card style={styles.historyCard}>
                                        <View style={styles.historyContent}>
                                            <Avatar.Icon size={40} icon={item.type === 'juris' ? 'gavel' : 'book-outline'} style={{ backgroundColor: item.type === 'juris' ? '#DC2626' : COLORS.primary }} />
                                            <View style={styles.historyInfo}>
                                                <Text style={styles.historyTitle} numberOfLines={1}>{item.title}</Text>
                                                <Text style={styles.historySubtitle} numberOfLines={1}>{item.subtitle}</Text>
                                            </View>
                                        </View>
                                    </Card>
                                </TouchableOpacity>
                                <IconButton
                                    icon="close-circle"
                                    size={20}
                                    iconColor="#EF4444"
                                    style={styles.removeHistoryButton}
                                    onPress={() => handleRemoveHistory(item.id)}
                                />
                            </View>
                        )}
                        contentContainerStyle={styles.historyList}
                    />
                </View>
            )}

            <View style={styles.categoriesContainer}>
                <Text style={styles.sectionTitle}>Categorías</Text>

                {categories.map((category) => (
                    <TouchableOpacity
                        key={category.id}
                        onPress={() => handleCategoryPress(category)}
                    >
                        <Card style={styles.categoryCard}>
                            <Card.Content style={styles.cardContent}>
                                <View style={[styles.iconContainer, { backgroundColor: category.color }]}>
                                    <IconButton icon={category.icon} size={32} iconColor="#fff" />
                                </View>
                                <View style={styles.categoryInfo}>
                                    <Title style={styles.categoryTitle}>{category.name}</Title>
                                    <Paragraph style={styles.categoryDescription}>
                                        {category.description}
                                    </Paragraph>
                                </View>
                                <IconButton icon="chevron-right" size={24} iconColor={COLORS.textSecondary} />
                            </Card.Content>
                        </Card>
                    </TouchableOpacity>
                ))}
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    header: {
        padding: 20,
        backgroundColor: COLORS.primary,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#E5E7EB',
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    searchButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        margin: 16,
        padding: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    searchText: {
        flex: 1,
        fontSize: 16,
        color: COLORS.textSecondary,
    },
    categoriesContainer: {
        padding: 16,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.text,
        marginBottom: 16,
    },
    categoryCard: {
        marginBottom: 12,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        elevation: 2,
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
    },
    iconContainer: {
        borderRadius: 12,
        marginRight: 12,
    },
    categoryInfo: {
        flex: 1,
    },
    categoryTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.text,
        marginBottom: 4,
    },
    categoryDescription: {
        fontSize: 13,
        color: COLORS.textSecondary,
    },
    historySection: {
        marginBottom: 8,
    },
    historyList: {
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    historyCard: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 12,
        elevation: 2,
    },
    historyCardContainer: {
        width: 220,
        marginRight: 12,
        position: 'relative',
    },
    removeHistoryButton: {
        position: 'absolute',
        top: -10,
        right: -10,
        margin: 0,
        zIndex: 1,
    },
    historyContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
    },
    historyInfo: {
        marginLeft: 10,
        flex: 1,
    },
    historyTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: COLORS.text,
    },
    historySubtitle: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
});

export default HomeScreen;
