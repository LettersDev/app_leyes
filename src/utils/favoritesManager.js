import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share, Alert } from 'react-native';

const FAVORITES_KEY = '@appleyes_favorites';

/**
 * favoritesManager.js
 * Maneja la persistencia local de leyes y jurisprudencia favoritas.
 */
const FavoritesManager = {
    /**
     * Obtiene la lista completa de favoritos
     */
    getFavorites: async () => {
        try {
            const jsonValue = await AsyncStorage.getItem(FAVORITES_KEY);
            return jsonValue != null ? JSON.parse(jsonValue) : [];
        } catch (e) {
            console.error('Error loading favorites', e);
            return [];
        }
    },

    /**
     * Agrega un item a favoritos
     * @param {Object} item - Objeto con { id, type (law|juris), title, subtitle, data }
     */
    toggleFavorite: async (item) => {
        try {
            const favorites = await FavoritesManager.getFavorites();
            const index = favorites.findIndex(f => f.id === item.id && f.type === item.type);

            let newFavorites;
            let isAdded = false;

            if (index >= 0) {
                // Quitar de favoritos
                newFavorites = favorites.filter((_, i) => i !== index);
                isAdded = false;
            } else {
                // Agregar a favoritos
                newFavorites = [...favorites, { ...item, timestamp: new Date().toISOString() }];
                isAdded = true;
            }

            await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
            return isAdded;
        } catch (e) {
            console.error('Error toggling favorite', e);
            return false;
        }
    },

    /**
     * Verifica si un item ya es favorito
     */
    isFavorite: async (id, type) => {
        const favorites = await FavoritesManager.getFavorites();
        return favorites.some(f => f.id === id && f.type === type);
    },

    /**
     * Función utilitaria para compartir contenido
     */
    shareContent: async (title, message, url = '') => {
        try {
            const result = await Share.share({
                title: title,
                message: `${message}${url ? `\n\nVer más en: ${url}` : ''}\n\nEnviado desde AppLeyes 🇻🇪`,
            });
            return result;
        } catch (error) {
            Alert.alert('Error', 'No se pudo compartir el contenido');
        }
    }
};

export default FavoritesManager;
