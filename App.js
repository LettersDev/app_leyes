import 'react-native-gesture-handler';
import React, { useState, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MD3LightTheme, Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { COLORS } from './src/utils/constants';
import { SettingsProvider } from './src/context/SettingsContext';
import LawsIndexService from './src/services/lawsIndexService';
import { downloadLawContent } from './src/services/lawService';
import OfflineService from './src/services/offlineService';
import { checkForUpdate } from './src/services/updateService';
import UpdateModal from './src/components/UpdateModal';
import NotificationService from './src/services/notificationService';

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: COLORS.primary,
    secondary: COLORS.secondary,
    error: COLORS.error,
  },
};

export default function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initStatus, setInitStatus] = useState('Iniciando...');
  const notificationListener = useRef();
  const responseListener = useRef();
  const [updateInfo, setUpdateInfo] = useState({ visible: false, currentVersion: '', latestVersion: '' });

  useEffect(() => {
    initializeApp();

    // Listener para cuando el usuario TOCA la notificación
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('App: Notificación tocada con data:', data);

      // La navegación se manejará vía deep linking o aquí si es necesario manual
      // Pero con el ResponseListener podemos forzar acciones
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  const initializeApp = async () => {
    try {
      // Check if this is the first launch (no local index yet)
      const hasIndex = await LawsIndexService.hasLocalIndex();

      if (!hasIndex) {
        // PRIMERA VEZ: mostrar pantalla de carga y esperar
        setInitStatus('Configurando leyes...');
        await LawsIndexService.initialize();

        setInitStatus('Configurando notificaciones...');
        NotificationService.registerForPushNotificationsAsync()
          .then(token => console.log('App: Token:', token ? 'OK' : 'Failed'))
          .catch(err => console.log('App: Push registration error:', err.message));

        // Check for app updates in the background
        checkForUpdate().then(({ hasUpdate, latestVersion, currentVersion }) => {
          if (hasUpdate) setUpdateInfo({ visible: true, currentVersion, latestVersion });
        });

        setIsInitializing(false);
      } else {
        // APERTURAS SUBSECUENTES: entrar directo, todo en background
        setIsInitializing(false);

        // Verificar actualizaciones en background (silenciosamente)
        LawsIndexService.initialize().catch(err =>
          console.log('BG laws update error:', err.message)
        );

        NotificationService.registerForPushNotificationsAsync()
          .then(token => console.log('App: Token:', token ? 'OK' : 'Failed'))
          .catch(err => console.log('App: Push registration error:', err.message));

        checkForUpdate().then(({ hasUpdate, latestVersion, currentVersion }) => {
          if (hasUpdate) setUpdateInfo({ visible: true, currentVersion, latestVersion });
        });
      }
    } catch (error) {
      console.error('Error initializing app:', error);
      setIsInitializing(false);
    }
  };

  if (isInitializing) {
    return (
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>{initStatus}</Text>
            <Text style={styles.loadingSubtext}>
              Esto solo ocurre la primera vez
            </Text>
          </View>
        </PaperProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <PaperProvider theme={theme}>
          <AppNavigator />
          <UpdateModal
            visible={updateInfo.visible}
            currentVersion={updateInfo.currentVersion}
            latestVersion={updateInfo.latestVersion}
            onDismiss={() => setUpdateInfo(prev => ({ ...prev, visible: false }))}
          />
        </PaperProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
});
