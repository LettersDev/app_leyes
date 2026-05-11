import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
import GacetaDetailScreen from '../screens/GacetaDetailScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import DailyQuizScreen from '../screens/DailyQuizScreen';
import QuizHistoryScreen from '../screens/QuizHistoryScreen';
import AIConsultScreen from '../screens/AIConsultScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View } from 'react-native';

const Stack = createNativeStackNavigator();

const linking = {
    prefixes: ['tuley://'],
    config: {
        screens: {
            Home: 'home',
            Jurisprudence: 'juris',
            Gacetas: 'gacetas',
            LawDetail: 'law/:id',
            JurisprudenceDetail: 'sentencia/:id',
            DailyQuiz: 'quiz',
            QuizHistory: 'quiz-history',
        },
    },
};

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
        <NavigationContainer linking={linking}>
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
                    name="GacetaDetail"
                    component={GacetaDetailScreen}
                    options={({ route }) => ({
                        title: `Gaceta N° ${route.params?.gaceta?.numero_display || ''}` || 'Gaceta Oficial'
                    })}
                />
                <Stack.Screen
                    name="Onboarding"
                    component={OnboardingScreen}
                    options={{ headerShown: false }}
                />
                <Stack.Screen
                    name="DailyQuiz"
                    component={DailyQuizScreen}
                    options={{ title: 'Pregunta del Día', headerShown: false }}
                />
                <Stack.Screen
                    name="QuizHistory"
                    component={QuizHistoryScreen}
                    options={{ title: 'Historial', headerShown: false }}
                />
                <Stack.Screen
                    name="AIConsult"
                    component={AIConsultScreen}
                    options={{ title: 'Asistente Legal' }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
};

export default AppNavigator;
