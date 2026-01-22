import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions, TouchableOpacity } from 'react-native';
import { Button, IconButton, useTheme } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../utils/constants';

const { width, height } = Dimensions.get('window');

const SLIDES = [
    {
        id: '1',
        title: 'AppLeyes Venezuela',
        description: 'Toda la base legal de la República en un solo lugar. La herramienta definitiva para abogados y ciudadanos.',
        icon: 'scale-balance',
        color: COLORS.primary
    },
    {
        id: '2',
        title: 'Jurisprudencia en Vivo',
        description: 'Consulta las últimas sentencias del TSJ seleccionadas y limpias para una lectura cómoda y nativa.',
        icon: 'gavel',
        color: '#DC2626'
    },
    {
        id: '3',
        title: 'Modo Offline',
        description: 'No dependas del internet. Descarga leyes completas y consúltalas en tribunales o zonas sin cobertura.',
        icon: 'cloud-download',
        color: COLORS.secondary
    },
    {
        id: '4',
        title: 'Favoritos y Compartir',
        description: 'Guarda artículos importantes y compártelos al instante vía WhatsApp con tus colegas y clientes.',
        icon: 'star',
        color: '#FFD700'
    }
];

const OnboardingScreen = ({ navigation }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const flatListRef = useRef(null);

    const handleNext = async () => {
        if (currentIndex < SLIDES.length - 1) {
            flatListRef.current.scrollToIndex({ index: currentIndex + 1 });
        } else {
            // Guardar que ya vio el onboarding y navegar al Home
            await AsyncStorage.setItem('@onboarding_complete', 'true');
            navigation.replace('Home');
        }
    };

    const renderItem = ({ item }) => (
        <View style={styles.slide}>
            <View style={[styles.iconContainer, { backgroundColor: item.color + '20' }]}>
                <IconButton icon={item.icon} size={100} iconColor={item.color} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <FlatList
                ref={flatListRef}
                data={SLIDES}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                    const index = Math.round(e.nativeEvent.contentOffset.x / width);
                    setCurrentIndex(index);
                }}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
            />

            <View style={styles.footer}>
                <View style={styles.pagination}>
                    {SLIDES.map((_, index) => (
                        <View
                            key={index}
                            style={[
                                styles.dot,
                                currentIndex === index ? styles.activeDot : null
                            ]}
                        />
                    ))}
                </View>

                <Button
                    mode="contained"
                    onPress={handleNext}
                    style={styles.button}
                    labelStyle={styles.buttonLabel}
                >
                    {currentIndex === SLIDES.length - 1 ? 'Empezar' : 'Siguiente'}
                </Button>

                {currentIndex < SLIDES.length - 1 && (
                    <TouchableOpacity onPress={async () => {
                        await AsyncStorage.setItem('@onboarding_complete', 'true');
                        navigation.replace('Home');
                    }}>
                        <Text style={styles.skipText}>Omitir</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    slide: {
        width,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    iconContainer: {
        width: 200,
        height: 200,
        borderRadius: 100,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 40,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: COLORS.primary,
        marginBottom: 16,
        textAlign: 'center',
    },
    description: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        lineHeight: 24,
    },
    footer: {
        paddingHorizontal: 40,
        paddingBottom: 60,
    },
    pagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 30,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#D1D5DB',
        marginHorizontal: 4,
    },
    activeDot: {
        width: 24,
        backgroundColor: COLORS.primary,
    },
    button: {
        borderRadius: 12,
        paddingVertical: 4,
        backgroundColor: COLORS.primary,
    },
    buttonLabel: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    skipText: {
        textAlign: 'center',
        marginTop: 20,
        color: '#9CA3AF',
        fontSize: 14,
    }
});

export default OnboardingScreen;
