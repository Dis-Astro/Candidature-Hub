import { NextRequest } from "next/server";
import { authorizeRequest, isAuthError } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

function csv(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN", "RECRUITER", "VIEWER"]);
  if (isAuthError(auth)) return auth;
  const candidates = await prisma.candidate.findMany({ orderBy: { displayId: "asc" }, include: { interviews: { orderBy: { date: "desc" }, take: 1 } } });
  const rows = [
    ["ID", "Nome", "Cognome", "Email", "Telefono", "Mansione", "Stato", "Rating", "Intervistato", "Ultimo colloquio", "Decisione"],
    ...candidates.map(item => [item.displayId, item.firstName, item.lastName, item.email, item.phone, item.mansione, item.status, item.rating, item.interviewed ? "Sì" : "No", item.interviews[0]?.date?.toISOString(), item.interviews[0]?.decision]),
  ];
  const body = "\uFEFF" + rows.map(row => row.map(csv).join(";")).join("\r\n");
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="candidati-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
