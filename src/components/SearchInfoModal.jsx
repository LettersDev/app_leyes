import React, { useRef, useState } from 'react';
import {
    View, Text, StyleSheet, FlatList,
    TouchableOpacity, Modal, useWindowDimensions,
} from 'react-native';
import { Button, IconButton } from 'react-native-paper';
import { COLORS } from '../utils/constants';

const SLIDES_GENERAL = [
    {
        id: 'g1',
        title: 'Búsqueda por Palabras Clave',
        description: 'Escribe el nombre de una ley o un término jurídico y encontraremos coincidencias exactas en toda la base legal venezolana.',
        icon: 'magnify',
        color: COLORS.primary,
    },
    {
        id: 'g2',
        title: 'Búsqueda por Significado (IA)',
        description: 'Escribe en lenguaje natural, como "¿cuáles son mis derechos laborales?" La IA busca artículos que respondan tu pregunta aunque no usen tus palabras exactas.',
        icon: 'brain',
        color: '#5B21B6',
    },
    {
        id: 'g3',
        title: 'Jurisprudencia del TSJ',
        description: 'Al mismo tiempo buscamos en las sentencias del Tribunal Supremo de Justicia. Los resultados aparecen al final de la lista.',
        icon: 'gavel',
        color: '#B45309',
    },
];

const SLIDES_INTERNAL = [
    {
        id: 'i1',
        title: 'Salto por Número de Artículo',
        description: 'Escribe solo el número (ej: "23") para ir directamente al Artículo 23 de esta ley.',
        icon: 'numeric',
        color: COLORS.primary,
    },
    {
        id: 'i2',
        title: 'Búsqueda por Texto',
        description: 'Escribe cualquier palabra o término jurídico para encontrar todos los artículos de esta ley que lo contengan.',
        icon: 'text-search',
        color: '#065F46',
    },
    {
        id: 'i3',
        title: 'Búsqueda Semántica (IA)',
        description: 'Escribe más de 2 palabras (ej: "obligaciones del arrendador") para activar la IA y buscar por significado dentro de esta ley.',
        icon: 'brain',
        color: '#5B21B6',
    },
];

/**
 * @param {'general' | 'internal'} mode
 */
const SearchInfoModal = ({ visible, onDismiss, mode = 'general' }) => {
    const { width } = useWindowDimensions();
    const [currentIndex, setCurrentIndex] = useState(0);
    const flatListRef = useRef(null);

    const SLIDES = mode === 'general' ? SLIDES_GENERAL : SLIDES_INTERNAL;

    const handleNext = () => {
        if (currentIndex < SLIDES.length - 1) {
            flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
        } else {
            setCurrentIndex(0);
            onDismiss();
        }
    };

    const renderItem = ({ item }) => (
        <View style={[styles.slide, { width }]}>
            <View style={[styles.iconContainer, { backgroundColor: item.color + '20' }]}>
                <IconButton icon={item.icon} size={100} iconColor={item.color} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
        </View>
    );

    return (
        <Modal
            visible={visible}
            transparent={false}
            animationType="slide"
            onRequestClose={onDismiss}
        >
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
                        {SLIDES.map((item, index) => (
                            <View
                                key={item.id}
                                style={[
                                    styles.dot,
                                    currentIndex === index ? styles.activeDot : null,
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
                        <Text>
                            {currentIndex === SLIDES.length - 1 ? 'Entendido' : 'Siguiente'}
                        </Text>
                    </Button>

                    {currentIndex < SLIDES.length - 1 && (
                        <TouchableOpacity onPress={() => { setCurrentIndex(0); onDismiss(); }}>
                            <Text style={styles.skipText}>Omitir</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    slide: {
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
    },
});

export default SearchInfoModal;
