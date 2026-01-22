import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SettingsContext = createContext();

const SETTINGS_KEY = '@appleyes_settings';

export const SettingsProvider = ({ children }) => {
    const [fontSize, setFontSize] = useState(16);
    const [fontFamily, setFontFamily] = useState('System');
    const [isDarkMode, setIsDarkMode] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const savedSettings = await AsyncStorage.getItem(SETTINGS_KEY);
            if (savedSettings) {
                const { fontSize: fSize, fontFamily: fFamily, isDarkMode: darkMode } = JSON.parse(savedSettings);
                if (fSize) setFontSize(fSize);
                if (fFamily) setFontFamily(fFamily);
                if (darkMode !== undefined) setIsDarkMode(darkMode);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    };

    const saveSettings = async (newSettings) => {
        try {
            const current = { fontSize, fontFamily, isDarkMode };
            const combined = { ...current, ...newSettings };
            await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(combined));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    };

    const updateFontSize = (size) => {
        setFontSize(size);
        saveSettings({ fontSize: size });
    };

    const updateFontFamily = (family) => {
        setFontFamily(family);
        saveSettings({ fontFamily: family });
    };

    const toggleDarkMode = () => {
        const next = !isDarkMode;
        setIsDarkMode(next);
        saveSettings({ isDarkMode: next });
    };

    return (
        <SettingsContext.Provider value={{
            fontSize,
            fontFamily,
            isDarkMode,
            updateFontSize,
            updateFontFamily,
            toggleDarkMode
        }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => useContext(SettingsContext);
