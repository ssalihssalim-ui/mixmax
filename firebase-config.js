// ==================== FIREBASE CONFIGURATION - ALMA COFFEE SHOP ====================

const firebaseConfig = {
    apiKey: "AIzaSyDI_GLjl0xqL1-WBhI9uPrCHXi9iFyfROU",
    authDomain: "alma-coffee-shop.firebaseapp.com",
    projectId: "alma-coffee-shop",
    storageBucket: "alma-coffee-shop.firebasestorage.app",
    messagingSenderId: "267294965703",
    appId: "1:267294965703:web:54581b103c1c5b5c16a3e2"
};

// Initialisation Firebase (version compat)
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

console.log('☕ Alma Coffee Shop - Firebase OK');
console.log('✓ Projet:', firebaseConfig.projectId);
