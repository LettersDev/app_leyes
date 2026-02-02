import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Card, Title, Paragraph, IconButton } from 'react-native-paper';
import { COLORS } from '../utils/constants';
import LawsIndexService from '../services/lawsIndexService';
import { getLawsByParentCategory } from '../services/lawService';

// Mapeo de iconos por categoría (fallback para códigos conocidos)
const CODE_ICONS = {
    'codigo_civil': { icon: 'scale-balance', color: '#059669' },
    'codigo_penal': { icon: 'gavel', color: '#DC2626' },
    'codigo_comercio': { icon: 'briefcase', color: '#7C3AED' },
    'codigo_procedimiento_civil': { icon: 'file-document-outline', color: '#2563EB' },
    'codigo_organico_procesal_penal': { icon: 'shield-account', color: '#EA580C' },
    'codigo_organico_tributario': { icon: 'cash-multiple', color: '#0891B2' },
    'codigo_organico_justicia_militar': { icon: 'shield-star', color: '#65A30D' },
    'codigo_abogado': { icon: 'account-tie', color: '#4F46E5' },
    'codigo_deontologia': { icon: 'medical-bag', color: '#E11D48' },
};

// Colores para códigos nuevos (rotación automática)
const DEFAULT_COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#14B8A6', '#F59E0B', '#10B981'];

const CodesListScreen = ({ navigation }) => {
    const [codes, setCodes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCodes();
    }, []);

    const loadCodes = async () => {
        try {
            // Cargar códigos desde el índice local (soporta ambos formatos)
            let allCodes = await LawsIndexService.getAllCodesLocal();

            // Si no hay índice local, intentar con Firebase
            if (!allCodes || allCodes.length === 0) {
                allCodes = await getLawsByParentCategory('codigos');
            }

            // Formatear para mostrar
            const formattedCodes = allCodes.map((code, index) => {
                const iconConfig = CODE_ICONS[code.category] || {
                    icon: 'book-open-variant',
                    color: DEFAULT_COLORS[index % DEFAULT_COLORS.length]
                };

                // Contar artículos si hay contenido
                const articleCount = code.content?.articles?.filter(a => a.type === 'article').length || 0;

                return {
                    id: code.id,
                    category: code.category,
                    name: code.title,
                    description: code.description || 'Código legal de Venezuela',
                    icon: iconConfig.icon,
                    color: iconConfig.color,
                    articles: articleCount > 0 ? `${articleCount} artículos` : '',
                };
            });

            setCodes(formattedCodes);
        } catch (error) {
            console.error('Error loading codes:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCodePress = (code) => {
        navigation.navigate('LawsList', {
            category: code.category,
            categoryName: code.name,
        });
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Cargando códigos...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Códigos de Venezuela</Text>
                <Text style={styles.subtitle}>
                    {codes.length} códigos disponibles
                </Text>
            </View>

            <View style={styles.codesContainer}>
                {codes.map((code) => (
                    <TouchableOpacity
                        key={code.id}
                        onPress={() => handleCodePress(code)}
                    >
                        <Card style={styles.codeCard}>
                            <Card.Content style={styles.cardContent}>
                                <View style={[styles.iconContainer, { backgroundColor: code.color }]}>
                                    <IconButton icon={code.icon} size={28} iconColor="#fff" />
                                </View>
                                <View style={styles.codeInfo}>
                                    <Title style={styles.codeTitle}>{code.name}</Title>
                                    <Paragraph style={styles.codeDescription}>
                                        {code.description}
                                    </Paragraph>
                                    {code.articles ? (
                                        <Text style={styles.articlesCount}>{code.articles}</Text>
                                    ) : null}
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.background,
    },
    loadingText: {
        marginTop: 12,
        color: COLORS.textSecondary,
    },
    header: {
        padding: 20,
        backgroundColor: COLORS.primary,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        color: '#E5E7EB',
    },
    codesContainer: {
        padding: 16,
    },
    codeCard: {
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
    codeInfo: {
        flex: 1,
    },
    codeTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: COLORS.text,
        marginBottom: 4,
    },
    codeDescription: {
        fontSize: 12,
        color: COLORS.textSecondary,
        marginBottom: 4,
    },
    articlesCount: {
        fontSize: 11,
        color: COLORS.primary,
        fontWeight: '500',
    },
});

export default CodesListScreen;

