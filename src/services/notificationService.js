import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../config/supabase';

// ID del canal de Android — debe coincidir con el channelId enviado en las notificaciones
export const NOTIFICATION_CHANNEL_ID = 'tuley-default';

// Configuración de cómo se muestran las notificaciones cuando la app está abierta
// NOTA: shouldShowBanner + shouldShowList es la forma moderna (SDK 53+), no shouldShowAlert
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

export const NotificationService = {
    /**
     * Solicita permisos y registra el token en Supabase
     * Tiene un timeout de 10s para no bloquear la app si falla
     */
    registerForPushNotificationsAsync: async () => {
        // Timeout para evitar cuelgues infinitos
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Push registration timeout')), 10000)
        );

        const registrationPromise = (async () => {
            try {
                console.log('[NotificationService] Iniciando registro...');

                // Paso 1: Verificar permisos
                const { status: existingStatus } = await Notifications.getPermissionsAsync();
                let finalStatus = existingStatus;

                if (existingStatus !== 'granted') {
                    try {
                        const { status } = await Notifications.requestPermissionsAsync();
                        finalStatus = status;
                    } catch (permError) {
                        console.log('[NotificationService] Error solicitando permisos:', permError.message);
                        return null;
                    }
                }

                if (finalStatus !== 'granted') {
                    console.log('[NotificationService] Permiso de notificaciones denegado');
                    return null;
                }

                // Paso 2: Obtener projectId de forma segura
                let projectId = null;
                try {
                    projectId = Constants?.expoConfig?.extra?.eas?.projectId ||
                        Constants?.easConfig?.projectId ||
                        Constants?.expoConfig?.projectId ||
                        Constants?.manifest?.extra?.eas?.projectId ||
                        Constants?.expoConstants?.projectId ||
                        'f30a380e-3412-4c8b-a0e2-aeccec2c6b1d'; // Hardcoded fallback FINAL
                } catch (err) {
                    console.log('[NotificationService] Error obteniendo projectId:', err.message);
                    projectId = 'f30a380e-3412-4c8b-a0e2-aeccec2c6b1d'; // Fallback en caso de error
                }

                if (!projectId) {
                    console.log('[NotificationService] Push desactivado: projectId no encontrado');
                    return null;
                }

                console.log('[NotificationService] Project ID:', projectId);

                // Paso 3: Obtener token
                let token = null;
                try {
                    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
                    token = tokenData?.data;
                    console.log('[NotificationService] Token obtenido:', token ? '✓' : '✗');
                } catch (tokenError) {
                    console.log('[NotificationService] Error obteniendo token:', tokenError.message);
                    return null;
                }

                if (!token) {
                    console.log('[NotificationService] No se pudo obtener token');
                    return null;
                }

                // Guardar en Supabase — el upsert con onConflict:'token' maneja duplicados correctamente
                // NO borramos tokens de otros dispositivos aquí (ese error borraba tokens de todos los usuarios)
                try {
                    const { error } = await supabase
                        .from('push_tokens')
                        .upsert({
                            token,
                            platform: Platform.OS,
                            created_at: new Date().toISOString()
                        }, { onConflict: 'token' });

                    if (error) {
                        console.error('[NotificationService] Error guardando token:', error.message);
                    } else {
                        console.log('[NotificationService] Token guardado exitosamente');
                    }
                } catch (dbError) {
                    console.error('[NotificationService] Excepción guardando token:', dbError.message);
                }

                // Paso 5: Crear canal de Android (después de obtener el token)
                if (Platform.OS === 'android') {
                    try {
                        await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
                            name: 'TuLey',
                            importance: Notifications.AndroidImportance.HIGH,
                            vibrationPattern: [0, 250, 250, 250],
                            lightColor: '#C9A227',
                            sound: 'default',
                        });
                    } catch (channelError) {
                        console.log('[NotificationService] Error creando canal:', channelError.message);
                    }
                }

                console.log('[NotificationService] Registro completado');
                return token;
            } catch (error) {
                console.error('[NotificationService] Error crítico:', error.message);
                return null;
            }
        })();

        // Race entre timeout y registro
        try {
            return await Promise.race([registrationPromise, timeoutPromise]);
        } catch (error) {
            console.log('[NotificationService] Push registration failed or timed out:', error.message);
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
