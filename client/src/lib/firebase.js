import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  updateProfile,
} from 'firebase/auth'

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

export async function registerWithFirebaseEmail(email, password, displayName = '') {
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  if (displayName) {
    try {
      await updateProfile(cred.user, { displayName })
    } catch {}
  }
  await sendEmailVerification(cred.user)
  return cred.user
}

export async function loginWithFirebaseEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

export async function resendVerificationEmail() {
  if (auth.currentUser) {
    await sendEmailVerification(auth.currentUser)
  }
}

export async function reloadFirebaseUser() {
  if (auth.currentUser) {
    await auth.currentUser.reload()
    return auth.currentUser
  }
  return null
}

export function initRecaptcha(containerId = 'recaptcha-container') {
  if (window.recaptchaVerifier) {
    try {
      window.recaptchaVerifier.clear()
    } catch {}
    window.recaptchaVerifier = null
  }
  window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
  })
  return window.recaptchaVerifier
}

export async function sendFirebasePhoneOtp(phoneNumber, verifier) {
  const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier)
  return confirmationResult
}

export async function firebaseSignOut() {
  try {
    await signOut(auth)
  } catch (err) {
    console.warn('Firebase signOut error', err)
  }
}

export { auth, googleProvider }
