import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL ?? "http://192.168.0.37:3031";

const config: CapacitorConfig = {
  appId: "it.candidaturehub.app",
  appName: "Candidature Hub",
  webDir: "native-shell",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    allowNavigation: ["192.168.0.37", "localhost", "127.0.0.1"],
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
  },
};

export default config;
