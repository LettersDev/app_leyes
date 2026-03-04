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
  // Empezamos asumiendo que ya está inicializada para evitar el "flash" del loading
  const [isInitializing, setIsInitializing] = useState(false);
  const [initStatus, setInitStatus] = useState('');
  const notificationListener = useRef();
  const responseListener = useRef();
  const [updateInfo, setUpdateInfo] = useState({ visible: false, currentVersion: '', latestVersion: '' });

  useEffect(() => {
    // Verificamos si realmente necesitamos inicializar
    checkIfFirstLaunch();

    // Listener para cuando el usuario TOCA la notificación
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('App: Notificación tocada con data:', data);
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  const checkIfFirstLaunch = async () => {
    try {
      const hasIndex = await LawsIndexService.hasLocalIndex();
      if (!hasIndex) {
        // Es la primera vez REAL, mostramos loading y procesamos
        setIsInitializing(true);
        setInitStatus('Configurando leyes...');
        await LawsIndexService.initialize();

        setInitStatus('Configurando notificaciones...');
        await NotificationService.registerForPushNotificationsAsync();

        setIsInitializing(false);
      } else {
        // Ya hay datos, todo lo demás en el fondo sin bloquear
        runBackgroundTasks();
      }
    } catch (error) {
      console.error('Error en check inicial:', error);
      setIsInitializing(false);
    }
  };

  const runBackgroundTasks = () => {
    // Actualizar leyes en silencio
    LawsIndexService.initialize().catch(e => console.log('BG Laws Error:', e.message));

    // Actualizar token en silencio
    NotificationService.registerForPushNotificationsAsync().catch(e => console.log('BG Push Error:', e.message));

    // Buscar updates de la app
    checkForUpdate().then(({ hasUpdate, latestVersion, currentVersion }) => {
      if (hasUpdate) setUpdateInfo({ visible: true, currentVersion, latestVersion });
    });
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
