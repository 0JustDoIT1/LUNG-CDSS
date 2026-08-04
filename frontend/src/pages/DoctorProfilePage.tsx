import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Bell, Loader2, Save, Stethoscope, UserRound } from "lucide-react";
import { getDoctorProfile, updateDoctorProfile } from "../api/auth";
import { getNotificationPreferences, updateNotificationPreference } from "../api/notifications";
import Header from "../components/Shared/Header";
import type { NotificationCategory, NotificationPreference } from "../types/notification";
import { getStoredItem } from "../utils/storage";

const NOTIFICATION_LABELS: Record<NotificationCategory, { title: string; description: string }> = {
  case_review: { title: "케이스 검토", description: "분석 완료와 판독 관련 알림을 받습니다." },
  chat: { title: "의료진 채팅", description: "새로운 의료진 메시지 알림을 받습니다." },
  appointment: { title: "진료 예약", description: "예약 일정과 변경 관련 알림을 받습니다." },
  triage: { title: "증상 위험도", description: "주의가 필요한 증상 분류 알림을 받습니다." },
  medication: { title: "복약", description: "복약 관리와 관련된 알림을 받습니다." },
};

const NOTIFICATION_ORDER: NotificationCategory[] = ["case_review", "chat", "appointment", "triage", "medication"];

export default function DoctorProfilePage(): React.JSX.Element {
  const [photoUrl, setPhotoUrl] = useState("");
  const [specialtyText, setSpecialtyText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferenceSaving, setPreferenceSaving] = useState<NotificationCategory | null>(null);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const userName = getStoredItem("user_name") ?? "의사";

  useEffect(() => {
    let active = true;
    void getDoctorProfile()
      .then((profile) => {
        if (!active) return;
        setPhotoUrl(profile.photo_url ?? "");
        setSpecialtyText(profile.specialty_tags.join(", "));
      })
      .catch(() => {
        if (active) setError("프로필을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void getNotificationPreferences()
      .then((data) => {
        if (active) setPreferences(data);
      })
      .catch(() => {
        if (active) setPreferenceError("알림 설정을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setPreferencesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const specialtyTags = specialtyText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const updated = await updateDoctorProfile({ photo_url: photoUrl.trim() || null, specialty_tags: specialtyTags });
      setPhotoUrl(updated.photo_url ?? "");
      setSpecialtyText(updated.specialty_tags.join(", "));
      setMessage("프로필이 저장되었습니다.");
    } catch {
      setError("프로필을 저장하지 못했습니다. 사진 주소와 입력값을 확인해주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePreferenceToggle(category: NotificationCategory, enabled: boolean): Promise<void> {
    const previous = preferences;
    setPreferenceError(null);
    setPreferenceSaving(category);
    setPreferences((current) => current.map((item) => item.category === category ? { ...item, enabled } : item));
    try {
      const updated = await updateNotificationPreference(category, enabled);
      setPreferences((current) => current.map((item) => item.category === category ? updated : item));
    } catch {
      setPreferences(previous);
      setPreferenceError("알림 설정을 저장하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setPreferenceSaving(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <Header />
      <main className="mx-auto w-full max-w-4xl p-4 lg:p-6">
        <div className="mb-5">
          <p className="text-xs font-medium text-teal-600">계정 설정</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">의사 프로필</h1>
          <p className="mt-1 text-sm text-gray-500">프로필 사진과 전문 진료 분야를 관리합니다.</p>
        </div>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
          ) : (
            <form onSubmit={(event) => void handleSubmit(event)}>
              <div className="flex flex-col gap-5 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-white px-6 py-6 sm:flex-row sm:items-center">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-teal-100 shadow-sm">
                  {photoUrl ? (
                    <img src={photoUrl} alt={`${userName} 프로필`} className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-10 w-10 text-teal-600" />
                  )}
                </div>
                <div>
                  <p className="text-xl font-semibold text-gray-900">{userName}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                    <Stethoscope className="h-4 w-4" /> 의료진 계정
                  </p>
                </div>
              </div>

              <div className="space-y-5 p-6">
                <div>
                  <label htmlFor="doctor-photo-url" className="mb-1.5 block text-sm font-medium text-gray-700">프로필 사진 URL</label>
                  <input
                    id="doctor-photo-url"
                    type="url"
                    value={photoUrl}
                    onChange={(event) => setPhotoUrl(event.target.value)}
                    placeholder="https://example.com/profile.jpg"
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  />
                  <p className="mt-1.5 text-xs text-gray-400">HTTPS 이미지 주소를 입력하세요.</p>
                </div>

                <div>
                  <label htmlFor="doctor-specialties" className="mb-1.5 block text-sm font-medium text-gray-700">전문 진료 분야</label>
                  <input
                    id="doctor-specialties"
                    value={specialtyText}
                    onChange={(event) => setSpecialtyText(event.target.value)}
                    placeholder="폐암클리닉, 금연클리닉"
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  />
                  <p className="mt-1.5 text-xs text-gray-400">여러 항목은 쉼표로 구분하세요.</p>
                </div>

                {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}
                {message ? <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-700">{message}</p> : null}

                <div className="flex justify-end">
                  <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? "저장 중..." : "프로필 저장"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/80 px-6 py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
              <Bell className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">알림 설정</h2>
              <p className="mt-0.5 text-xs text-gray-500">받고 싶은 알림 종류를 선택하세요.</p>
            </div>
          </div>

          <div className="divide-y divide-gray-100 px-6">
            {preferencesLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" /> 알림 설정을 불러오는 중...
              </div>
            ) : (
              NOTIFICATION_ORDER.map((category) => {
                const preference = preferences.find((item) => item.category === category);
                const enabled = preference?.enabled ?? true;
                const savingThis = preferenceSaving === category;
                return (
                  <div key={category} className="flex items-center justify-between gap-4 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{NOTIFICATION_LABELS[category].title}</p>
                      <p className="mt-1 text-xs text-gray-400">{NOTIFICATION_LABELS[category].description}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={`${NOTIFICATION_LABELS[category].title} 알림`}
                      disabled={preferenceSaving !== null}
                      onClick={() => void handlePreferenceToggle(category, !enabled)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                        enabled ? "bg-teal-600" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          enabled ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                      {savingThis ? <span className="sr-only">저장 중</span> : null}
                    </button>
                  </div>
                );
              })
            )}
          </div>
          {preferenceError ? <p className="mx-6 mb-5 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{preferenceError}</p> : null}
        </section>
      </main>
    </div>
  );
}
