import React, { useRef, useState } from 'react';
import {
    View, Text, StyleSheet, FlatList,
    Pressable, Modal, useWindowDimensions,
} from 'react-native';
import { Button, IconButton, ActivityIndicator } from 'react-native-paper';
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
 * @param {'general' | 'internal' | 'interpretation'} mode
 */
const SearchInfoModal = ({ visible, onDismiss, mode = 'general', data, loading }) => {
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

    const renderInterpretationItem = ({ item }) => (
        <View>
            <Text style={[styles.interpretationText, data.error && { color: COLORS.error, fontWeight: 'bold' }]}>
                {item}
            </Text>
            {!data.error && (
                <View style={styles.footerNote}>
                    <Text style={styles.footerNoteText}>
                        Interpretado por {data.provider === 'groq' ? 'Llama 3' : 'Gemini'}. No es asesoría legal.
                    </Text>
                </View>
            )}
        </View>
    );
    
    if (mode === 'interpretation') {
        return (
            <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onDismiss}>
                <View style={styles.overlay}>
                    <View style={styles.interpretationContainer}>
                        <View style={styles.interpretationHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.interpretationTag}>ANÁLISIS DE LA LEY</Text>
                                {data?.lawTitle && <Text style={styles.lawTitleSmall} numberOfLines={1}>{data.lawTitle}</Text>}
                            </View>
                            <Pressable onPress={onDismiss}>
                                <Text style={styles.closeText}>CERRAR</Text>
                            </Pressable>
                        </View>
                        
                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator color={COLORS.accent} />
                                <Text style={styles.loadingText}>La IA está analizando este artículo...</Text>
                            </View>
                        ) : data ? (
                            <FlatList
                                data={[data.error || data.interpretation]}
                                renderItem={renderInterpretationItem}
                                keyExtractor={(_, index) => index.toString()}
                                showsVerticalScrollIndicator={false}
                            />
                        ) : null}
                    </View>
                </View>
            </Modal>
        );
    }

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
                        <Pressable onPress={() => { setCurrentIndex(0); onDismiss(); }}>
                            <Text style={styles.skipText}>Omitir</Text>
                        </Pressable>
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
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    interpretationContainer: {
        backgroundColor: '#fff',
        width: '100%',
        maxHeight: '80%',
        borderRadius: 24,
        padding: 24,
    },
    interpretationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    interpretationTag: {
        fontSize: 10,
        fontWeight: '900',
        color: COLORS.accent,
        letterSpacing: 2,
    },
    lawTitleSmall: {
        fontSize: 12,
        fontWeight: 'bold',
        color: COLORS.primary,
        marginTop: 2,
    },
    closeText: {
        fontSize: 11,
        fontWeight: 'bold',
        color: COLORS.textSecondary,
    },
    interpretationText: {
        fontSize: 16,
        color: COLORS.text,
        lineHeight: 26,
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 15,
        fontSize: 14,
        color: COLORS.textSecondary,
        textAlign: 'center',
    },
    footerNote: {
        marginTop: 20,
        paddingTop: 15,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    footerNoteText: {
        fontSize: 11,
        color: '#94A3B8',
        textAlign: 'center',
        fontStyle: 'italic',
    },
});

export default SearchInfoModal;
