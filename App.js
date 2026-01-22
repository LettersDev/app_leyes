import 'react-native-gesture-handler';
import React from 'react';
import { MD3LightTheme, Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { COLORS } from './src/utils/constants';
import { SettingsProvider } from './src/context/SettingsContext';

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
