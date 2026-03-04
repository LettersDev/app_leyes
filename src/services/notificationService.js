import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, Alert } from 'react-native';
import { supabase } from '../config/supabase';

// ID del canal de Android — debe coincidir con el channelId enviado en las notificaciones
export const NOTIFICATION_CHANNEL_ID = 'tuley-default';

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

        console.log('Iniciando registro de notificaciones...');

        // Crear el canal de notificaciones en Android (necesario para usar el ícono personalizado)
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
                name: 'TuLey',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#C9A227',
                sound: 'default',
            });
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

        console.log('Permiso concedido, obteniendo token...');

        try {
            // Obtener el token de Expo
            const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
            console.log('Project ID encontrado:', projectId);

            token = (await Notifications.getExpoPushTokenAsync({
                projectId
            })).data;

            console.log('Push Token obtenido:', token);
            // Alert.alert('Debug', 'Token obtenido: ' + token);

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
            } else {
                console.log('Token registrado exitosamente en Supabase.');
            }

            return token;
        } catch (error) {
            console.error('Error al registrar notificaciones:', error);
            // Alert.alert('Error Fatal', error.message);
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
