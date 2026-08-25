import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    apiVersion: "1",
    product: "Candidature Hub",
    authentication: ["bearer"],
    features: {
      candidates: true,
      interviews: true,
      attachments: true,
      manualIngestion: true,
      roles: ["ADMIN", "RECRUITER", "VIEWER"],
    },
  });
}
