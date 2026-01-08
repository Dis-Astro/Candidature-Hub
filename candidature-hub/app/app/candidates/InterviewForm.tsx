"use client";

import { useMemo, useState } from "react";
import type { Candidate, Interview, CvFile } from "@prisma/client";
import { saveInterviewAction, updateCandidateAction } from "./detail/actions";
import { AttachmentsSection } from "./AttachmentsSection";

type CandidateWithRelations = Candidate & {
  interviews: Interview[];
  cvFiles: CvFile[];
};

type Props = {
  candidate: CandidateWithRelations;
  lastInterview: Interview | null;
  previousInterviews?: Interview[];
};

// 🔧 Mansioni disponibili
const MANSIONE_OPTIONS = [
  "Ufficio Tecnico",
  "Segreteria",
  "Ufficio Gare",
  "Operaio",
  "Project Manager",
  "Ufficio Amministrativo",
  "Magazziniere",
  "Autista",
  "Altro",
];

const PATENTE_OPTIONS = ["A", "B", "C", "D", "E", "CQC"];

// --- helpers certificazione ---
function hasScemoTag(text: string) {
  return /\[SCEMO\]/i.test(text);
}

function addScemoTag(text: string) {
  if (hasScemoTag(text)) return text;
  const t = (text ?? "").trim();
  // se vuoto, metti solo il tag
  if (!t) return "[SCEMO]";
  // se già finisce con una riga, appendi in modo pulito
  return `${t}\n[SCEMO]`;
}

function removeScemoTag(text: string) {
  return (text ?? "")
    .replace(/\[SCEMO\]/gi, "") // rimuove il tag
    .replace(/\[\s*\]/g, "") // rimuove []
    .replace(/[ \t]+\n/g, "\n") // spazi a fine riga
    .replace(/\n{3,}/g, "\n\n") // troppe righe vuote
    .trim();
}

export function InterviewForm({
  candidate,
  lastInterview,
  previousInterviews = [],
}: Props) {
  // === Stato anagrafica ===
  const [firstName, setFirstName] = useState(candidate.firstName);
  const [lastName, setLastName] = useState(candidate.lastName);
  const [email, setEmail] = useState(candidate.email ?? "");
  const [phone, setPhone] = useState(candidate.phone ?? "");

  const lastInterviewDate = lastInterview?.date
    ? new Date(lastInterview.date as unknown as string)
    : null;

  // Mansioni selezionate: da ultimo colloquio o mansione candidata
  const initialRoles: string[] =
    lastInterview?.appliedRoles
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ??
    (candidate.mansione ? [candidate.mansione] : []);

  const [selectedRoles, setSelectedRoles] = useState<string[]>(initialRoles);

  // Rating: da ultimo colloquio o rating candidato
  const [rating, setRating] = useState<number | "">(
    typeof (lastInterview?.score ?? candidate.rating ?? null) === "number"
      ? (lastInterview?.score ?? candidate.rating)!
      : ""
  );

  // Patenti da ultimo colloquio
  const [drivingLicenses, setDrivingLicenses] = useState<string[]>(
    lastInterview?.drivingLicense
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? []
  );

  // NOTE colloquio: stato controllato (serve per aggiungere/togliere [SCEMO])
  const [interviewNotes, setInterviewNotes] = useState<string>(
    lastInterview?.notes ?? ""
  );

  const certified = useMemo(
    () => hasScemoTag(interviewNotes),
    [interviewNotes]
  );

  const [isSavingAnagrafica, setIsSavingAnagrafica] = useState(false);
  const [isSavingInterview, setIsSavingInterview] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");

  const primaryMansione = selectedRoles[0] ?? "";

  const latestCv: CvFile | null =
    candidate.cvFiles && candidate.cvFiles.length > 0
      ? candidate.cvFiles[0]
      : null;

  // Colore pill rating
  let ratingClasses =
    "inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-800";
  if (rating !== "" && typeof rating === "number") {
    if (rating >= 8) {
      ratingClasses =
        "inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold bg-green-500 text-white";
    } else if (rating >= 5) {
      ratingClasses =
        "inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold bg-yellow-400 text-gray-900";
    } else if (rating > 0) {
      ratingClasses =
        "inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold bg-red-500 text-white";
    }
  }

  // Toggle mansione selezionata
  function toggleRole(role: string) {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  // Toggle patente
  function toggleDrivingLicense(code: string) {
    setDrivingLicenses((prev) =>
      prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code]
    );
  }

  // Toggle certificazione: aggiunge/rimuove [SCEMO] dalle note (senza lasciare [])
  function toggleCertifica() {
    setInterviewNotes((prev) => {
      if (hasScemoTag(prev)) return removeScemoTag(prev);
      return addScemoTag(prev);
    });
  }

  // === HANDLER: salvataggio solo anagrafica ===
  async function handleUpdateAnagrafica(formData: FormData) {
    setIsSavingAnagrafica(true);
    try {
      formData.set("candidateId", candidate.id);
      formData.set("firstName", firstName.trim());
      formData.set("lastName", lastName.trim());
      formData.set("email", email.trim());
      formData.set("phone", phone.trim());
      formData.set("mansione", primaryMansione.trim());

      await updateCandidateAction(formData);

      // 🔁 refresh per vedere subito i dati aggiornati
      if (typeof window !== "undefined") window.location.reload();
    } finally {
      setIsSavingAnagrafica(false);
    }
  }

  // === HANDLER: salvataggio colloquio ===
  async function handleSaveInterview(formData: FormData) {
    setIsSavingInterview(true);
    try {
      formData.set("candidateId", candidate.id);
      formData.set("firstName", firstName.trim());
      formData.set("lastName", lastName.trim());
      formData.set("email", email.trim());
      formData.set("phone", phone.trim());
      formData.set("mansione", primaryMansione.trim());

      // Mansioni (tutte, CSV lato server)
      selectedRoles.forEach((role) => {
        formData.append("mansione", role);
      });

      // Rating
      if (rating === "" || Number.isNaN(Number(rating))) {
        formData.delete("rating");
      } else {
        formData.set("rating", String(rating));
      }

      // Patenti
      formData.delete("drivingLicenses");
      drivingLicenses.forEach((code) => {
        formData.append("drivingLicenses", code);
      });

      // NOTE colloquio controllate
      formData.set("interviewNotes", interviewNotes);

      await saveInterviewAction(formData);

      // 🔁 refresh per vedere subito ultimo colloquio aggiornato
      if (typeof window !== "undefined") window.location.reload();
    } finally {
      setIsSavingInterview(false);
    }
  }

  // === HANDLER: unione candidati ===
  async function handleMerge() {
    if (!mergeTargetId.trim()) return;
    if (
      !confirm(
        "Unire questo candidato in un altro? L'attuale verrà eliminato."
      )
    ) {
      return;
    }

    setIsMerging(true);
    try {
      const res = await fetch("/api/candidates/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId: mergeTargetId.trim(),
          sourceIds: [candidate.id],
        }),
      });

      const text = await res.text();
      if (!res.ok) {
        console.error("Merge failed", text);
        alert("Errore durante l'unione candidati: " + text);
        return;
      }
      window.location.href = "/candidates";
    } finally {
      setIsMerging(false);
    }
  }

  // === HANDLER: eliminazione candidato ===
  async function handleDelete() {
    if (
      !confirm("Sei sicuro di voler eliminare definitivamente questo candidato?")
    ) {
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}`, {
        method: "DELETE",
      });
      const text = await res.text();
      if (!res.ok) {
        console.error("Delete failed", text);
        alert("Errore durante l'eliminazione del candidato: " + text);
        return;
      }
      window.location.href = "/candidates";
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* === ANAGRAFICA CANDIDATO === */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4 relative">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          {/* COLONNA SINISTRA */}
          <div>
            <h2 className="text-lg font-semibold">Anagrafica candidato</h2>

            {/* invio + conteggio colloqui */}
            <p className="text-xs text-slate-500 mt-0.5">
              Invio candidatura n.{" "}
              <span className="font-semibold">{candidate.submissionIndex}</span>
              {" · "}Colloqui registrati:{" "}
              <span className="font-semibold">{candidate.interviews.length}</span>
            </p>

            <div className="grid gap-3 md:grid-cols-2 mt-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Nome
                </label>
                <input
                  className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Cognome
                </label>
                <input
                  className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Email
                </label>
                <input
                  type="email"
                  className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Telefono
                </label>
                <input
                  className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            {/* CV principale */}
            <div className="mt-3 text-xs text-slate-600">
              <p className="font-medium">Curriculum principale</p>
              {latestCv ? (
                <a
                  href={`/api/files/${latestCv.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 underline"
                >
                  Apri CV (
                  <span className="font-mono">
                    {latestCv.path.split("/").slice(-1)[0]}
                  </span>
                  )
                </a>
              ) : (
                <span>Nessun CV associato al candidato.</span>
              )}
            </div>

            {/* Form solo anagrafica */}
            <form action={handleUpdateAnagrafica} className="pt-3">
              <input type="hidden" name="candidateId" value={candidate.id} />
              <input type="hidden" name="firstName" value={firstName} />
              <input type="hidden" name="lastName" value={lastName} />
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="phone" value={phone} />
              <input type="hidden" name="mansione" value={primaryMansione} />

              <button
                type="submit"
                disabled={isSavingAnagrafica}
                className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {isSavingAnagrafica ? "Salvataggio..." : "Salva solo anagrafica"}
              </button>
            </form>
          </div>

          {/* COLONNA DESTRA */}
          <div className="flex flex-col items-end gap-3 text-xs text-slate-600">
            <div className="text-right">
              <div>
                ID interno: <span className="font-mono">{candidate.id}</span>
              </div>
              <div>
                N° candidato:{" "}
                <span className="font-mono">{candidate.displayId}</span>
              </div>
            </div>

            {/* Azioni: merge + delete */}
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="ID candidato target (es. cv_...)"
                  className="w-52 rounded-md border px-2 py-1 text-[11px]"
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleMerge}
                  disabled={isMerging || !mergeTargetId.trim()}
                  className="inline-flex items-center rounded-md bg-sky-600 px-3 py-2 text-[11px] font-semibold text-white shadow hover:bg-sky-700 disabled:opacity-50"
                >
                  {isMerging ? "Unione..." : "Unisci con altro"}
                </button>
              </div>

              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center rounded-md bg-red-600 px-3 py-2 text-[11px] font-semibold text-white shadow hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? "Eliminazione..." : "Elimina candidato"}
              </button>
            </div>

            {/* Logo certificazione sotto ai pulsanti */}
            {certified && (
              <div className="mt-1">
                <img
                  src="/logo.png"
                  alt="Certificazione 100% scemo"
                  className="w-20 h-20 object-contain drop-shadow-md"
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* === CARD VERDE ULTIMO COLLOQUIO === */}
      {lastInterview && (
        <section className="rounded-xl border border-emerald-400 bg-emerald-50 p-4 space-y-3 overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div className="pr-4 md:pr-24">
              <h2 className="text-lg font-semibold text-emerald-900">
                Ultimo colloquio
              </h2>
              {lastInterviewDate && (
                <p className="text-xs text-emerald-800">
                  Data e ora:{" "}
                  <span className="font-mono">
                    {lastInterviewDate.toLocaleString()}
                  </span>
                </p>
              )}
              {lastInterview.interviewer && (
                <p className="text-xs text-emerald-800 mt-1">
                  Intervistatore:{" "}
                  <span className="font-semibold">{lastInterview.interviewer}</span>
                </p>
              )}
            </div>

            <div className="text-right">
              <span className="text-xs text-emerald-700">Voto colloquio</span>
              <div className="mt-1">
                <span className={ratingClasses}>
                  {lastInterview.score != null
                    ? `${lastInterview.score}/10`
                    : rating !== "" && typeof rating === "number"
                    ? `${rating}/10`
                    : "– /10"}
                </span>
              </div>

              {lastInterview.decision && (
                <p className="mt-2 text-xs font-semibold text-emerald-900">
                  Decisione: {lastInterview.decision}
                </p>
              )}

              {/* Pulsante CERTIFICA sotto la votazione */}
              <button
                type="button"
                onClick={toggleCertifica}
                className="mt-3 inline-flex items-center rounded-md bg-yellow-500 px-3 py-1 text-[11px] font-semibold text-emerald-950 shadow hover:bg-yellow-600"
              >
                {certified ? "Rimuovi certificazione" : "Certifica"}
              </button>
            </div>
          </div>

          {lastInterview.notes && (
            <div className="mt-2 pr-4 md:pr-32">
              <p className="text-xs font-semibold text-emerald-900">Note colloquio</p>
              <p className="mt-1 whitespace-pre-line text-sm text-emerald-950">
                {lastInterview.notes}
              </p>
            </div>
          )}

          {lastInterview.hrNotes && (
            <div className="mt-2 pr-4 md:pr-32">
              <p className="text-xs font-semibold text-emerald-900">Note HR</p>
              <p className="mt-1 whitespace-pre-line text-sm text-emerald-950">
                {lastInterview.hrNotes}
              </p>
            </div>
          )}
        </section>
      )}

      {/* === FORM COLLOQUIO & VALUTAZIONE === */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Colloquio e valutazione</h2>
            <p className="text-xs text-slate-500">
              Qui puoi segnare mansioni, patenti, skill, domande aziendali e esito del
              colloquio.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-slate-500">Rating complessivo</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                name="rating_visible"
                min={0}
                max={10}
                className="w-14 rounded-md border px-2 py-1 text-sm"
                value={rating}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") {
                    setRating("");
                    return;
                  }
                  const n = Number(v);
                  if (!Number.isNaN(n)) {
                    const clamped = Math.max(0, Math.min(10, n));
                    setRating(clamped);
                  }
                }}
              />
              <span className={ratingClasses}>
                {rating === "" ? "– /10" : `${rating}/10`}
              </span>
            </div>
          </div>
        </div>

        <form action={handleSaveInterview} className="space-y-4">
          {/* Hidden comuni */}
          <input type="hidden" name="candidateId" value={candidate.id} />
          <input type="hidden" name="firstName" value={firstName} />
          <input type="hidden" name="lastName" value={lastName} />
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="phone" value={phone} />
          <input
            type="hidden"
            name="rating"
            value={rating === "" ? "" : String(rating)}
          />

          {/* Mansioni */}
          <div className="border rounded-md p-3">
            <p className="text-xs font-medium text-slate-700 mb-2">
              Mansione per la quale si candida
              <span className="ml-1 text-[10px] text-slate-500">
                (seleziona una o più opzioni)
              </span>
            </p>
            <div className="grid gap-2 md:grid-cols-3">
              {MANSIONE_OPTIONS.map((role) => {
                const checked = selectedRoles.includes(role);
                return (
                  <label
                    key={role}
                    className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs cursor-pointer ${
                      checked
                        ? "border-teal-500 bg-teal-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="mansione"
                      value={role}
                      checked={checked}
                      onChange={() => toggleRole(role)}
                      className="h-3 w-3"
                    />
                    <span>{role}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Arma vincente */}
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Arma vincente
            </label>
            <textarea
              name="winningSkill"
              className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
              rows={2}
              defaultValue={candidate.winningSkill ?? lastInterview?.skills ?? ""}
            />
          </div>

          {/* Patenti */}
          <div className="border rounded-md p-3">
            <p className="text-xs font-medium text-slate-700 mb-2">Patenti possedute</p>
            <div className="flex flex-wrap gap-2">
              {PATENTE_OPTIONS.map((code) => {
                const checked = drivingLicenses.includes(code);
                return (
                  <label
                    key={code}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs cursor-pointer ${
                      checked
                        ? "border-teal-500 bg-teal-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3"
                      checked={checked}
                      onChange={() => toggleDrivingLicense(code)}
                    />
                    <span>{code}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Domande aziendali */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Luogo e data di nascita
              </label>
              <textarea
                name="birthPlaceDate"
                className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                rows={2}
                defaultValue={lastInterview?.birthPlaceDate ?? ""}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Domicilio / Residenza
              </label>
              <textarea
                name="residence"
                className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                rows={2}
                defaultValue={lastInterview?.residence ?? ""}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Titolo di studio
              </label>
              <textarea
                name="education"
                className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                rows={2}
                defaultValue={lastInterview?.education ?? ""}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Corsi di formazione
              </label>
              <textarea
                name="trainingCourses"
                className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                rows={2}
                defaultValue={lastInterview?.trainingCourses ?? ""}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Disponibilità alle trasferte (più giorni)
              </label>
              <select
                name="travelAvailability"
                className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                defaultValue={lastInterview?.travelAvailability ?? ""}
              >
                <option value="">—</option>
                <option value="si">Sì</option>
                <option value="no">No</option>
                <option value="condizionatamente">Condizionatamente</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Attuale condizione lavorativa
              </label>
              <textarea
                name="currentJobStatus"
                className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                rows={2}
                defaultValue={lastInterview?.currentJobStatus ?? ""}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Data possibile ingresso in azienda
              </label>
              <input
                type="date"
                name="possibleStartDate"
                className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                defaultValue={lastInterview?.possibleStartDate ?? ""}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Retribuzione richiesta
              </label>
              <textarea
                name="requestedSalary"
                className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                rows={2}
                defaultValue={lastInterview?.requestedSalary ?? ""}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700">
                Precedenti esperienze lavorative
              </label>
              <textarea
                name="experiences"
                className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                rows={3}
                defaultValue={lastInterview?.experiences ?? ""}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Particolari skill e competenze
              </label>
              <textarea
                name="skills"
                className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                rows={3}
                defaultValue={lastInterview?.skills ?? ""}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Software conosciuti
              </label>
              <textarea
                name="knownSoftware"
                className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                rows={3}
                defaultValue={lastInterview?.knownSoftware ?? ""}
              />
            </div>
          </div>

          {/* Note & decisione */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Note colloquio
              </label>
              <textarea
                name="interviewNotes"
                className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                rows={4}
                value={interviewNotes}
                onChange={(e) => setInterviewNotes(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Note aggiuntive HR
              </label>
              <textarea
                name="hrNotes"
                className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                rows={4}
                defaultValue={lastInterview?.hrNotes ?? candidate.notes ?? ""}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[2fr,1fr]">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">
                Decisione finale
              </label>
              <div className="flex flex-wrap gap-2 text-xs">
                {[
                  { value: "ASSUME", label: "Assumere" },
                  { value: "SCARTA", label: "Scartare" },
                  { value: "LISTA_ATTESA", label: "Tenere in lista" },
                ].map((d) => (
                  <label
                    key={d.value}
                    className="inline-flex items-center gap-1 rounded-full border px-3 py-1 cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="radio"
                      name="decision"
                      value={d.value}
                      defaultChecked={lastInterview?.decision === d.value}
                      className="h-3 w-3"
                    />
                    <span>{d.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Firma intervistatore
              </label>
              <input
                name="interviewer"
                className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                defaultValue={lastInterview?.interviewer ?? ""}
              />
            </div>
          </div>

          {/* Pulsante salva colloquio */}
          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSavingInterview}
              className="inline-flex items-center rounded-md bg-teal-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
            >
              {isSavingInterview ? "Salvataggio colloquio..." : "Salva colloquio"}
            </button>
          </div>
        </form>

        {/* Storico colloqui (se vuoi, già pronto) */}
        {previousInterviews.length > 0 && (
          <div className="pt-4">
            <h3 className="text-sm font-semibold text-slate-800">
              Colloqui precedenti ({previousInterviews.length})
            </h3>
            <ul className="mt-2 space-y-2">
              {previousInterviews.map((it) => (
                <li
                  key={it.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono">
                      {new Date(it.date as unknown as string).toLocaleString()}
                    </span>
                    <span className="font-semibold">
                      {it.score != null ? `${it.score}/10` : "– /10"}
                    </span>
                  </div>
                  {it.decision && (
                    <div className="mt-1 text-slate-600">
                      Decisione: <span className="font-semibold">{it.decision}</span>
                    </div>
                  )}
                  {it.notes && (
                    <div className="mt-2 whitespace-pre-line">{it.notes}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
