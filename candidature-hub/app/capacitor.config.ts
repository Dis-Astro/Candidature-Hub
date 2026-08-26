import type { CapacitorConfig } from "@capacitor/cli";

const configuredServerUrl = process.env.CAPACITOR_SERVER_URL?.trim();
const allowCleartext = process.env.CAPACITOR_ALLOW_CLEARTEXT === "1";

function mobileServerConfig(): CapacitorConfig["server"] | undefined {
  if (!configuredServerUrl) return undefined;

  const serverUrl = new URL(configuredServerUrl);
  if (serverUrl.protocol !== "https:" && serverUrl.protocol !== "http:") {
    throw new Error("CAPACITOR_SERVER_URL deve usare http:// o https://");
  }
  if (serverUrl.protocol === "http:" && !allowCleartext) {
    throw new Error("Per HTTP locale impostare anche CAPACITOR_ALLOW_CLEARTEXT=1. In produzione usare HTTPS.");
  }

  return {
    url: serverUrl.toString().replace(/\/$/, ""),
    cleartext: serverUrl.protocol === "http:",
    errorPath: "index.html",
  };
}

const config: CapacitorConfig = {
  appId: "it.candidaturehub.app",
  appName: "Candidature Hub",
  webDir: "native-shell",
  ...(configuredServerUrl ? { server: mobileServerConfig() } : {}),
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
  },
  android: {
    backgroundColor: "#f5f2ec",
  },
};

export default config;
