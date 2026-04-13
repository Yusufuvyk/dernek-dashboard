import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDI3hLXnI2dBLDoYKAUqxUpjNKbygQ_zL0",
  authDomain: "manageapp-627da.firebaseapp.com",
  projectId: "manageapp-627da",
  storageBucket: "manageapp-627da.firebasestorage.app",
  messagingSenderId: "35420962337",
  appId: "1:35420962337:web:4ead5dae744d09a121ad60"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);