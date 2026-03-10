import 'react-native-gesture-handler';
import React, { useState, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { View, Text, StyleSheet, Animated, Image } from 'react-native';
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
  // Empezamos asumiendo que está inicializando para mostrar el splash animado
  const [isInitializing, setIsInitializing] = useState(true);
  const [initStatus, setInitStatus] = useState('');
  const pulseValue = useRef(new Animated.Value(1)).current;
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

  useEffect(() => {
    if (isInitializing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseValue, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseValue, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [isInitializing]);

  const checkIfFirstLaunch = async () => {
    try {
      // Siempre mostramos el splash animado al menos 1.5 segundos para el efecto "WOW"
      const animationPromise = new Promise(resolve => setTimeout(resolve, 1500));

      const hasIndex = await LawsIndexService.hasLocalIndex();

      if (!hasIndex) {
        setInitStatus('Configurando leyes...');
        await LawsIndexService.initialize();
        setInitStatus('¡Listo!');
        // Si es la primera vez, quizás tardó más de 1.5s, así que esperamos un poco más
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        // Si ya está inicializada, esperamos a que se cumplan al menos los 1.5s de animación
        await animationPromise;
      }

      setIsInitializing(false);
      // Siempre ejecutar tareas en background, tanto en primer como en sucesivos lanzamientos.
      // El registro de notificaciones ocurre siempre aquí (sin bloquear la UI).
      runBackgroundTasks();
    } catch (error) {
      console.error('Error en check inicial:', error);
      setIsInitializing(false);
    }
  };

  const runBackgroundTasks = () => {
    // Actualizar leyes en silencio
    LawsIndexService.initialize().catch(e => console.log('BG Laws Error:', e.message));

    // Actualizar token en silencio (con reintento)
    NotificationService.registerForPushNotificationsAsync()
      .then(token => console.log('BG Push Success:', token ? 'Registered' : 'No Token'))
      .catch(e => console.log('BG Push Error:', e.message));

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
            <Animated.Image
              source={require('./assets/splash-icon.png')}
              style={[
                styles.splashLogo,
                {
                  transform: [{ scale: pulseValue }],
                  opacity: pulseValue.interpolate({
                    inputRange: [1, 1.1],
                    outputRange: [0.8, 1],
                  }),
                },
              ]}
              resizeMode="contain"
            />
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
    backgroundColor: '#000000', // Matches the new logo background for seamless blend
    padding: 20,
  },
  splashLogo: {
    width: 200,
    height: 200,
    marginBottom: 20,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 13,
    color: '#94A3B8',
  },
});
