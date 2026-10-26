// Connects to Firebase. Project settings come from environment variables (see .env.example),
// so no project id is written in the code.
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore/lite";

const env = import.meta.env;
export const usingEmulators = env.VITE_USE_EMULATORS === "true";

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
export const configMissing = !usingEmulators && Object.values(config).some((v) => !v);

const app = initializeApp(usingEmulators ? { apiKey: "demo-key", projectId: env.VITE_FIREBASE_PROJECT_ID || "demo-stjbs", authDomain: "localhost" } : config);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (usingEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
