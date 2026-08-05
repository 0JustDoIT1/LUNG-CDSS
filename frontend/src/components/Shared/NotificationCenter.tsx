import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bell, CheckCheck, ClipboardCheck, Loader2, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markNotificationRead } from "../../api/notifications";
import type { NotificationCategory, NotificationItem } from "../../types/notification";

const POLL_INTERVAL_MS = 30_000;

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  medication: "복약",
  appointment: "예약",
  chat: "채팅",
  triage: "증상",
  case_review: "케이스",
};

function formatRelativeTime(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(value).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function CategoryIcon({ category }: { category: NotificationCategory }): React.JSX.Element {
  const cls = "h-4 w-4";
  if (category === "chat") return <MessageCircle className={cls} />;
  if (category === "triage") return <AlertTriangle className={cls} />;
  return <ClipboardCheck className={cls} />;
}

function normalizeDeepLink(deepLink: string): string {
  const normalized = deepLink.startsWith("/") ? deepLink : `/${deepLink}`;

  // Older appointment notifications point to a detail route that does not
  // exist in the doctor web app. Keep those stored notifications usable.
  const legacyAppointmentMatch = normalized.match(/^\/appointments\/([^/]+)\/?$/);
  if (legacyAppointmentMatch) {
    return `/doctor-dashboard/schedule?appointment=${encodeURIComponent(legacyAppointmentMatch[1])}`;
  }

  return normalized;
}

export default function NotificationCenter(): React.JSX.Element {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async (silent = false) => {
    try {
      const data = await getNotifications();
      setNotifications(data.slice(0, 30));
      setError(null);
    } catch {
      if (!silent) setError("알림을 불러오지 못했습니다.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void getNotifications()
      .then((data) => {
        if (!active) return;
        setNotifications(data.slice(0, 30));
        setError(null);
      })
      .catch(() => {
        if (active) setError("알림을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const timer = window.setInterval(() => {
      void getNotifications()
        .then((data) => {
          if (!active) return;
          setNotifications(data.slice(0, 30));
          setError(null);
        })
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);

  async function handleNotificationClick(item: NotificationItem): Promise<void> {
    if (!item.is_read) {
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === item.id ? { ...notification, is_read: true } : notification
        )
      );
      try {
        await markNotificationRead(item.id);
      } catch {
        loadNotifications(true);
      }
    }

    setOpen(false);
    if (item.deep_link) navigate(normalizeDeepLink(item.deep_link));
  }

  async function handleMarkAllRead(): Promise<void> {
    const unread = notifications.filter((item) => !item.is_read);
    if (unread.length === 0) return;

    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    const results = await Promise.allSettled(unread.map((item) => markNotificationRead(item.id)));
    if (results.some((result) => result.status === "rejected")) loadNotifications(true);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unreadCount > 0 ? `알림 ${unreadCount}개` : "알림"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-teal-600"
      >
        <Bell className="h-4.5 w-4.5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          role="dialog"
          aria-label="알림 목록"
          className="absolute right-0 top-11 z-50 flex max-h-[min(70vh,520px)] w-[min(92vw,390px)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">알림</h2>
              <p className="mt-0.5 text-[11px] text-gray-400">안 읽은 알림 {unreadCount}개</p>
            </div>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50 disabled:cursor-default disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" /> 모두 읽음
            </button>
          </div>

          <div className="overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" /> 알림을 불러오는 중...
              </div>
            ) : error ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-rose-600">{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    void loadNotifications();
                  }}
                  className="mt-3 text-xs font-medium text-teal-600 hover:underline"
                >
                  다시 시도
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Bell className="mx-auto h-7 w-7 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">새로운 알림이 없습니다.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {notifications.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(item)}
                      className={`flex w-full gap-3 px-4 py-3.5 text-left transition hover:bg-gray-50 ${
                        item.is_read ? "bg-white" : "bg-teal-50/60"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          item.category === "triage"
                            ? "bg-rose-100 text-rose-600"
                            : "bg-teal-100 text-teal-700"
                        }`}
                      >
                        <CategoryIcon category={item.category} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className={`text-[13px] ${item.is_read ? "font-medium text-gray-700" : "font-semibold text-gray-900"}`}>
                            {item.title}
                          </span>
                          {!item.is_read ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal-500" /> : null}
                        </span>
                        <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-gray-500">{item.body}</span>
                        <span className="mt-1.5 flex items-center gap-1.5 text-[10px] text-gray-400">
                          <span>{CATEGORY_LABELS[item.category]}</span>
                          <span aria-hidden="true">·</span>
                          <time dateTime={item.created_at}>{formatRelativeTime(item.created_at)}</time>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
