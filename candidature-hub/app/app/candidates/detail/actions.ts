"use server";

import { prisma } from "../../../lib/prisma";
import { redirect } from "next/navigation";
import type { Decision } from "@prisma/client";
import { requireUser } from "../../../lib/auth";

/**
 * Aggiorna SOLO l'anagrafica del candidato
 * (nome, cognome, email, telefono, mansione)
 */
export async function updateCandidateAction(formData: FormData) {
  "use server";
  const user = await requireUser(["ADMIN", "RECRUITER"]);

  const candidateId = String(formData.get("candidateId") ?? "");

  if (!candidateId) {
    console.error("updateCandidateAction: missing candidateId");
    return;
  }

  const firstName = (formData.get("firstName") ?? "").toString().trim();
  const lastName = (formData.get("lastName") ?? "").toString().trim();
  const email = (formData.get("email") ?? "").toString().trim() || null;
  const phone = (formData.get("phone") ?? "").toString().trim() || null;
  const mansione = (formData.get("mansione") ?? "").toString().trim() || null;

  const candidate = await prisma.candidate.update({
    where: { id: candidateId },
    data: {
      firstName,
      lastName,
      email,
      phone,
      mansione,
    },
    select: {
      id: true,
      displayId: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "CANDIDATE_UPDATE",
      entity: "Candidate",
      entityId: candidate.id,
      details: JSON.stringify({ fields: ["firstName", "lastName", "email", "phone", "mansione"] }),
      userId: user.id,
    },
  });

  // dopo aver salvato, ricarichiamo la pagina del candidato
  redirect(`/candidates/${candidate.displayId}`);
}

/**
 * Salva / aggiorna il colloquio
 * + aggiorna anche alcuni campi del candidato (rating, mansione, arma vincente, ecc.)
 */
export async function saveInterviewAction(formData: FormData) {
  "use server";
  const user = await requireUser(["ADMIN", "RECRUITER"]);

  const candidateId = String(formData.get("candidateId") ?? "");

  if (!candidateId) {
    console.error("saveInterviewAction: missing candidateId");
    return;
  }

  // --- Anagrafica di base (tenuta allineata con il candidato) ---
  const firstName = (formData.get("firstName") ?? "").toString().trim();
  const lastName = (formData.get("lastName") ?? "").toString().trim();
  const email = (formData.get("email") ?? "").toString().trim() || null;
  const phone = (formData.get("phone") ?? "").toString().trim() || null;

  // Mansioni selezionate (checkbox multipli "mansione")
  const mansioneValues = formData
    .getAll("mansione")
    .map((v) => v.toString().trim())
    .filter(Boolean);

  const primaryMansione = mansioneValues[0] ?? "";
  const mansioneCsv = mansioneValues.length > 0 ? mansioneValues.join(",") : null;

  // Rating (hidden "rating")
  const ratingRaw = (formData.get("rating") ?? "").toString().trim();
  const rating =
    ratingRaw === "" || Number.isNaN(Number(ratingRaw))
      ? null
      : Math.max(0, Math.min(10, Number(ratingRaw)));

  // Patenti (checkbox "drivingLicenses")
  const drivingLicenses = formData
    .getAll("drivingLicenses")
    .map((v) => v.toString().trim())
    .filter(Boolean);
  const drivingLicensesCsv =
    drivingLicenses.length > 0 ? drivingLicenses.join(",") : null;

  // Arma vincente
  const winningSkill = (formData.get("winningSkill") ?? "")
    .toString()
    .trim() || null;

  // Domande modello aziendale
  const birthPlaceDate = (formData.get("birthPlaceDate") ?? "")
    .toString()
    .trim() || null;
  const residence = (formData.get("residence") ?? "").toString().trim() || null;
  const education = (formData.get("education") ?? "").toString().trim() || null;
  const trainingCourses = (formData.get("trainingCourses") ?? "")
    .toString()
    .trim() || null;
  const travelAvailability = (formData.get("travelAvailability") ?? "")
    .toString()
    .trim() || null;
  const currentJobStatus = (formData.get("currentJobStatus") ?? "")
    .toString()
    .trim() || null;
  const possibleStartDate = (formData.get("possibleStartDate") ?? "")
    .toString()
    .trim() || null;
  const requestedSalary = (formData.get("requestedSalary") ?? "")
    .toString()
    .trim() || null;
  const experiences = (formData.get("experiences") ?? "")
    .toString()
    .trim() || null;
  const skills = (formData.get("skills") ?? "").toString().trim() || null;
  const knownSoftware = (formData.get("knownSoftware") ?? "")
    .toString()
    .trim() || null;

  // Note colloquio + HR
  const notes = (formData.get("interviewNotes") ?? "")
    .toString()
    .trim() || null;
  const hrNotes = (formData.get("hrNotes") ?? "").toString().trim() || null;

  // Decisione finale
  let decision: Decision | null = null;
  const decisionRaw = (formData.get("decision") ?? "").toString().trim();
  if (decisionRaw) {
    decision = decisionRaw as Decision;
  }

  // Esito testuale
  const outcome = (formData.get("outcome") ?? "").toString().trim() || null;

  // Firma intervistatore
  const interviewer = (formData.get("interviewer") ?? "")
    .toString()
    .trim() || null;

  const verifiedRaw = formData.get("profileVerified");
  const profileVerified = verifiedRaw === "true" ? true : verifiedRaw === "false" ? false : null;
  const createNewInterview = formData.get("saveMode") === "new";

  const status = decision === "ASSUME" ? "ASSUMERE"
    : decision === "SCARTA" ? "SCARTATO"
    : rating !== null && rating >= 5 ? "SHORTLIST" : "DA_VALUTARE";
  const interviewData = {
    interviewer, notes, hrNotes, score: rating, birthPlaceDate, residence, education,
    drivingLicense: drivingLicensesCsv, trainingCourses, travelAvailability, currentJobStatus,
    possibleStartDate, requestedSalary, experiences, skills, knownSoftware, outcome, decision,
    appliedRoles: mansioneCsv, profileVerified: profileVerified ?? false,
  };

  const candidate = await prisma.$transaction(async (tx) => {
    const updated = await tx.candidate.update({
    where: { id: candidateId },
    data: {
      firstName,
      lastName,
      email,
      phone,
      mansione: primaryMansione || null,
      winningSkill,
      rating: rating ?? undefined,
      interviewed: true,
      interviewedAt: new Date(),
      discarded: status === "SCARTATO",
      status,
    },
    select: {
      id: true,
      displayId: true,
    },
    });

  // --- Colloquio: se esiste l'ultimo, lo aggiorniamo; altrimenti ne creiamo uno nuovo ---
  const existingInterview = await tx.interview.findFirst({
    where: { candidateId },
    orderBy: { date: "desc" },
  });

  if (existingInterview && !createNewInterview) {
    await tx.interview.update({
      where: { id: existingInterview.id },
      data: {
        ...interviewData,
        profileVerified: profileVerified ?? existingInterview.profileVerified,
      },
    });
  } else {
    await tx.interview.create({
      data: { candidateId, date: new Date(), ...interviewData },
    });
  }
    await tx.auditLog.create({
      data: {
        action: createNewInterview ? "INTERVIEW_CREATE" : "INTERVIEW_UPDATE",
        entity: "Candidate",
        entityId: candidateId,
        details: JSON.stringify({ rating, decision, roles: mansioneValues, profileVerified }),
        userId: user.id,
      },
    });
    return updated;
  });

  // Dopo il salvataggio torniamo alla pagina del candidato (e si ricarica tutto)
  redirect(`/candidates/${candidate.displayId}`);
}
