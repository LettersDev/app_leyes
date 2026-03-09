import React from 'react';
import { View, Text, Linking, StyleSheet } from 'react-native';
import { Portal, Dialog, Button, Paragraph } from 'react-native-paper';
import { COLORS } from '../utils/constants';

const HomeDialogs = ({
    updateAvailable,
    setUpdateAvailable,
    showDisclaimer,
    acceptDisclaimer
}) => {
    return (
        <Portal>
            {/* Modal de Actualización Disponible */}
            <Dialog
                visible={!!updateAvailable}
                onDismiss={() => setUpdateAvailable(null)}
                style={{ backgroundColor: '#fff', borderRadius: 16 }}
            >
                <Dialog.Icon icon="update" color={COLORS.accent} size={40} />
                <Dialog.Title style={{ textAlign: 'center', color: COLORS.primary }}>
                    <Text>Actualización Disponible</Text>
                </Dialog.Title>
                <Dialog.Content>
                    <Paragraph style={{ textAlign: 'center' }}>
                        <Text>Hay una nueva versión de <Text style={{ fontWeight: 'bold' }}>TuLey ({updateAvailable?.latestVersion})</Text> disponible en el Play Store con mejoras y correcciones.</Text>
                    </Paragraph>
                </Dialog.Content>
                <Dialog.Actions style={{ flexDirection: 'column', gap: 10, paddingBottom: 20 }}>
                    <Button
                        mode="contained"
                        onPress={() => {
                            Linking.openURL('market://details?id=com.lettersdev.tuley');
                            setUpdateAvailable(null);
                        }}
                        style={{ width: '80%', borderRadius: 20 }}
                    >
                        <Text>Actualizar Ahora</Text>
                    </Button>
                    <Button onPress={() => setUpdateAvailable(null)}>
                        <Text>Más tarde</Text>
                    </Button>
                </Dialog.Actions>
            </Dialog>

            {/* Aviso Legal Importante */}
            <Dialog visible={showDisclaimer} onDismiss={acceptDisclaimer} style={{ backgroundColor: '#fff', borderRadius: 16 }}>
                <Dialog.Icon icon="shield-alert" color={COLORS.error} size={40} />
                <Dialog.Title style={{ textAlign: 'center', color: COLORS.primary, fontSize: 20 }}>
                    <Text>Aviso Legal Importante</Text>
                </Dialog.Title>
                <Dialog.Content>
                    <Paragraph style={{ textAlign: 'center', marginBottom: 10, fontSize: 16, fontWeight: 'bold' }}>
                        <Text>TuLey NO representa a ninguna entidad gubernamental.</Text>
                    </Paragraph>
                    <Paragraph style={{ textAlign: 'center', fontSize: 14, color: COLORS.textSecondary }}>
                        <Text>La información mostrada en esta aplicación proviene de fuentes públicas oficiales para facilitar su consulta, pero no sustituye a los documentos oficiales.</Text>
                    </Paragraph>
                    <Paragraph style={{ textAlign: 'center', marginTop: 15, fontSize: 12, color: '#64748B' }}>
                        <Text>Fuentes utilizadas:
                            {'\n'}• Tribunal Supremo de Justicia (tsj.gob.ve)
                            {'\n'}• Gaceta Oficial de la República
                            {'\n'}• Asamblea Nacional</Text>
                    </Paragraph>
                </Dialog.Content>
                <Dialog.Actions style={{ justifyContent: 'center', paddingBottom: 20 }}>
                    <Button mode="contained" onPress={acceptDisclaimer} style={{ paddingHorizontal: 20, borderRadius: 20 }}>
                        <Text>Entendido, Aceptar</Text>
                    </Button>
                </Dialog.Actions>
            </Dialog>
        </Portal>
    );
};

export default HomeDialogs;
