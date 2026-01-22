# AppLeyes - Leyes de Venezuela

Aplicación móvil desarrollada con React Native (Expo) para consultar las leyes de Venezuela de forma rápida y sencilla.

## 🚀 Características

- 📖 Consulta de leyes venezolanas (Constitución, Códigos, etc.)
- 🔍 Búsqueda de leyes por texto
- 📱 Interfaz moderna y fácil de usar
- 🔄 Actualización automática desde TSJ y Gaceta Oficial (próximamente)
- 🔥 Backend con Firebase Firestore

## 📋 Requisitos Previos

- Node.js (v14 o superior)
- npm o yarn
- Expo CLI
- Cuenta de Firebase

## 🛠️ Instalación

1. **Clonar el repositorio** (o ya estás en la carpeta del proyecto)

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar Firebase**
   
   a. Crear un proyecto en [Firebase Console](https://console.firebase.google.com/)
   
   b. Habilitar Firestore Database
   
   c. Copiar la configuración de Firebase y reemplazar en `src/config/firebase.js`:
   ```javascript
   const firebaseConfig = {
     apiKey: "TU_API_KEY",
     authDomain: "TU_AUTH_DOMAIN",
     projectId: "TU_PROJECT_ID",
     storageBucket: "TU_STORAGE_BUCKET",
     messagingSenderId: "TU_MESSAGING_SENDER_ID",
     appId: "TU_APP_ID"
   };
   ```

4. **Poblar la base de datos** (próximamente - script automático)
   
   Por ahora, puedes importar manualmente los datos desde:
   - `data/constitucion.json`
   - `data/codigo_civil.json`

## 🎯 Uso

### Ejecutar en desarrollo

```bash
# Web
npm run web

# Android (requiere Android Studio o dispositivo)
npm run android

# iOS (requiere macOS y Xcode)
npm run ios
```

### Escanear código QR con Expo Go

1. Ejecuta `npm start`
2. Escanea el código QR con la app Expo Go en tu teléfono

## 📁 Estructura del Proyecto

```
AppLeyes/
├── src/
│   ├── config/          # Configuración (Firebase)
│   ├── navigation/      # Navegación de la app
│   ├── screens/         # Pantallas
│   │   ├── HomeScreen.jsx
│   │   ├── LawsListScreen.jsx
│   │   ├── LawDetailScreen.jsx
│   │   └── SearchScreen.jsx
│   ├── services/        # Servicios (API, Firebase)
│   ├── components/      # Componentes reutilizables
│   └── utils/           # Utilidades y constantes
├── data/                # Datos de ejemplo
├── functions/           # Firebase Functions (próximamente)
├── App.js               # Punto de entrada
└── package.json
```

## 🔥 Firebase

### Estructura de Firestore

**Colección: `laws`**

```javascript
{
  id: "auto-generated-id",
  title: "Constitución de la República Bolivariana de Venezuela",
  category: "constitucion", // constitucion, codigo_civil, codigo_penal, tsj, gaceta
  type: "ley_base", // ley_base, sentencia, decreto
  date: Timestamp,
  content: {
    articles: [
      {
        number: 1,
        title: "Artículo 1",
        text: "La República Bolivariana de Venezuela..."
      }
    ]
  },
  source: "manual", // manual, tsj_scraping, gaceta_scraping
  lastUpdated: Timestamp,
  searchableText: "texto completo para búsqueda...",
  metadata: {
    gacetaNumber: "123",
    sentenceNumber: "456"
  }
}
```

## 🎨 Tecnologías Utilizadas

- **React Native** - Framework móvil
- **Expo** - Plataforma de desarrollo
- **Firebase Firestore** - Base de datos
- **React Navigation** - Navegación
- **React Native Paper** - Componentes UI

## 📝 Próximas Funcionalidades

- [ ] Web scraping automático de TSJ
- [ ] Web scraping automático de Gaceta Oficial
- [ ] Notificaciones de nuevas leyes
- [ ] Favoritos y marcadores
- [ ] Modo offline
- [ ] Compartir leyes
- [ ] Agregar más códigos (Penal, LOTTT, etc.)

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto es de código abierto y está disponible bajo la licencia MIT.

## 👨‍💻 Autor

Luis Rodriguez

## 📞 Soporte

Si tienes alguna pregunta o problema, por favor abre un issue en el repositorio.
