import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { COLORS } from '../utils/constants';

// Importar pantallas
import HomeScreen from '../screens/HomeScreen';
import CodesListScreen from '../screens/CodesListScreen';
import LawsListScreen from '../screens/LawsListScreen';
import LawsCategorySelectorScreen from '../screens/LawsCategorySelectorScreen';
import LawDetailScreen from '../screens/LawDetailScreen';
import SearchScreen from '../screens/SearchScreen';
import JurisprudenceScreen from '../screens/JurisprudenceScreen';
import GacetasScreen from '../screens/GacetasScreen';
import JurisprudenceDetailScreen from '../screens/JurisprudenceDetailScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View } from 'react-native';

const Stack = createStackNavigator();

const AppNavigator = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [showOnboarding, setShowOnboarding] = useState(true);

    useEffect(() => {
        checkOnboardingStatus();
    }, []);

    const checkOnboardingStatus = async () => {
        try {
            const value = await AsyncStorage.getItem('@onboarding_complete');
            if (value === 'true') {
                setShowOnboarding(false);
            }
        } catch (e) {
            console.error('Error checking onboarding status', e);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <NavigationContainer>
            <Stack.Navigator
                initialRouteName={showOnboarding ? "Onboarding" : "Home"}
                screenOptions={{
                    headerStyle: {
                        backgroundColor: COLORS.primary,
                    },
                    headerTintColor: '#fff',
                    headerTitleStyle: {
                        fontWeight: 'bold',
                    },
                }}
            >
                <Stack.Screen
                    name="Home"
                    component={HomeScreen}
                    options={{ title: 'Leyes de Venezuela' }}
                />
                <Stack.Screen
                    name="CodesList"
                    component={CodesListScreen}
                    options={{ title: 'Códigos' }}
                />
                <Stack.Screen
                    name="LawsCategorySelector"
                    component={LawsCategorySelectorScreen}
                    options={{ title: 'Leyes y Reglamentos' }}
                />
                <Stack.Screen
                    name="LawsList"
                    component={LawsListScreen}
                    options={({ route }) => ({
                        title: route.params?.categoryName || 'Leyes'
                    })}
                />
                <Stack.Screen
                    name="LawDetail"
                    component={LawDetailScreen}
                    options={{ title: 'Detalle de Ley' }}
                />
                <Stack.Screen
                    name="Search"
                    component={SearchScreen}
                    options={{ title: 'Buscar Leyes' }}
                />
                <Stack.Screen
                    name="Jurisprudence"
                    component={JurisprudenceScreen}
                    options={{ title: 'Jurisprudencia TSJ' }}
                />
                <Stack.Screen
                    name="Gacetas"
                    component={GacetasScreen}
                    options={{ title: 'Gaceta Oficial' }}
                />
                <Stack.Screen
                    name="Favorites"
                    component={FavoritesScreen}
                    options={{ title: 'Mis Favoritos' }}
                />
                <Stack.Screen
                    name="JurisprudenceDetail"
                    component={JurisprudenceDetailScreen}
                    options={({ route }) => ({
                        title: route.params?.title || 'Sentencia'
                    })}
                />
                <Stack.Screen
                    name="Onboarding"
                    component={OnboardingScreen}
                    options={{ headerShown: false }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
};

export default AppNavigator;
