import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Modal, Portal, Text, IconButton, Button, SegmentedButtons } from 'react-native-paper';
import { useSettings } from '../context/SettingsContext';
import { COLORS } from '../utils/constants';

const ReadingSettingsModal = ({ visible, onDismiss }) => {
    const { fontSize, fontFamily, updateFontSize, updateFontFamily } = useSettings();

    return (
        <Portal>
            <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.container}>
                <Text style={styles.title}>Ajustes de Lectura</Text>

                <View style={styles.section}>
                    <Text style={styles.label}>Tamaño de letra: {fontSize}px</Text>
                    <View style={styles.row}>
                        <IconButton
                            icon="minus-circle-outline"
                            size={32}
                            onPress={() => updateFontSize(Math.max(12, fontSize - 2))}
                        />
                        <View style={styles.preview}>
                            <Text style={{ fontSize, fontFamily: fontFamily === 'Serif' ? 'serif' : 'System' }}>Aa</Text>
                        </View>
                        <IconButton
                            icon="plus-circle-outline"
                            size={32}
                            onPress={() => updateFontSize(Math.min(30, fontSize + 2))}
                        />
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.label}>Tipo de fuente</Text>
                    <SegmentedButtons
                        value={fontFamily}
                        onValueChange={updateFontFamily}
                        buttons={[
                            { value: 'System', label: 'Moderna (Sans)' },
                            { value: 'Serif', label: 'Formal (Serif)' },
                        ]}
                        style={styles.segmented}
                    />
                </View>

                <Button mode="contained" onPress={onDismiss} style={styles.closeButton}>
                    Listo
                </Button>
            </Modal>
        </Portal>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'white',
        padding: 20,
        margin: 20,
        borderRadius: 12,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
        color: COLORS.primary,
    },
    section: {
        marginBottom: 24,
    },
    label: {
        fontSize: 14,
        color: '#666',
        marginBottom: 8,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    preview: {
        width: 60,
        height: 60,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        marginHorizontal: 10,
    },
    segmented: {
        marginTop: 8,
    },
    closeButton: {
        marginTop: 10,
    }
});

export default ReadingSettingsModal;
