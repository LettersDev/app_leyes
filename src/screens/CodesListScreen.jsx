import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Card, Title, Paragraph, IconButton } from 'react-native-paper';
import { COLORS, LAW_CATEGORIES, CATEGORY_NAMES } from '../utils/constants';

const CodesListScreen = ({ navigation }) => {
    const codes = [
        {
            id: LAW_CATEGORIES.CODIGO_CIVIL,
            name: CATEGORY_NAMES[LAW_CATEGORIES.CODIGO_CIVIL],
            icon: 'scale-balance',
            description: 'Regula las relaciones civiles y patrimoniales',
            color: '#059669',
            articles: '1,982 artículos',
        },
        {
            id: LAW_CATEGORIES.CODIGO_PENAL,
            name: CATEGORY_NAMES[LAW_CATEGORIES.CODIGO_PENAL],
            icon: 'gavel',
            description: 'Tipifica delitos y establece sanciones',
            color: '#DC2626',
            articles: '546 artículos',
        },
        {
            id: LAW_CATEGORIES.CODIGO_COMERCIO,
            name: CATEGORY_NAMES[LAW_CATEGORIES.CODIGO_COMERCIO],
            icon: 'briefcase',
            description: 'Regula las relaciones comerciales',
            color: '#7C3AED',
            articles: '1,120 artículos',
        },
        {
            id: LAW_CATEGORIES.CODIGO_PROCEDIMIENTO_CIVIL,
            name: CATEGORY_NAMES[LAW_CATEGORIES.CODIGO_PROCEDIMIENTO_CIVIL],
            icon: 'file-document-outline',
            description: 'Procedimientos judiciales civiles',
            color: '#2563EB',
            articles: '944 artículos',
        },
        {
            id: LAW_CATEGORIES.CODIGO_ORGANICO_PROCESAL_PENAL,
            name: CATEGORY_NAMES[LAW_CATEGORIES.CODIGO_ORGANICO_PROCESAL_PENAL],
            icon: 'shield-account',
            description: 'Procedimientos penales (COPP)',
            color: '#EA580C',
            articles: '518 artículos',
        },
        {
            id: LAW_CATEGORIES.CODIGO_ORGANICO_TRIBUTARIO,
            name: CATEGORY_NAMES[LAW_CATEGORIES.CODIGO_ORGANICO_TRIBUTARIO],
            icon: 'cash-multiple',
            description: 'Normativa tributaria (COT)',
            color: '#0891B2',
            articles: '342 artículos',
        },
        {
            id: LAW_CATEGORIES.CODIGO_ORGANICO_JUSTICIA_MILITAR,
            name: CATEGORY_NAMES[LAW_CATEGORIES.CODIGO_ORGANICO_JUSTICIA_MILITAR],
            icon: 'shield-star',
            description: 'Justicia militar',
            color: '#65A30D',
            articles: '596 artículos',
        },
    ];

    const handleCodePress = (code) => {
        navigation.navigate('LawsList', {
            category: code.id,
            categoryName: code.name,
        });
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Códigos de Venezuela</Text>
                <Text style={styles.subtitle}>
                    Accede a todos los códigos legales del país
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
                                    <Text style={styles.articlesCount}>{code.articles}</Text>
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
