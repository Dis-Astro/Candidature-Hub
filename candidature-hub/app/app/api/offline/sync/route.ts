import { NextRequest, NextResponse } from "next/server";
import { Decision, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, isAuthError } from "@/lib/auth";
import type { OfflineOperation, OfflineSyncItemResult } from "../../../../lib/offline-types";

const MAX_OPERATIONS = 50;
const OPERATION_ID = /^[a-zA-Z0-9_-]{8,100}$/;
const QUICK_ACTIONS = new Set(["discard", "restore", "shortlist", "hire"]);

function text(payload: Record<string, unknown>, key: string): string {
  return String(payload[key] ?? "").trim();
}

function nullableText(payload: Record<string, unknown>, key: string): string | null {
  return text(payload, key) || null;
}

function stringList(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 30);
}

function ratingValue(payload: Record<string, unknown>): number | null {
  const raw = payload.rating;
  if (raw === "" || raw == null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(10, Math.round(parsed))) : null;
}

function resultFromAudit(details: string | null, operationId: string): OfflineSyncItemResult | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as { operationId?: string; result?: OfflineSyncItemResult };
    return parsed.operationId === operationId && parsed.result ? { ...parsed.result, status: "duplicate" } : null;
  } catch {
    return null;
  }
}

async function findCandidate(tx: Prisma.TransactionClient, candidateId: string) {
  const numeric = /^\d+$/.test(candidateId);
  return tx.candidate.findFirst({
    where: numeric ? { displayId: Number(candidateId) } : { id: candidateId },
  });
}

async function checkConflict(
  candidate: { updatedAt: Date },
  operation: OfflineOperation
): Promise<OfflineSyncItemResult | null> {
  if (!operation.baseUpdatedAt) return null;
  const base = new Date(operation.baseUpdatedAt);
  if (Number.isNaN(base.getTime())) return null;
  if (candidate.updatedAt.getTime() <= base.getTime()) return null;
  return {
    operationId: operation.id,
    status: "conflict",
    message: "La scheda è stata modificata sul server dopo la creazione della bozza offline.",
    serverUpdatedAt: candidate.updatedAt.toISOString(),
  };
}

async function applyOperation(
  operation: OfflineOperation,
  userId: string,
  allowConflictFor: Set<string>
): Promise<OfflineSyncItemResult> {
  return prisma.$transaction(async (tx) => {
    const marker = `\"operationId\":\"${operation.id}\"`;
    const previous = await tx.auditLog.findFirst({
      where: { action: "OFFLINE_SYNC", details: { contains: marker } },
      orderBy: { createdAt: "desc" },
    });
    const duplicate = resultFromAudit(previous?.details ?? null, operation.id);
    if (duplicate) return duplicate;

    let result: OfflineSyncItemResult;
    let auditAction = "OFFLINE_SYNC";
    let auditDetails: Record<string, unknown> = { kind: operation.kind };

    if (operation.kind === "candidate.create") {
      const firstName = text(operation.payload, "firstName");
      const lastName = text(operation.payload, "lastName");
      if (!firstName || !lastName) throw new Error("Nome e cognome sono obbligatori.");
      const existing = await tx.candidate.count({
        where: {
          firstName: { equals: firstName, mode: "insensitive" },
          lastName: { equals: lastName, mode: "insensitive" },
        },
      });
      const email = nullableText(operation.payload, "email");
      const phone = nullableText(operation.payload, "phone");
      const candidate = await tx.candidate.create({
        data: {
          firstName,
          lastName,
          email,
          emailNormalized: email?.toLowerCase().replace(/\s+/g, "") ?? null,
          phone,
          phoneNormalized: phone?.replace(/\D+/g, "") ?? null,
          mansione: nullableText(operation.payload, "mansione"),
          submissionIndex: existing + 1,
        },
      });
      result = {
        operationId: operation.id,
        status: "applied",
        candidateId: candidate.id,
        displayId: candidate.displayId,
      };
      auditAction = "CANDIDATE_CREATE";
      auditDetails = { displayId: candidate.displayId, source: "offline" };
    } else {
      if (!operation.candidateId) throw new Error("Candidato mancante nell’operazione offline.");
      const candidate = await findCandidate(tx, operation.candidateId);
      if (!candidate) throw new Error("Candidato non trovato.");
      const conflict = allowConflictFor.has(candidate.id) ? null : await checkConflict(candidate, operation);
      if (conflict) return conflict;

      if (operation.kind === "candidate.update") {
        const firstName = text(operation.payload, "firstName");
        const lastName = text(operation.payload, "lastName");
        if (!firstName || !lastName) throw new Error("Nome e cognome sono obbligatori.");
        const email = nullableText(operation.payload, "email");
        const phone = nullableText(operation.payload, "phone");
        const updated = await tx.candidate.update({
          where: { id: candidate.id },
          data: {
            firstName,
            lastName,
            email,
            emailNormalized: email?.toLowerCase().replace(/\s+/g, "") ?? null,
            phone,
            phoneNormalized: phone?.replace(/\D+/g, "") ?? null,
            mansione: nullableText(operation.payload, "mansione"),
          },
        });
        result = {
          operationId: operation.id,
          status: "applied",
          candidateId: updated.id,
          displayId: updated.displayId,
          serverUpdatedAt: updated.updatedAt.toISOString(),
        };
        auditAction = "CANDIDATE_UPDATE";
        auditDetails = { fields: ["firstName", "lastName", "email", "phone", "mansione"], source: "offline" };
      } else if (operation.kind === "interview.save") {
        const roles = stringList(operation.payload, "roles");
        const licenses = stringList(operation.payload, "drivingLicenses");
        const rating = ratingValue(operation.payload);
        const decisionRaw = text(operation.payload, "decision");
        const decision = Object.values(Decision).includes(decisionRaw as Decision)
          ? decisionRaw as Decision
          : null;
        const status = decision === "ASSUME" ? "ASSUMERE"
          : decision === "SCARTA" ? "SCARTATO"
          : rating !== null && rating >= 5 ? "SHORTLIST" : "DA_VALUTARE";
        const profileVerified = operation.payload.profileVerified === true || operation.payload.profileVerified === "true";

        const email = nullableText(operation.payload, "email");
        const phone = nullableText(operation.payload, "phone");
        const updated = await tx.candidate.update({
          where: { id: candidate.id },
          data: {
            firstName: text(operation.payload, "firstName") || candidate.firstName,
            lastName: text(operation.payload, "lastName") || candidate.lastName,
            email,
            emailNormalized: email?.toLowerCase().replace(/\s+/g, "") ?? null,
            phone,
            phoneNormalized: phone?.replace(/\D+/g, "") ?? null,
            mansione: roles[0] || null,
            winningSkill: nullableText(operation.payload, "winningSkill"),
            rating: rating ?? undefined,
            interviewed: true,
            interviewedAt: new Date(),
            discarded: status === "SCARTATO",
            status,
          },
        });
        const interviewData = {
          interviewer: nullableText(operation.payload, "interviewer"),
          notes: nullableText(operation.payload, "interviewNotes"),
          hrNotes: nullableText(operation.payload, "hrNotes"),
          score: rating,
          birthPlaceDate: nullableText(operation.payload, "birthPlaceDate"),
          residence: nullableText(operation.payload, "residence"),
          education: nullableText(operation.payload, "education"),
          drivingLicense: licenses.length ? licenses.join(",") : null,
          trainingCourses: nullableText(operation.payload, "trainingCourses"),
          travelAvailability: nullableText(operation.payload, "travelAvailability"),
          currentJobStatus: nullableText(operation.payload, "currentJobStatus"),
          possibleStartDate: nullableText(operation.payload, "possibleStartDate"),
          requestedSalary: nullableText(operation.payload, "requestedSalary"),
          experiences: nullableText(operation.payload, "experiences"),
          skills: nullableText(operation.payload, "skills"),
          knownSoftware: nullableText(operation.payload, "knownSoftware"),
          outcome: nullableText(operation.payload, "outcome"),
          decision,
          appliedRoles: roles.length ? roles.join(",") : null,
          profileVerified,
        };
        const createNew = operation.payload.saveMode === "new";
        const latest = await tx.interview.findFirst({
          where: { candidateId: candidate.id },
          orderBy: { date: "desc" },
        });
        if (latest && !createNew) {
          await tx.interview.update({ where: { id: latest.id }, data: interviewData });
          auditAction = "INTERVIEW_UPDATE";
        } else {
          await tx.interview.create({ data: { candidateId: candidate.id, date: new Date(), ...interviewData } });
          auditAction = "INTERVIEW_CREATE";
        }
        auditDetails = { rating, decision, roles, profileVerified, source: "offline" };
        result = {
          operationId: operation.id,
          status: "applied",
          candidateId: updated.id,
          displayId: updated.displayId,
          serverUpdatedAt: updated.updatedAt.toISOString(),
        };
      } else if (operation.kind === "candidate.quickAction") {
        const action = text(operation.payload, "action");
        if (!QUICK_ACTIONS.has(action)) throw new Error("Azione rapida non valida.");
        if (action === "discard") {
          await tx.candidate.update({ where: { id: candidate.id }, data: { discarded: true, status: "SCARTATO" } });
        } else if (action === "restore") {
          await tx.candidate.update({ where: { id: candidate.id }, data: { discarded: false, rating: null, status: "DA_VALUTARE" } });
          const latest = await tx.interview.findFirst({ where: { candidateId: candidate.id }, orderBy: { date: "desc" } });
          if (latest) await tx.interview.update({ where: { id: latest.id }, data: { decision: null } });
        } else if (action === "shortlist") {
          await tx.candidate.update({ where: { id: candidate.id }, data: { discarded: false, rating: 5, status: "SHORTLIST" } });
        } else if (action === "hire") {
          await tx.candidate.update({ where: { id: candidate.id }, data: { discarded: false, status: "ASSUMERE" } });
          const latest = await tx.interview.findFirst({ where: { candidateId: candidate.id }, orderBy: { date: "desc" } });
          if (latest) await tx.interview.update({ where: { id: latest.id }, data: { decision: "ASSUME" } });
          else await tx.interview.create({ data: { candidateId: candidate.id, date: new Date(), decision: "ASSUME" } });
        }
        result = {
          operationId: operation.id,
          status: "applied",
          candidateId: candidate.id,
          displayId: candidate.displayId,
        };
        auditAction = "CANDIDATE_QUICK_ACTION";
        auditDetails = { action, displayId: candidate.displayId, source: "offline" };
      } else {
        throw new Error("Tipo di operazione offline non supportato.");
      }
    }

    // Il secondo evento è il marcatore idempotente che impedisce doppi salvataggi dopo un nuovo tentativo.
    await tx.auditLog.createMany({
      data: [{
        action: auditAction,
        entity: "Candidate",
        entityId: result.candidateId ?? null,
        details: JSON.stringify(auditDetails),
        userId,
      }, {
        action: "OFFLINE_SYNC",
        entity: "Candidate",
        entityId: result.candidateId ?? null,
        details: JSON.stringify({ operationId: operation.id, kind: operation.kind, result }),
        userId,
      }],
    });
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN", "RECRUITER"], true);
  if (isAuthError(auth)) return auth;
  const body = await req.json().catch(() => ({}));
  const operations = Array.isArray(body.operations) ? body.operations as OfflineOperation[] : [];
  if (!operations.length || operations.length > MAX_OPERATIONS) {
    return NextResponse.json({ error: `Inviare da 1 a ${MAX_OPERATIONS} operazioni.` }, { status: 400 });
  }

  const results: OfflineSyncItemResult[] = [];
  const changedInThisBatch = new Set<string>();
  for (const operation of operations) {
    if (!operation || !OPERATION_ID.test(String(operation.id || "")) || !operation.kind || !operation.payload) {
      results.push({ operationId: String(operation?.id || "invalid"), status: "error", message: "Operazione offline non valida." });
      continue;
    }
    try {
      const result = await applyOperation(operation, auth.id, changedInThisBatch);
      results.push(result);
      if ((result.status === "applied" || result.status === "duplicate") && result.candidateId) {
        changedInThisBatch.add(result.candidateId);
      }
    } catch (error) {
      results.push({
        operationId: operation.id,
        status: "error",
        message: error instanceof Error ? error.message : "Sincronizzazione non riuscita.",
      });
    }
  }

  return NextResponse.json({ ok: results.every((item) => item.status !== "error"), results });
}
