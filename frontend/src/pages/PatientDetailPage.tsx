import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Header from "../components/Shared/Header";
import { createClinicalNote, createPrescription, getClinicalNotes, getPatientAuditLogs, getPatientClinicalDetail, getPrescriptions, type AuditLog, type ClinicalNote, type PatientClinicalDetail, type Prescription } from "../api/clinical";

export default function PatientDetailPage(): React.JSX.Element {
  const { id = "" } = useParams();
  const [detail, setDetail] = useState<PatientClinicalDetail | null>(null);
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [note, setNote] = useState("");
  const [drug, setDrug] = useState("");
  const [dosage, setDosage] = useState("");
  const [instructions, setInstructions] = useState("");

  useEffect(() => { void Promise.all([getPatientClinicalDetail(id), getClinicalNotes(id), getPrescriptions(id), getPatientAuditLogs(id)]).then(([d, n, p, a]) => { setDetail(d); setNotes(n); setPrescriptions(p); setAuditLogs(a); }); }, [id]);
  if (!detail) return <div className="p-8 text-sm text-gray-500">환자 정보를 불러오는 중입니다...</div>;

  return <div className="min-h-screen bg-[#f7f8fa]"><Header /><main className="mx-auto max-w-6xl space-y-5 p-6">
    <section className="rounded-2xl border bg-white p-5"><h1 className="text-2xl font-semibold">{detail.name}</h1><p className="mt-1 text-sm text-gray-500">환자번호 {detail.patient_number ?? "-"} · 생년월일 {detail.birth_date ?? "-"}</p></section>
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">최근 검사</h2>{detail.cases.map(c => <p key={c.id} className="mt-3 text-sm">{c.specimen_id} · {c.status}</p>)}</section>
      <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">예약 기록</h2>{detail.appointments.map(a => <p key={a.id} className="mt-3 text-sm">{new Date(a.confirmed_slot ?? a.requested_at_slot).toLocaleString("ko-KR")} · {a.status}</p>)}</section>
      <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">복약 정보</h2>{detail.medications.map(m => <p key={m.id} className="mt-3 text-sm">{m.drug_name} · {m.dosage}</p>)}</section>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">진료 메모</h2><textarea value={note} onChange={e => setNote(e.target.value)} rows={4} className="mt-3 w-full rounded-lg border p-3" placeholder="진료 메모"/><button onClick={() => void createClinicalNote(id, note).then(n => { setNotes(v => [n, ...v]); setNote(""); })} disabled={!note.trim()} className="mt-2 rounded-lg bg-teal-600 px-4 py-2 text-sm text-white disabled:opacity-40">메모 저장</button>{notes.map(n => <div key={n.id} className="mt-3 rounded-lg bg-gray-50 p-3 text-sm"><p>{n.content}</p><p className="mt-1 text-xs text-gray-400">{n.doctor_name} · {new Date(n.created_at).toLocaleString("ko-KR")}</p></div>)}</section>
      <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">처방</h2><div className="mt-3 grid gap-2"><input value={drug} onChange={e => setDrug(e.target.value)} className="rounded-lg border p-2" placeholder="약품명"/><input value={dosage} onChange={e => setDosage(e.target.value)} className="rounded-lg border p-2" placeholder="용량"/><textarea value={instructions} onChange={e => setInstructions(e.target.value)} className="rounded-lg border p-2" placeholder="복용 지시"/><button onClick={() => void createPrescription(id, { medication_name: drug, dosage, instructions, start_date: new Date().toISOString().slice(0, 10), end_date: null, status: "active" }).then(p => { setPrescriptions(v => [p, ...v]); setDrug(""); setDosage(""); setInstructions(""); })} disabled={!drug.trim() || !dosage.trim()} className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white disabled:opacity-40">처방 저장</button></div>{prescriptions.map(p => <div key={p.id} className="mt-3 rounded-lg bg-gray-50 p-3 text-sm"><b>{p.medication_name}</b> {p.dosage}<p>{p.instructions}</p></div>)}</section>
    </div>
    <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">감사 기록</h2>{auditLogs.length === 0 ? <p className="mt-3 text-sm text-gray-400">기록이 없습니다.</p> : auditLogs.map(log => <div key={log.id} className="mt-3 flex justify-between border-b pb-2 text-sm"><span>{log.action} · {log.actor_name}</span><time className="text-xs text-gray-400">{new Date(log.created_at).toLocaleString("ko-KR")}</time></div>)}</section>
  </main></div>;
}
