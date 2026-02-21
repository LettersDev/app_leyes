import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../config/supabase';

// Configuración de cómo se muestran las notificaciones cuando la app está abierta
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

export const NotificationService = {
    /**
     * Solicita permisos y registra el token en Supabase
     */
    registerForPushNotificationsAsync: async () => {
        let token;

        if (!Device.isDevice) {
            console.log('Notificaciones Push solo funcionan en dispositivos físicos.');
            return null;
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('Permiso de notificaciones rechazado.');
            return null;
        }

        try {
            // Obtener el token de Expo
            const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;

            token = (await Notifications.getExpoPushTokenAsync({
                projectId
            })).data;

            console.log('Push Token obtenido:', token);

            // Guardar en Supabase
            const { error } = await supabase
                .from('push_tokens')
                .upsert({
                    token,
                    platform: Platform.OS,
                    created_at: new Date().toISOString()
                }, { onConflict: 'token' });

            if (error) {
                console.error('Error guardando token en Supabase:', error.message);
            }

            return token;
        } catch (error) {
            console.error('Error al registrar notificaciones:', error);
            return null;
        }
    },

    /**
     * Listener opcional para cuando llega una notificación con la app abierta
     */
    addListener: (callback) => {
        return Notifications.addNotificationReceivedListener(callback);
    },

    /**
     * Listener para cuando el usuario toca la notificación
     */
    addResponseListener: (callback) => {
        return Notifications.addNotificationResponseReceivedListener(callback);
    }
};

export default NotificationService;
