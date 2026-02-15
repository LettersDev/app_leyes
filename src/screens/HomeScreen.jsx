import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Title, Paragraph, IconButton, Avatar, Surface, Banner } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import HistoryManager from '../utils/historyManager';
import { COLORS, LAW_CATEGORIES, CATEGORY_NAMES, GRADIENTS } from '../utils/constants';
import LawsIndexService from '../services/lawsIndexService';

const HomeScreen = ({ navigation }) => {
    const [history, setHistory] = useState([]);
    const [hasNewLaws, setHasNewLaws] = useState(false);

    useFocusEffect(
        useCallback(() => {
            loadHistory();
            checkNewLaws();
        }, [])
    );

    const loadHistory = async () => {
        const h = await HistoryManager.getHistory();
        setHistory(h);
    };

    const checkNewLaws = async () => {
        const hasNew = await LawsIndexService.hasNewLawsNotification();
        setHasNewLaws(hasNew);
    };

    const dismissNewLawsBanner = async () => {
        await LawsIndexService.clearNewLawsNotification();
        setHasNewLaws(false);
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
            id: LAW_CATEGORIES.LEYES,
            name: CATEGORY_NAMES[LAW_CATEGORIES.LEYES],
            icon: 'bookshelf',
            description: 'Leyes Orgánicas, Especiales y Reglamentos',
            color: '#8B5CF6',
            navigateTo: 'LawsList',
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
            navigateTo: 'Gacetas',
        },
        {
            id: LAW_CATEGORIES.CONVENIOS,
            name: CATEGORY_NAMES[LAW_CATEGORIES.CONVENIOS],
            icon: 'earth',
            description: 'Acuerdos y tratados internacionales suscritos',
            color: '#0891B2', // Cyan 600
            navigateTo: 'LawsList',
        },
    ];

    const handleCategoryPress = (category) => {
        if (category.navigateTo === 'CodesList') {
            navigation.navigate('CodesList');
        } else if (category.navigateTo === 'Jurisprudence') {
            navigation.navigate('Jurisprudence');
        } else if (category.navigateTo === 'Gacetas') {
            navigation.navigate('Gacetas');
        } else if (category.navigateTo === 'LawsList' && category.id === LAW_CATEGORIES.LEYES) {
            navigation.navigate('LawsCategorySelector');
        } else {
            navigation.navigate('LawsList', {
                category: category.id,
                categoryName: category.name,
            });
        }
    };

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            {hasNewLaws && (
                <Banner
                    visible={hasNewLaws}
                    icon="new-box"
                    actions={[
                        { label: 'Entendido', onPress: dismissNewLawsBanner }
                    ]}
                    style={styles.newLawsBanner}
                >
                    ¡Nuevas leyes disponibles! Revisa las categorías para ver las actualizaciones.
                </Banner>
            )}
            <LinearGradient
                colors={GRADIENTS.legal}
                style={styles.header}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            >
                <View style={styles.headerTopRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.greeting}>Hola, Bienvenido</Text>
                        <Text style={styles.title}>TuLey</Text>
                        <View style={styles.titleUnderline} />
                    </View>
                    <TouchableOpacity
                        onPress={() => navigation.navigate('Favorites')}
                        style={styles.favoritesButton}
                    >
                        <IconButton
                            icon="star"
                            iconColor="#FFD700"
                            size={28}
                            style={{ margin: 0 }}
                        />
                    </TouchableOpacity>
                </View>
                <Text style={styles.subtitle}>
                    Tu guía legal digital en Venezuela
                </Text>
            </LinearGradient>

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
                                    <Surface elevation={2} style={styles.historyCard}>
                                        <View style={styles.historyContent}>
                                            <Avatar.Icon
                                                size={40}
                                                icon={item.type === 'juris' ? 'gavel' : 'book-outline'}
                                                style={{ backgroundColor: item.type === 'juris' ? COLORS.error : COLORS.accent }}
                                            />
                                            <View style={styles.historyInfo}>
                                                <Text style={styles.historyTitle} numberOfLines={1}>{item.title}</Text>
                                                <Text style={styles.historySubtitle} numberOfLines={1}>{item.subtitle}</Text>
                                            </View>
                                        </View>
                                    </Surface>
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
                        activeOpacity={0.8}
                    >
                        <Surface elevation={1} style={styles.categoryCard}>
                            <View style={styles.cardContent}>
                                <LinearGradient
                                    colors={[category.color, category.color + 'CC']}
                                    style={styles.iconContainer}
                                >
                                    <IconButton icon={category.icon} size={28} iconColor="#fff" style={{ margin: 0 }} />
                                </LinearGradient>
                                <View style={styles.categoryInfo}>
                                    <Text style={styles.categoryTitle}>{category.name}</Text>
                                    <Text style={styles.categoryDescription} numberOfLines={1}>
                                        {category.description}
                                    </Text>
                                </View>
                                <IconButton icon="chevron-right" size={20} iconColor={COLORS.textSecondary} />
                            </View>
                        </Surface>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.disclaimerFooter}>
                <Text style={styles.disclaimerText}>
                    Esta aplicación NO es un producto oficial del gobierno. El contenido es informativo y referencial.
                </Text>
                <Text style={styles.versionText}>TuLey v1.1.0</Text>
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
        paddingTop: 50,
        paddingBottom: 40,
        paddingHorizontal: 20,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
    },
    greeting: {
        fontSize: 14,
        color: '#CBD5E1',
        fontWeight: '500',
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
        marginTop: 4,
    },
    titleUnderline: {
        height: 4,
        width: 40,
        backgroundColor: COLORS.accent,
        borderRadius: 2,
        marginTop: 4,
    },
    subtitle: {
        fontSize: 14,
        color: '#94A3B8',
        marginTop: 20,
        fontStyle: 'italic',
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    favoritesButton: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: 4,
    },
    searchButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        marginTop: -25,
        marginHorizontal: 20,
        padding: 12,
        borderRadius: 15,
        elevation: 10,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
    },
    searchText: {
        flex: 1,
        fontSize: 16,
        color: COLORS.textSecondary,
        fontWeight: '500',
    },
    categoriesContainer: {
        padding: 20,
        marginTop: 10,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.primary,
        marginBottom: 16,
        letterSpacing: 0.5,
    },
    categoryCard: {
        marginBottom: 16,
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
    },
    iconContainer: {
        borderRadius: 12,
        marginRight: 15,
        width: 48,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    categoryInfo: {
        flex: 1,
    },
    categoryTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.text,
        marginBottom: 2,
    },
    categoryDescription: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    historySection: {
        marginTop: 10,
    },
    historyList: {
        paddingHorizontal: 20,
        paddingBottom: 10,
    },
    historyCard: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 16,
    },
    historyCardContainer: {
        width: 240,
        marginRight: 15,
        paddingTop: 10,
    },
    removeHistoryButton: {
        position: 'absolute',
        top: 0,
        right: 0,
        margin: 0,
        zIndex: 2,
    },
    historyContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
    },
    historyInfo: {
        marginLeft: 12,
        flex: 1,
    },
    historyTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: COLORS.text,
    },
    historySubtitle: {
        fontSize: 11,
        color: COLORS.textSecondary,
    },
    newLawsBanner: {
        backgroundColor: '#ECFDF5',
        marginHorizontal: 16,
        marginTop: 10,
        borderRadius: 12,
    },
    disclaimerFooter: {
        paddingHorizontal: 24,
        paddingVertical: 20,
        marginTop: 10,
        alignItems: 'center',
    },
    disclaimerText: {
        fontSize: 11,
        color: '#94A3B8',
        textAlign: 'center',
        lineHeight: 16,
        fontStyle: 'italic',
    },
    versionText: {
        fontSize: 10,
        color: '#CBD5E1',
        marginTop: 8,
    },
});

export default HomeScreen;
