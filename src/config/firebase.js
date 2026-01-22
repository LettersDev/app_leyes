import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Configuración de Firebase para AppLeyes (Nuevo Proyecto: appley-3f0fb)
const firebaseConfig = {
    apiKey: "AIzaSyCgMdSE-aiAkyGIFYWzCHCGTfB_6n9vrkc",
    authDomain: "appley-3f0fb.firebaseapp.com",
    projectId: "appley-3f0fb",
    storageBucket: "appley-3f0fb.firebasestorage.app",
    messagingSenderId: "591288865686",
    appId: "1:591288865686:web:b7f16ebd3bd3edf90443b7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
export default app;
