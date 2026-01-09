"use client";

import { useMemo, useState } from "react";
import type { Candidate, Interview, CvFile } from "@prisma/client";
import { saveInterviewAction, updateCandidateAction } from "./detail/actions";
import { AttachmentsSection } from "./AttachmentsSection";
import { QuickActions } from "./QuickActions";

type CandidateWithRelations = Candidate & {
  interviews: Interview[];
  cvFiles: CvFile[];
};

type Props = {
  candidate: CandidateWithRelations;
  lastInterview: Interview | null;
  previousInterviews?: Interview[];
};

const MANSIONE_OPTIONS = [
  "Ufficio Tecnico", "Segreteria", "Ufficio Gare", "Operaio",
  "Project Manager", "Ufficio Amministrativo", "Magazziniere", "Autista", "Altro",
];

const PATENTE_OPTIONS = ["A", "B", "C", "D", "E", "CQC"];

function hasScemoTag(text: string) { return /\[SCEMO\]/i.test(text); }
function addScemoTag(text: string) {
  if (hasScemoTag(text)) return text;
  const t = (text ?? "").trim();
  return t ? `${t}\n[SCEMO]` : "[SCEMO]";
}
function removeScemoTag(text: string) {
  return (text ?? "").replace(/\[SCEMO\]/gi, "").replace(/\[\s*\]/g, "")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function InterviewForm({ candidate, lastInterview, previousInterviews = [] }: Props) {
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
  const certified = useMemo(() => hasScemoTag(interviewNotes), [interviewNotes]);

  const [isSavingAnagrafica, setIsSavingAnagrafica] = useState(false);
  const [isSavingInterview, setIsSavingInterview] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");

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
  function toggleCertifica() {
    setInterviewNotes(prev => hasScemoTag(prev) ? removeScemoTag(prev) : addScemoTag(prev));
  }

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
      window.location.reload();
    } finally { setIsSavingAnagrafica(false); }
  }

  async function handleSaveInterview(formData: FormData) {
    setIsSavingInterview(true);
    try {
      formData.set("candidateId", candidate.id);
      formData.set("firstName", firstName.trim());
      formData.set("lastName", lastName.trim());
      formData.set("email", email.trim());
      formData.set("phone", phone.trim());
      formData.set("mansione", primaryMansione.trim());
      selectedRoles.forEach(role => formData.append("mansione", role));
      if (rating !== "" && !Number.isNaN(Number(rating))) formData.set("rating", String(rating));
      else formData.delete("rating");
      formData.delete("drivingLicenses");
      drivingLicenses.forEach(code => formData.append("drivingLicenses", code));
      formData.set("interviewNotes", interviewNotes);
      await saveInterviewAction(formData);
      window.location.reload();
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
      window.location.href = "/candidates";
    } finally { setIsMerging(false); }
  }

  async function handleDelete() {
    if (!confirm("Eliminare definitivamente questo candidato?")) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}`, { method: "DELETE" });
      if (!res.ok) { alert("Errore: " + await res.text()); return; }
      window.location.href = "/candidates";
    } finally { setIsDeleting(false); }
  }

  return (
    <div className="space-y-4">
      {/* === HEADER COMPATTO: Anagrafica + Meta === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Anagrafica - 2/3 */}
        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-800">Anagrafica</h2>
            {certified && <img src="/logo.png" alt="Certificato" className="w-10 h-10 object-contain" />}
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide">Nome</label>
              <input className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={firstName} onChange={e => setFirstName(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide">Cognome</label>
              <input className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide">Email</label>
              <input type="email" className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide">Telefono</label>
              <input className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>

          {/* CV + Salva anagrafica */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <div className="text-xs text-slate-600">
              {latestCv ? (
                <a href={`/api/files/${latestCv.id}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                  📄 Apri CV
                </a>
              ) : <span className="text-slate-400">Nessun CV</span>}
            </div>
            <form action={handleUpdateAnagrafica}>
              <button type="submit" disabled={isSavingAnagrafica} className="px-3 py-1.5 text-xs font-medium rounded bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50">
                {isSavingAnagrafica ? "..." : "Salva anagrafica"}
              </button>
            </form>
          </div>
        </section>

        {/* Meta & Azioni - 1/3 */}
        <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800 mb-3">Info & Azioni</h2>
          
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">ID</span><span className="font-mono text-slate-700">#{candidate.displayId}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Invii</span><span className="font-semibold">{candidate.submissionIndex}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Colloqui</span><span className="font-semibold">{candidate.interviews.length}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Rating</span><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ratingColor}`}>{rating || "–"}/10</span></div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 space-y-2">
            <div className="flex gap-2">
              <input type="text" placeholder="ID target (cv_...)" className="flex-1 text-[11px] rounded border px-2 py-1" value={mergeTargetId} onChange={e => setMergeTargetId(e.target.value)} />
              <button onClick={handleMerge} disabled={isMerging || !mergeTargetId.trim()} className="px-2 py-1 text-[11px] rounded bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50">
                Unisci
              </button>
            </div>
            <button onClick={handleDelete} disabled={isDeleting} className="w-full px-2 py-1.5 text-[11px] rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
              {isDeleting ? "..." : "Elimina candidato"}
            </button>
          </div>
        </section>
      </div>

      {/* === VALUTAZIONE RAPIDA === */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800 mb-3">Valutazione</h2>
        <QuickActions
          candidateId={candidate.id}
          discarded={candidate.discarded}
          rating={candidate.rating}
          decision={lastInterview?.decision ?? null}
        />
      </section>

      {/* === ALLEGATI === */}
      <AttachmentsSection candidateId={candidate.id} />

      {/* === ULTIMO COLLOQUIO (se esiste) === */}
      {lastInterview && (
        <section className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-base font-semibold text-emerald-900">Ultimo colloquio</h2>
              <p className="text-xs text-emerald-700">
                {new Date(lastInterview.date as unknown as string).toLocaleString("it-IT")}
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

      {/* === FORM COLLOQUIO === */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">Colloquio</h2>
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={10} className="w-14 rounded border px-2 py-1 text-sm text-center" value={rating} onChange={e => { const v = e.target.value; setRating(v === "" ? "" : Math.max(0, Math.min(10, Number(v)))); }} />
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${ratingColor}`}>{rating || "–"}/10</span>
            <button type="button" onClick={toggleCertifica} className={`px-3 py-1 text-xs rounded font-medium ${certified ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-700"}`}>
              {certified ? "🏆 Certificato" : "Certifica"}
            </button>
          </div>
        </div>

        <form action={handleSaveInterview} className="space-y-4">
          <input type="hidden" name="candidateId" value={candidate.id} />
          <input type="hidden" name="rating" value={rating === "" ? "" : String(rating)} />

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
          <div className="flex flex-wrap items-end gap-4 pt-2 border-t border-slate-100">
            <div className="flex-1 min-w-[200px]">
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
          </div>
        </form>
      </section>
    </div>
  );
}
