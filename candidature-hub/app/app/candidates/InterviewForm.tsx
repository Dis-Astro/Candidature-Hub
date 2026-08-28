"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { Candidate, Interview, CvFile } from "@prisma/client";
import { AttachmentsSection } from "./AttachmentsSection";
import { QuickActions } from "./QuickActions";
import { AuthenticatedFileViewer } from "./AuthenticatedFileViewer";
import {
  clearOfflineDraft,
  createOfflineOperation,
  loadOfflineDraft,
  saveOfflineDraft,
  submitOfflineOperation,
} from "../../lib/offline-client";

type CandidateWithRelations = Candidate & {
  interviews: Interview[];
  cvFiles: CvFile[];
};

type Props = {
  candidate: CandidateWithRelations;
  lastInterview: Interview | null;
  previousInterviews?: Interview[];
  canEdit: boolean;
  canDelete: boolean;
};

type CandidateSearchResult = {
  id: string;
  displayId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  mansione: string | null;
};

const MANSIONE_OPTIONS = [
  "Ufficio Tecnico", "Segreteria", "Ufficio Gare", "Operaio",
  "Project Manager", "Ufficio Amministrativo", "Magazziniere", "Autista", "Altro",
];

const PATENTE_OPTIONS = ["A", "B", "C", "D", "E", "CQC"];

export function InterviewForm({ candidate, lastInterview, previousInterviews = [], canEdit, canDelete }: Props) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(candidate.firstName);
  const [lastName, setLastName] = useState(candidate.lastName);
  const [email, setEmail] = useState(candidate.email ?? "");
  const [phone, setPhone] = useState(candidate.phone ?? "");

  const initialRoles: string[] = lastInterview?.appliedRoles?.split(",").map(s => s.trim()).filter(Boolean)
    ?? (candidate.mansione ? [candidate.mansione] : []);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(initialRoles);

  const [rating, setRating] = useState<number | "">(
    typeof (lastInterview?.score ?? candidate.rating ?? null) === "number"
      ? (lastInterview?.score ?? candidate.rating)! : ""
  );

  const [drivingLicenses, setDrivingLicenses] = useState<string[]>(
    lastInterview?.drivingLicense?.split(",").map(s => s.trim()).filter(Boolean) ?? []
  );

  const [interviewNotes, setInterviewNotes] = useState<string>(lastInterview?.notes ?? "");
  const [profileVerified, setProfileVerified] = useState(lastInterview?.profileVerified ?? false);

  const [isSavingAnagrafica, setIsSavingAnagrafica] = useState(false);
  const [isSavingInterview, setIsSavingInterview] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeResults, setMergeResults] = useState<CandidateSearchResult[]>([]);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const interviewFormRef = useRef<HTMLFormElement>(null);
  const draftHydrated = useRef(false);
  const draftTimer = useRef<number | null>(null);
  const draftKey = `interview:${candidate.id}`;

  const primaryMansione = selectedRoles[0] ?? "";
  const latestCv: CvFile | null = candidate.cvFiles?.[0] ?? null;

  const ratingColor = rating === "" ? "bg-slate-200 text-slate-600"
    : rating >= 8 ? "bg-green-500 text-white"
    : rating >= 5 ? "bg-amber-400 text-slate-900"
    : "bg-red-500 text-white";

  function toggleRole(role: string) {
    setSelectedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  }
  function toggleLicense(code: string) {
    setDrivingLicenses(prev => prev.includes(code) ? prev.filter(r => r !== code) : [...prev, code]);
  }
  function showNotice(type: "success" | "error", message: string) {
    setNotice({ type, message });
    window.setTimeout(() => setNotice(null), 6_000);
  }

  const saveCurrentDraft = useCallback(() => {
    if (!draftHydrated.current || !interviewFormRef.current) return;
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      const values = Object.fromEntries(new FormData(interviewFormRef.current!).entries()) as Record<string, unknown>;
      Object.assign(values, {
        firstName,
        lastName,
        email,
        phone,
        selectedRoles,
        rating,
        drivingLicenses,
        interviewNotes,
        profileVerified,
      });
      void saveOfflineDraft(draftKey, values);
    }, 450);
  }, [draftKey, drivingLicenses, email, firstName, interviewNotes, lastName, phone, profileVerified, rating, selectedRoles]);

  useEffect(() => {
    void loadOfflineDraft<Record<string, unknown>>(draftKey).then((draft) => {
      if (draft) {
        const value = draft.value;
        if (typeof value.firstName === "string") setFirstName(value.firstName);
        if (typeof value.lastName === "string") setLastName(value.lastName);
        if (typeof value.email === "string") setEmail(value.email);
        if (typeof value.phone === "string") setPhone(value.phone);
        if (Array.isArray(value.selectedRoles)) setSelectedRoles(value.selectedRoles.map(String));
        if (Array.isArray(value.drivingLicenses)) setDrivingLicenses(value.drivingLicenses.map(String));
        if (typeof value.interviewNotes === "string") setInterviewNotes(value.interviewNotes);
        if (typeof value.profileVerified === "boolean") setProfileVerified(value.profileVerified);
        if (typeof value.rating === "number" || value.rating === "") setRating(value.rating);

        window.requestAnimationFrame(() => {
          const form = interviewFormRef.current;
          if (form) {
            for (const element of Array.from(form.elements)) {
              if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) continue;
              const saved = value[element.name];
              if (saved == null || !element.name || element.type === "checkbox") continue;
              if (element instanceof HTMLInputElement && element.type === "radio") element.checked = saved === element.value;
              else element.value = String(saved);
            }
          }
          draftHydrated.current = true;
          showNotice("success", "Bozza del colloquio recuperata da questo iPad.");
        });
      } else {
        draftHydrated.current = true;
      }
    }).catch(() => { draftHydrated.current = true; });
    return () => {
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
    };
  }, [draftKey]);

  useEffect(() => {
    saveCurrentDraft();
  }, [saveCurrentDraft]);

  useEffect(() => {
    if (mergeQuery.trim().length < 2 || mergeTargetId) {
      setMergeResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/candidates/search?q=${encodeURIComponent(mergeQuery)}&exclude=${encodeURIComponent(candidate.id)}`, { signal: controller.signal });
        if (response.ok) {
          const body = await response.json() as { candidates: CandidateSearchResult[] };
          setMergeResults(body.candidates);
        }
      } catch {
        // La ricerca è solo un aiuto visivo: la scheda resta utilizzabile anche senza rete.
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [candidate.id, mergeQuery, mergeTargetId]);

  async function handleUpdateAnagrafica() {
    setIsSavingAnagrafica(true);
    try {
      const result = await submitOfflineOperation(createOfflineOperation("candidate.update", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        mansione: primaryMansione.trim(),
      }, { candidateId: candidate.id, baseUpdatedAt: candidate.updatedAt.toISOString() }));
      if (result.status === "applied" || result.status === "duplicate") {
        window.location.reload();
      }
      else if (result.status === "conflict") showNotice("error", result.message || "La scheda è cambiata sul server: ricaricala prima di salvare.");
      else if (result.message === "queued") showNotice("success", "Anagrafica salvata sull’iPad: verrà sincronizzata automaticamente.");
      else showNotice("error", result.message || "Salvataggio non riuscito.");
    } finally { setIsSavingAnagrafica(false); }
  }

  async function handleSaveInterview(formData: FormData) {
    setIsSavingInterview(true);
    try {
      const payload = Object.fromEntries(formData.entries()) as Record<string, unknown>;
      Object.assign(payload, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        roles: selectedRoles,
        rating: rating === "" ? null : rating,
        drivingLicenses,
        interviewNotes,
        profileVerified,
      });
      const result = await submitOfflineOperation(createOfflineOperation("interview.save", payload, {
        candidateId: candidate.id,
        baseUpdatedAt: candidate.updatedAt.toISOString(),
      }));
      if (result.status === "applied" || result.status === "duplicate") {
        await clearOfflineDraft(draftKey);
        window.location.reload();
      }
      else if (result.status === "conflict") showNotice("error", result.message || "La scheda è cambiata sul server: ricaricala prima di salvare.");
      else if (result.message === "queued") {
        await clearOfflineDraft(draftKey);
        draftHydrated.current = false;
        showNotice("success", "Colloquio custodito sull’iPad. Sarà sincronizzato automaticamente appena torna la rete.");
      }
      else showNotice("error", result.message || "Salvataggio non riuscito.");
    } finally { setIsSavingInterview(false); }
  }

  async function handleMerge() {
    if (!mergeTargetId.trim() || !confirm("Unire questo candidato in un altro? L'attuale verrà eliminato.")) return;
    setIsMerging(true);
    try {
      const res = await fetch("/api/candidates/merge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: mergeTargetId.trim(), sourceIds: [candidate.id] }),
      });
      if (!res.ok) { alert("Errore: " + await res.text()); return; }
      router.push("/candidates");
      router.refresh();
    } finally { setIsMerging(false); }
  }

  async function handleDelete() {
    if (!confirm("Eliminare definitivamente questo candidato?")) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}`, { method: "DELETE" });
      if (!res.ok) { alert("Errore: " + await res.text()); return; }
      router.push("/candidates");
      router.refresh();
    } finally { setIsDeleting(false); }
  }

  return (
    <div className="relative space-y-4">
      {notice && (
        <div className={`fixed left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] z-[150] mx-auto max-w-2xl rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-2xl ${notice.type === "success" ? "bg-teal-700" : "bg-red-700"}`} role="status">
          {notice.message}
        </div>
      )}
      {/* Timbro personalizzato mostrato quando il profilo è certificato. */}
      {profileVerified && (
        <div className="pointer-events-none fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
          <Image src="/logo.png" alt="" width={256} height={256} className="h-64 w-64 -rotate-[15deg] object-contain opacity-15" priority />
        </div>
      )}
      {/* === HEADER COMPATTO: Anagrafica + Meta === */}
      <div className="grid grid-cols-1 gap-4 min-[980px]:grid-cols-[minmax(0,1.55fr)_minmax(17rem,.75fr)]">
        {/* Anagrafica - 2/3 */}
        <section className="surface-card p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-slate-800">Anagrafica</h2>
              {lastName && (
                <span className="text-lg font-bold text-slate-700 flex items-center gap-2">
                  {lastName}
                  {profileVerified && <span className="text-amber-500" title="Profilo certificato">🏆</span>}
                </span>
              )}
            </div>
            {profileVerified && <Image src="/logo.png" alt="Profilo certificato" width={48} height={48} className="h-12 w-12 object-contain" />}
          </div>
          
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide">Nome</label>
              <input disabled={!canEdit} className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100" value={firstName} onChange={e => setFirstName(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide">Cognome</label>
              <input disabled={!canEdit} className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100" value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide">Email</label>
              <input disabled={!canEdit} type="email" className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide">Telefono</label>
              <input disabled={!canEdit} className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>

          {/* CV + Salva anagrafica */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <div className="text-xs text-slate-600">
              {latestCv ? (
                <AuthenticatedFileViewer
                  url={`/api/files/${latestCv.id}`}
                  filename={`CV ${candidate.firstName} ${candidate.lastName}.pdf`}
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  📄 Apri CV
                </AuthenticatedFileViewer>
              ) : <span className="text-slate-400">Nessun CV</span>}
            </div>
            <form action={handleUpdateAnagrafica}>
              <button type="submit" disabled={isSavingAnagrafica || !canEdit} className="px-3 py-1.5 text-xs font-medium rounded bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50">
                {isSavingAnagrafica ? "..." : "Salva anagrafica"}
              </button>
            </form>
          </div>
        </section>

        {/* Meta & Azioni - 1/3 */}
        <section className="surface-card bg-slate-50/80 p-4 md:p-5 min-[980px]:sticky min-[980px]:top-6 min-[980px]:self-start">
          <h2 className="text-base font-semibold text-slate-800 mb-3">Info & Azioni</h2>
          
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">ID</span><span className="font-mono text-slate-700">#{candidate.displayId}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Invii</span><span className="font-semibold">{candidate.submissionIndex}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Colloqui</span><span className="font-semibold">{candidate.interviews.length}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Rating</span><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ratingColor}`}>{rating || "–"}/10</span></div>
          </div>

          {(canEdit || canDelete) && <div className="mt-4 pt-3 border-t border-slate-200 space-y-2">
            {canEdit && (
            <div className="relative flex gap-2">
              <input
                type="search"
                placeholder="Cerca candidato da unire…"
                aria-label="Cerca il candidato di destinazione"
                className="min-h-10 flex-1 rounded-lg border px-2 text-[11px]"
                value={mergeQuery}
                onChange={e => { setMergeQuery(e.target.value); setMergeTargetId(""); }}
              />
              <button onClick={handleMerge} disabled={isMerging || !mergeTargetId.trim()} className="px-2 py-1 text-[11px] rounded bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50">
                Unisci
              </button>
              {mergeResults.length > 0 && (
                <div className="absolute left-0 right-16 top-full z-40 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  {mergeResults.map(result => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => {
                        setMergeTargetId(result.id);
                        setMergeQuery(`#${result.displayId} · ${result.firstName} ${result.lastName}`);
                        setMergeResults([]);
                      }}
                      className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
                    >
                      <span className="block text-xs font-semibold text-slate-800">#{result.displayId} · {result.firstName} {result.lastName}</span>
                      <span className="block truncate text-[10px] text-slate-500">{result.mansione || "Mansione non indicata"}{result.email ? ` · ${result.email}` : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}
            {canDelete && <button onClick={handleDelete} disabled={isDeleting} className="w-full px-2 py-1.5 text-[11px] rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
              {isDeleting ? "..." : "Elimina candidato"}
            </button>}
          </div>}
        </section>
      </div>

      {/* === VALUTAZIONE RAPIDA === */}
      <section className="surface-card p-4 md:p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-3">Valutazione</h2>
        <QuickActions
          candidateId={candidate.id}
          discarded={candidate.discarded}
          rating={candidate.rating}
          decision={lastInterview?.decision ?? null}
          canEdit={canEdit}
          baseUpdatedAt={candidate.updatedAt.toISOString()}
        />
      </section>

      {/* === ALLEGATI === */}
      <AttachmentsSection candidateId={candidate.id} canEdit={canEdit} />

      {/* === ULTIMO COLLOQUIO (se esiste) === */}
      {lastInterview && (
        <section className="rounded-[1.25rem] border border-emerald-200 bg-emerald-50 p-4 shadow-sm md:p-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-base font-semibold text-emerald-900">Ultimo colloquio</h2>
              <p className="text-xs text-emerald-700">
                {new Date(lastInterview.date as unknown as string).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}
                {lastInterview.interviewer && ` · ${lastInterview.interviewer}`}
              </p>
            </div>
            <div className="text-right">
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${ratingColor}`}>
                {lastInterview.score ?? "–"}/10
              </span>
              {lastInterview.decision && <p className="text-xs mt-1 font-medium text-emerald-800">{lastInterview.decision}</p>}
            </div>
          </div>
          {lastInterview.notes && <p className="text-sm text-emerald-900 whitespace-pre-line mt-2">{lastInterview.notes}</p>}
        </section>
      )}

      {previousInterviews.length > 0 && (
        <details className="surface-card overflow-hidden">
          <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold text-slate-800 md:px-5">
            Storico colloqui <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{previousInterviews.length}</span>
          </summary>
          <div className="border-t border-slate-100 px-4 pb-4 md:px-5">
            {previousInterviews.map((interview) => (
              <article key={interview.id} className="border-b border-slate-100 py-4 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {new Date(interview.date as unknown as string).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}
                    {interview.interviewer && <span className="font-normal text-slate-500"> · {interview.interviewer}</span>}
                  </p>
                  <div className="flex gap-2 text-xs font-semibold">
                    {interview.score !== null && <span className="rounded-full bg-slate-100 px-2 py-1">{interview.score}/10</span>}
                    {interview.decision && <span className="rounded-full bg-teal-50 px-2 py-1 text-teal-800">{interview.decision.replaceAll("_", " ")}</span>}
                  </div>
                </div>
                {interview.notes && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{interview.notes}</p>}
                {interview.hrNotes && <p className="mt-2 whitespace-pre-line text-xs text-slate-500"><strong>Note HR:</strong> {interview.hrNotes}</p>}
              </article>
            ))}
          </div>
        </details>
      )}

      {/* === FORM COLLOQUIO === */}
      <section className="surface-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">Colloquio</h2>
          <div className="flex items-center gap-2">
            <input disabled={!canEdit} type="number" min={0} max={10} className="w-14 rounded border px-2 py-1 text-sm text-center disabled:bg-slate-100" value={rating} onChange={e => { const v = e.target.value; setRating(v === "" ? "" : Math.max(0, Math.min(10, Number(v)))); }} />
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${ratingColor}`}>{rating || "–"}/10</span>
            <button disabled={!canEdit} type="button" onClick={() => setProfileVerified(value => !value)} className={`min-h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${profileVerified ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-700"}`} title="Applica il timbro di certificazione alla candidatura">
              {profileVerified ? "🏆 Certificato" : "Certifica"}
            </button>
          </div>
        </div>

        <form ref={interviewFormRef} action={handleSaveInterview} onInput={saveCurrentDraft} onChange={saveCurrentDraft} className="space-y-4">
          <input type="hidden" name="candidateId" value={candidate.id} />
          <input type="hidden" name="rating" value={rating === "" ? "" : String(rating)} />
          <input type="hidden" name="profileVerified" value={String(profileVerified)} />
          <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-75">

          {/* Mansioni */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2">Mansione candidata</label>
            <div className="flex flex-wrap gap-2">
              {MANSIONE_OPTIONS.map(role => (
                <label key={role} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${selectedRoles.includes(role) ? "bg-teal-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                  <input type="checkbox" name="mansione" value={role} checked={selectedRoles.includes(role)} onChange={() => toggleRole(role)} className="sr-only" />
                  {role}
                </label>
              ))}
            </div>
          </div>

          {/* Patenti */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2">Patenti</label>
            <div className="flex flex-wrap gap-2">
              {PATENTE_OPTIONS.map(code => (
                <label key={code} className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-xs font-bold cursor-pointer transition-all ${drivingLicenses.includes(code) ? "bg-teal-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                  <input type="checkbox" checked={drivingLicenses.includes(code)} onChange={() => toggleLicense(code)} className="sr-only" />
                  {code}
                </label>
              ))}
            </div>
          </div>

          {/* Arma vincente */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">Arma vincente</label>
            <textarea name="winningSkill" rows={2} className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm" defaultValue={candidate.winningSkill ?? lastInterview?.skills ?? ""} />
          </div>

          {/* Domande colloquio - Grid compatto */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { name: "birthPlaceDate", label: "Luogo/data nascita", val: lastInterview?.birthPlaceDate },
              { name: "residence", label: "Domicilio", val: lastInterview?.residence },
              { name: "education", label: "Titolo di studio", val: lastInterview?.education },
              { name: "trainingCourses", label: "Corsi formazione", val: lastInterview?.trainingCourses },
              { name: "currentJobStatus", label: "Condizione lavorativa", val: lastInterview?.currentJobStatus },
              { name: "possibleStartDate", label: "Data ingresso", val: lastInterview?.possibleStartDate, type: "date" },
              { name: "requestedSalary", label: "Retribuzione richiesta", val: lastInterview?.requestedSalary },
              { name: "knownSoftware", label: "Software conosciuti", val: lastInterview?.knownSoftware },
            ].map(f => (
              <div key={f.name}>
                <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">{f.label}</label>
                {f.type === "date" ? (
                  <input type="date" name={f.name} className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm" defaultValue={f.val ?? ""} />
                ) : (
                  <input name={f.name} className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm" defaultValue={f.val ?? ""} />
                )}
              </div>
            ))}
          </div>

          {/* Trasferte */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">Disponibilità trasferte</label>
            <select name="travelAvailability" className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm" defaultValue={lastInterview?.travelAvailability ?? ""}>
              <option value="">—</option>
              <option value="si">Sì</option>
              <option value="no">No</option>
              <option value="condizionatamente">Condizionatamente</option>
            </select>
          </div>

          {/* Esperienze + Skills */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">Esperienze lavorative</label>
              <textarea name="experiences" rows={3} className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm" defaultValue={lastInterview?.experiences ?? ""} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">Skill e competenze</label>
              <textarea name="skills" rows={3} className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm" defaultValue={lastInterview?.skills ?? ""} />
            </div>
          </div>

          {/* Note colloquio + HR */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">Note colloquio</label>
              <textarea name="interviewNotes" rows={4} className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm" value={interviewNotes} onChange={e => setInterviewNotes(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">Note HR</label>
              <textarea name="hrNotes" rows={4} className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm" defaultValue={lastInterview?.hrNotes ?? candidate.notes ?? ""} />
            </div>
          </div>

          {/* Decisione + Firma */}
          <div className="sticky bottom-[5.75rem] z-30 -mx-2 flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(15,23,42,.10)] backdrop-blur lg:bottom-4">
            <div className="min-w-0 flex-1 sm:min-w-[200px]">
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2">Decisione</label>
              <div className="flex gap-2">
                {[{ v: "ASSUME", l: "Assumere", c: "bg-green-500" }, { v: "SCARTA", l: "Scartare", c: "bg-red-500" }, { v: "LISTA_ATTESA", l: "Lista attesa", c: "bg-amber-500" }].map(d => (
                  <label key={d.v} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="decision" value={d.v} defaultChecked={lastInterview?.decision === d.v} className="sr-only peer" />
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white opacity-50 peer-checked:opacity-100 ${d.c}`}>{d.l}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="w-48">
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">Firma intervistatore</label>
              <input name="interviewer" className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm" defaultValue={lastInterview?.interviewer ?? ""} />
            </div>
            <button type="submit" disabled={isSavingInterview} className="px-6 py-2 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 disabled:opacity-50">
              {isSavingInterview ? "Salvataggio..." : "Salva colloquio"}
            </button>
            <button type="submit" name="saveMode" value="new" disabled={isSavingInterview} className="px-4 py-2 rounded-lg border border-teal-700 text-teal-800 text-sm font-medium hover:bg-teal-50 disabled:opacity-50">Salva come nuovo colloquio</button>
          </div>
          </fieldset>
        </form>
      </section>
    </div>
  );
}
