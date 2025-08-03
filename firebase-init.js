// firebase-init.js

// Firebase SDK Imports
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"; // Removed signInAnonymously
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Your Pilavee Firebase Project Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDI-mQ4V8kHIm6RAnAsZzsd9XumbyG4vw4",
    authDomain: "pilavee-56ada.firebaseapp.com",
    projectId: "pilavee-56ada",
    storageBucket: "pilavee-56ada.firebasestorage.app",
    messagingSenderId: "146406982872",
    appId: "1:146406982872:web:d47d0de9db54daac2683ad"
};

// Initialize Firebase App (only if not already initialized)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Get Firebase service instances
export const auth = getAuth(app);
export const db = getFirestore(app);

// Export the app instance if needed elsewhere
export { app };

// --- Authentication State Listener (No longer forces anonymous sign-in) ---
// This listener is primarily for debugging and understanding auth state.
// auth.js will handle redirects for unauthenticated users.
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("User is signed in:", user.uid, user.email);
    } else {
        console.log("No user is signed in.");
    }
});
