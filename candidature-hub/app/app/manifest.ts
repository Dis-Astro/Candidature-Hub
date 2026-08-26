import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Candidature Hub",
    short_name: "Candidature",
    description: "Gestione candidature, curriculum e colloqui",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#f5f2ec",
    theme_color: "#f5f2ec",
    lang: "it",
    categories: ["business", "productivity"],
    icons: [
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nuovo candidato", short_name: "Nuovo", url: "/candidates/new", icons: [{ src: "/app-icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Candidati", short_name: "Candidati", url: "/candidates", icons: [{ src: "/app-icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Importazioni", short_name: "Import", url: "/imports", icons: [{ src: "/app-icon.svg", sizes: "any", type: "image/svg+xml" }] },
    ],
  };
}
