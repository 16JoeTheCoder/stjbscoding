// Connects to Firebase. Project settings come from environment variables (see .env.example),
// so no project id is written in the code.
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore/lite";

// Each variable is read by its full name so Vite can replace it at build time and drop the
// emulator code from production builds.
export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const configMissing = !usingEmulators && Object.values(config).some((v) => !v);

const app = initializeApp(import.meta.env.VITE_USE_EMULATORS === "true"
  ? { apiKey: "demo-key", projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "demo-stjbs", authDomain: "localhost" }
  : config);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
