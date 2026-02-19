import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

/**
 * Descarga un archivo PDF y lo guarda localmente
 * @param {string} url URL del PDF en Firebase Storage
 * @param {string} fileName Nombre con el que se guardará el archivo
 */
export const downloadFile = async (url, fileName) => {
    try {
        const fileUri = `${FileSystem.documentDirectory}${fileName}.pdf`;

        const downloadResumable = FileSystem.createDownloadResumable(
            url,
            fileUri,
            {},
            (downloadProgress) => {
                const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
                console.log(`Descarga: ${Math.round(progress * 100)}%`);
            }
        );

        const { uri } = await downloadResumable.downloadAsync();
        return uri;
    } catch (error) {
        if (!error.message || !error.message.toLowerCase().includes('network')) {
            console.error('Error al descargar archivo:', error);
            Alert.alert('Error', 'No se pudo descargar el archivo. Verifica tu conexión.');
        }
        return null;
    }
};

/**
 * Abre un archivo local
 * @param {string} localUri URI local del archivo
 */
export const openFile = async (localUri) => {
    try {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
            await Sharing.shareAsync(localUri);
        } else {
            Alert.alert('Error', 'No hay aplicaciones disponibles para abrir este archivo.');
        }
    } catch (error) {
        console.error('Error al abrir archivo:', error);
        Alert.alert('Error', 'No se pudo abrir el archivo.');
    }
};

/**
 * Verifica si un archivo ya existe localmente
 * @param {string} fileName 
 */
export const checkIfFileExists = async (fileName) => {
    const fileUri = `${FileSystem.documentDirectory}${fileName}.pdf`;
    const info = await FileSystem.getInfoAsync(fileUri);
    return info.exists ? fileUri : null;
};
