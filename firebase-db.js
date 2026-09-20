import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, collection, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCRH_6JZoRvKRgbEU_WNNtSOFZ2d83kfys",
    authDomain: "bebek-emas.firebaseapp.com",
    projectId: "bebek-emas",
    storageBucket: "bebek-emas.firebasestorage.app",
    messagingSenderId: "50335358089",
    appId: "1:50335358089:web:4cdae41ba35803c5f53a58"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Path POS (Sinkronisasi Laporan POS)
const posAppId = 'bebek-emas-pos-v3';
const getPosCol = (colName) => collection(db, 'artifacts', posAppId, 'public', 'data', colName);
const getPosDoc = (colName, docId) => doc(db, 'artifacts', posAppId, 'public', 'data', colName, docId);

// Export (bagikan) fungsi Firebase agar bisa dipakai oleh file app.js
export { auth, db, signInAnonymously, onSnapshot, getPosCol, getPosDoc, updateDoc, addDoc, deleteDoc };
