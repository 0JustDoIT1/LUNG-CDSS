import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import Header from "../components/Shared/Header";
import { assessTnmCandidate, type TnmCandidateResult } from "../api/clinical";

const T = ["TX", "Tis", "T1mi", "T1a", "T1b", "T1c", "T2a", "T2b", "T3", "T4"];
const N = ["NX", "N0", "N1", "N2", "N2a", "N2b", "N3"];

export default function TnmAssessmentPage(): React.JSX.Element {
  const [searchParams] = useSearchParams();
  const caseId = searchParams.get("case_id") ?? undefined;
  const [t, setT] = useState("T2a"); const [n, setN] = useState("N0");
  const [complete, setComplete] = useState(false); const [organ, setOrgan] = useState("");
  const [result, setResult] = useState<TnmCandidateResult | null>(null);
  const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  async function submit() {
    setLoading(true); setError(null);
    try { setResult(await assessTnmCandidate({ case_id: caseId, t_candidate: t, n_candidate: n, imaging_evidence: { distant_metastasis_assessment_complete: complete, contralateral_lung_nodules: 0, pleural_nodules: 0, pericardial_nodules: 0, malignant_pleural_effusion: false, malignant_pericardial_effusion: false, extrathoracic_lesions: organ.trim() ? [{ status: "confirmed", organ_system: organ.trim().toLowerCase() }] : [] } })); }
    catch (e) { setError(e instanceof Error ? e.message : "TNM candidate assessment failed."); }
    finally { setLoading(false); }
  }
  return <div className="min-h-screen bg-[#f7f8fa]"><Header /><main className="mx-auto max-w-4xl space-y-5 p-4 lg:p-6">
    <section className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><AlertTriangle className="h-5 w-5 shrink-0" /><div><h1 className="font-semibold">TNM9 candidate assessment — physician review only</h1><p className="mt-1 text-sm">This is decision support, not a final stage or patient-facing result. Physician review is required.</p></div></section>
    <div className="grid gap-5 md:grid-cols-2"><section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-semibold">Assessment input</h2><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-sm">T candidate<select value={t} onChange={e => setT(e.target.value)} className="mt-1 w-full rounded-lg border p-2">{T.map(x => <option key={x}>{x}</option>)}</select></label><label className="text-sm">N candidate<select value={n} onChange={e => setN(e.target.value)} className="mt-1 w-full rounded-lg border p-2">{N.map(x => <option key={x}>{x}</option>)}</select></label></div><label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={complete} onChange={e => setComplete(e.target.checked)} /> Distant metastasis assessment complete</label><label className="mt-4 block text-sm">Confirmed single extrathoracic lesion organ (optional)<input value={organ} onChange={e => setOrgan(e.target.value)} placeholder="bone, liver, brain" className="mt-1 w-full rounded-lg border p-2" /></label><button disabled={loading} onClick={() => void submit()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading && <Loader2 className="h-4 w-4 animate-spin" />}Assess candidate</button>{error && <p className="mt-3 text-sm text-rose-600">{error}</p>}</section>
    <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-semibold">Candidate result</h2>{result ? <div className="mt-4"><div className="rounded-xl bg-teal-50 p-4"><p className="text-xs text-teal-700">cTNM candidate</p><p className="text-2xl font-bold text-teal-950">{result.ctnm_candidate}</p><p className="mt-3 text-xs text-teal-700">Stage-group candidate</p><p className="text-xl font-bold text-teal-950">{result.stage_group_candidate ? `Stage ${result.stage_group_candidate}` : "Indeterminate"}</p></div><p className="mt-4 text-sm text-gray-700">M evidence: {result.m_evidence.reasons.join(", ")}</p>{result.warnings.map(w => <p className="mt-2 text-sm text-amber-700" key={w}>{w}</p>)}<p className="mt-4 text-xs text-gray-500">{result.clinical_use_warning}</p></div> : <p className="mt-4 text-sm text-gray-500">Run an assessment to see the review-only candidate.</p>}</section></div>
  </main></div>;
}
