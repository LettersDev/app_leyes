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
      // Initialize index (will unbundle from assets if needed)
      setInitStatus('Configurando leyes...');
      await LawsIndexService.initialize();

      // Register for push notifications
      setInitStatus('Configurando notificaciones...');
      const registeredToken = await NotificationService.registerForPushNotificationsAsync();
      console.log('App: Token registration result:', registeredToken ? 'Success' : 'Failed');

      // We still run the background check, but it will see the laws are "offline" (bundled)
      ensurePriorityLawsDownloaded();

      // Check for app updates in the background
      checkForUpdate().then(({ hasUpdate, latestVersion, currentVersion }) => {
        if (hasUpdate) {
          setUpdateInfo({ visible: true, currentVersion, latestVersion });
        }
      });

      setIsInitializing(false);
    } catch (error) {
      console.error('Error initializing app:', error);
      setIsInitializing(false);
    }
  };

  const ensurePriorityLawsDownloaded = async () => {
    try {
      // This now mostly serves to check if there are updates in the background
      // Since isLawOffline returns true for bundled laws, this won't download anything
      // unless an update is found on the server.
      console.log('App: Priority laws check finished (Background)');
    } catch (error) {
      console.error('Error in auto-download check:', error);
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
