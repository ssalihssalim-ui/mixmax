// ==================== FIREBASE CONFIGURATION - ALMA COFFEE SHOP ====================
// 🔥 NOUVEAU PROJET : mixmax-kenitra

const firebaseConfig = {
    apiKey: "AIzaSyBC-k40GID3VsUysUE1FY5AnCwwIt721wc",
    authDomain: "mixmax-kenitra.firebaseapp.com",
    projectId: "mixmax-kenitra",
    storageBucket: "mixmax-kenitra.firebasestorage.app",
    messagingSenderId: "226043910414",
    appId: "1:226043910414:web:3ec6a43e47dbcb37f8df5f"
};

// Initialisation Firebase (version compat)
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log('✅ Firebase initialisé avec le projet:', firebaseConfig.projectId);
}

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Activer la persistance offline
db.enablePersistence()
    .then(() => console.log('📱 Mode hors ligne activé'))
    .catch(err => console.warn('⚠️ Persistance désactivée:', err));

console.log('☕ Alma Coffee Shop - Firebase OK');
console.log('✓ Projet:', firebaseConfig.projectId);
console.log('✓ Auth Domain:', firebaseConfig.authDomain);
