import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBm_HMv_zKDvhgZr5s8f1UdFHnnqzNF7SQ',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'urbanmend-app-7a.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'urbanmend-app-7a',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'urbanmend-app-7a.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '976371968634',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:976371968634:web:b1593eb931f8b88fa8a9c3',
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp()
const auth = getAuth(app)
const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider)
  const idToken = await result.user.getIdToken()
  return { user: result.user, idToken }
}

export async function firebaseSignOut() {
  try {
    await signOut(auth)
  } catch (err) {
    console.warn('Firebase signOut error', err)
  }
}

export { auth, googleProvider }
