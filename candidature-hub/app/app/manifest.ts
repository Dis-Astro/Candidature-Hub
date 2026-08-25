import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Candidature Hub",
    short_name: "Candidature",
    description: "Gestione candidature, curriculum e colloqui",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f766e",
    lang: "it",
    categories: ["business", "productivity"],
    icons: [{ src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
