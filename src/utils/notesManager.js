import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTES_KEY = '@appleyes_notes';

/**
 * notesManager.js
 * Gestiona las notas personales añadidas a los artículos.
 */
const NotesManager = {
    /**
     * Guarda o actualiza una nota para un artículo
     * @param {string} articleId - ID único (ej: ID_LEY-INDEX_ARTICULO)
     * @param {string} noteText - El texto de la nota
     */
    saveNote: async (articleId, noteText) => {
        try {
            const notes = await NotesManager.getNotes();
            if (!noteText || noteText.trim() === '') {
                // Si el texto está vacío, eliminamos la nota
                delete notes[articleId];
            } else {
                notes[articleId] = {
                    text: noteText,
                    updatedAt: new Date().toISOString()
                };
            }
            await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(notes));
            return notes;
        } catch (error) {
            console.error('Error saving note:', error);
            return null;
        }
    },

    /**
     * Obtiene todas las notas
     */
    getNotes: async () => {
        try {
            const jsonValue = await AsyncStorage.getItem(NOTES_KEY);
            return jsonValue != null ? JSON.parse(jsonValue) : {};
        } catch (e) {
            console.error('Error getting notes:', e);
            return {};
        }
    },

    /**
     * Obtiene una nota específica
     */
    getNoteById: async (articleId) => {
        const notes = await NotesManager.getNotes();
        return notes[articleId] || null;
    },

    /**
     * Elimina una nota
     */
    deleteNote: async (articleId) => {
        return await NotesManager.saveNote(articleId, null);
    }
};

export default NotesManager;
