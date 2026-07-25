import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import type { CaseListItem, CaseDetail } from "../types/case";
import { Th } from "../components/dashboard/shared";
import { CaseResultModal } from "../components/pathologist/CaseResultModal";
import { getCases, getCase } from "../api/cases";
import { useNavigate } from "react-router-dom";

const STATUS_LABELS_SIMPLE: Record<string, string> = {
  uploaded: "업로드됨",
  processing: "분석 중",
  completed: "완료",
  failed: "실패",
};

const STATUS_CLS_SIMPLE: Record<string, string> = {
  uploaded: "bg-gray-100 text-gray-600",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-rose-100 text-rose-700",
};

export default function CaseListPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");

  const [modalCase, setModalCase] = useState<CaseDetail | CaseListItem | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCases();
      setCases(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "케이스 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter(
      (c) =>
        (c.specimen_id ?? "").toLowerCase().includes(q) ||
        (c.prediction_label ?? "").toLowerCase().includes(q)
    );
  }, [cases, search]);

  const openModal = useCallback(async (c: CaseListItem): Promise<void> => {
    setModalCase(c);
    setDetailLoading(true);
    try {
      const detail = await getCase(c.id);
      setModalCase(detail);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeModal = (): void => setModalCase(null);

  if (loading)
    return (
      <div className="p-8 flex items-center gap-2 text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...
      </div>
    );
  if (error) return <div className="p-8 text-sm text-rose-600">에러: {error}</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-medium text-gray-400">진단 워크플로우</p>
          <h1 className="font-semibold text-2xl text-gray-900 tracking-tight">결과리스트</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate("/upload")}
          className="px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-[#185fa5] text-white hover:bg-[#144d8a] transition"
        >
          + 새 케이스 업로드
        </button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="검체 ID 검색..."
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#185fa5]"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/80 sticky top-0">
            <tr>
              <Th>검체 ID</Th>
              <Th>업로드일시</Th>
              <Th>분류</Th>
              <Th>정확도</Th>
              <Th>상태</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((c) => {
              const luad = c.luad_probability ?? 0;
              const lusc = c.lusc_probability ?? 0;
              const conf = c.luad_probability != null ? Math.max(luad, lusc) : null;
              return (
                <tr
                  key={c.id}
                  onClick={() => openModal(c)}
                  className="hover:bg-blue-50 hover:shadow-sm transition-all cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{c.specimen_id}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs tabular-nums">
                    {c.uploaded_at ? new Date(c.uploaded_at).toLocaleString("ko-KR") : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {c.prediction_label ? (
                      <span
                        className={`text-xs font-semibold ${
                          c.prediction_label === "LUAD" ? "text-indigo-600" : "text-teal-600"
                        }`}
                      >
                        {c.prediction_label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-gray-600">
                    {conf != null ? `${(conf * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS_SIMPLE[c.status]}`}>
                      {STATUS_LABELS_SIMPLE[c.status]}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">
                  케이스가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalCase && (
        <CaseResultModal caseData={modalCase} loading={detailLoading} onClose={closeModal} />
      )}
    </div>
  );
}