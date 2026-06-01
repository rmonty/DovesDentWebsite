// Copy this file and replace placeholder values with your Firebase project settings.

export const firebaseConfig = {
  apiKey: "AIzaSyB0dk2TyW89ThnUQOtyeR9LL-eHAOsqUdw",
  authDomain: "dovesdent-website-20260531.firebaseapp.com",
  projectId: "dovesdent-website-20260531",
  storageBucket: "dovesdent-website-20260531.firebasestorage.app",
  messagingSenderId: "1015997365136",
  appId: "1:1015997365136:web:59afbe5c20935f155e5115"
};

// Add one or more Google account emails that can access admin features.
export const ADMIN_EMAILS = [
  "rmonty98@gmail.com","dovehailrepair@gmail.com"
];

export function isConfigured() {
  return Boolean(
    firebaseConfig &&
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.authDomain &&
    firebaseConfig.appId
  );
}
