import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Portal, Dialog, Button, TextInput } from 'react-native-paper';
import { COLORS } from '../utils/constants';

const LawDetailDialogs = ({
    noteDialogVisible,
    setNoteDialogVisible,
    editingNote,
    setEditingNote,
    handleSaveNote
}) => {
    return (
        <Portal>
            <Dialog visible={noteDialogVisible} onDismiss={() => setNoteDialogVisible(false)} style={styles.noteDialog}>
                <Dialog.Title style={styles.noteDialogTitle}>
                    <Text>Nota personal: {editingNote.title}</Text>
                </Dialog.Title>
                <Dialog.Content>
                    <TextInput
                        label="Escribe tu anotación aquí..."
                        value={editingNote.text}
                        onChangeText={text => setEditingNote(prev => ({ ...prev, text }))}
                        multiline
                        numberOfLines={5}
                        mode="outlined"
                        style={styles.noteInput}
                    />
                </Dialog.Content>
                <Dialog.Actions>
                    <Button onPress={() => setNoteDialogVisible(false)}>
                        <Text>Cancelar</Text>
                    </Button>
                    <Button onPress={handleSaveNote} mode="contained">
                        <Text>Guardar</Text>
                    </Button>
                </Dialog.Actions>
            </Dialog>
        </Portal>
    );
};

const styles = StyleSheet.create({
    noteDialog: { backgroundColor: '#fff', borderRadius: 15 },
    noteDialogTitle: { color: COLORS.primary, fontSize: 18 },
    noteInput: { backgroundColor: '#fff', marginTop: 10 },
});

export default LawDetailDialogs;
