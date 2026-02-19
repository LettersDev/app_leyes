import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MD3LightTheme, Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { COLORS } from './src/utils/constants';
import { SettingsProvider } from './src/context/SettingsContext';
import LawsIndexService from './src/services/lawsIndexService';
import { downloadLawContent } from './src/services/lawService';
import OfflineService from './src/services/offlineService';

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

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Check if we have local index
      const hasIndex = await LawsIndexService.hasLocalIndex();

      if (!hasIndex) {
        setInitStatus('Descargando índice de leyes...');
        await LawsIndexService.downloadFullIndex();
      } else {
        // Just initialize (check for updates if needed)
        console.log('App: Verifying updates (background)...');
        setInitStatus('Verificando actualizaciones...');
        LawsIndexService.initialize().catch(err => console.error('Background init error:', err));
      }

      // Check and download priority laws (Constitution + Codes)
      setInitStatus('Verificando leyes principales...');

      // Start download in background, do not await
      ensurePriorityLawsDownloaded();

      setIsInitializing(false);
    } catch (error) {
      console.error('Error initializing app:', error);
      // Continue anyway, app will work with Supabase fallback
      setIsInitializing(false);
    }
  };

  const ensurePriorityLawsDownloaded = async () => {
    try {
      console.log('App: Auto-download check started (background)');

      // SOLO descargar la Constitución automáticamente
      const lawId = 'constitucion';
      const isOffline = await OfflineService.isLawOffline(lawId);

      if (!isOffline) {
        console.log(`Auto-downloading essential law: ${lawId}`);
        try {
          await downloadLawContent(lawId);
          console.log(`Successfully downloaded ${lawId}`);
        } catch (e) {
          console.log(`Could not download ${lawId}:`, e.message);
        }
      }
      console.log('App: Auto-download check finished');
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
