import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAI, GoogleAIBackend, type AI } from "firebase/ai";
import { getRemoteConfig, fetchAndActivate, getNumber, getString } from "firebase/remote-config";

const env = import.meta.env;

export const firebaseConfigured = Boolean(
  env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID,
);

/** Tunables that Remote Config can change without shipping a new build. */
export interface RuntimeConfig {
  /** Documents longer than this are escalated from the on-device model to the cloud model. */
  onDeviceMaxChars: number;
  /** Cloud fallback / escalation model. */
  cloudModel: string;
}

export const DEFAULT_CONFIG: RuntimeConfig = {
  onDeviceMaxChars: 3500,
  cloudModel: "gemini-3.5-flash-lite",
};

export interface FirebaseServices {
  ai: AI;
  config: RuntimeConfig;
  appCheck: "recaptcha" | "debug";
  remoteConfig: "live" | "defaults";
}

export async function initFirebase(): Promise<FirebaseServices> {
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });

  // App Check is mandatory for Firebase AI Logic. In dev (or when a debug token is supplied)
  // we use the App Check debug provider; otherwise reCAPTCHA Enterprise.
  const useDebug = Boolean(env.DEV || env.VITE_APPCHECK_DEBUG_TOKEN);
  if (useDebug) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.VITE_APPCHECK_SITE_KEY || "debug-placeholder"),
    isTokenAutoRefreshEnabled: true,
  });

  const ai = getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true });

  const rc = getRemoteConfig(app);
  rc.settings.minimumFetchIntervalMillis = env.DEV ? 0 : 3_600_000;
  rc.defaultConfig = {
    ondevice_max_chars: DEFAULT_CONFIG.onDeviceMaxChars,
    cloud_model: DEFAULT_CONFIG.cloudModel,
  };
  let remoteConfig: FirebaseServices["remoteConfig"] = "defaults";
  try {
    await fetchAndActivate(rc);
    remoteConfig = "live";
  } catch {
    /* Remote Config is a nicety: the app runs fine on the defaults above. */
  }

  return {
    ai,
    appCheck: useDebug ? "debug" : "recaptcha",
    remoteConfig,
    config: {
      onDeviceMaxChars: getNumber(rc, "ondevice_max_chars") || DEFAULT_CONFIG.onDeviceMaxChars,
      cloudModel: getString(rc, "cloud_model") || DEFAULT_CONFIG.cloudModel,
    },
  };
}
