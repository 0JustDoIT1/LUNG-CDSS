import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Loader2, MessageCircle, Plus, Send, Users } from "lucide-react";
import { useParams } from "react-router-dom";
import {
  getChatCounterparts,
  getChatMessages,
  getChatThreads,
  sendChatMessage,
  startChatThread,
} from "../api/communication";
import Header from "../components/Shared/Header";
import type { ChatCounterpart, ChatMessage, ChatThread } from "../types/communication";
import { getStoredItem } from "../utils/storage";

export default function DoctorChatPage(): React.JSX.Element {
  const { threadId } = useParams<{ threadId?: string }>();
  const currentUserName = getStoredItem("user_name");
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [counterparts, setCounterparts] = useState<ChatCounterpart[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newCounterpartId, setNewCounterpartId] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getChatThreads(), getChatCounterparts()])
      .then(([threadData, counterpartData]) => {
        if (!active) return;
        setThreads(threadData);
        setCounterparts(counterpartData);
        setMessagesLoading(true);
        setSelectedThreadId(
          threadId && threadData.some((thread) => thread.id === threadId) ? threadId : (threadData[0]?.id ?? null)
        );
      })
      .catch(() => {
        if (active) setError("채팅 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [threadId]);

  useEffect(() => {
    if (!selectedThreadId) {
      return;
    }
    let active = true;
    void getChatMessages(selectedThreadId)
      .then((data) => {
        if (active) setMessages(data);
      })
      .catch(() => {
        if (active) setError("메시지를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setMessagesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedThreadId]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [selectedThreadId, threads]
  );

  async function handleStartThread(): Promise<void> {
    if (!newCounterpartId) return;
    setError(null);
    try {
      const thread = await startChatThread(newCounterpartId);
      setThreads((current) => [thread, ...current.filter((item) => item.id !== thread.id)]);
      setMessagesLoading(true);
      setSelectedThreadId(thread.id);
      setNewCounterpartId("");
    } catch {
      setError("새 대화를 시작하지 못했습니다.");
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const content = draft.trim();
    if (!selectedThreadId || !content || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendChatMessage(selectedThreadId, content);
      setMessages((current) => [...current, sent]);
      setThreads((current) =>
        current.map((thread) => (thread.id === selectedThreadId ? { ...thread, last_message: sent.content } : thread))
      );
      setDraft("");
    } catch {
      setError("메시지를 보내지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <Header />
      <main className="mx-auto w-full max-w-[1400px] p-4 lg:p-6">
        <div className="mb-5">
          <p className="text-xs font-medium text-teal-600">협진 커뮤니케이션</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">의료진 채팅</h1>
          <p className="mt-1 text-sm text-gray-500">같은 진료과 간호사와 안전하게 메시지를 주고받습니다.</p>
        </div>

        {error ? <p className="mb-3 rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-600">{error}</p> : null}

        <div className="grid min-h-[650px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:grid-cols-[320px_1fr]">
          <aside className="border-b border-gray-200 md:border-b-0 md:border-r">
            <div className="border-b border-gray-100 p-4">
              <label htmlFor="chat-counterpart" className="mb-1.5 block text-xs font-medium text-gray-600">
                새 대화 시작
              </label>
              <div className="flex gap-2">
                <select
                  id="chat-counterpart"
                  value={newCounterpartId}
                  onChange={(event) => setNewCounterpartId(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
                >
                  <option value="">간호사 선택</option>
                  {counterparts.map((person) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleStartThread()}
                  disabled={!newCounterpartId}
                  aria-label="대화 시작"
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600 text-white disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[570px] overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>
              ) : threads.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Users className="mx-auto h-8 w-8 text-gray-300" />
                  <p className="mt-2 text-sm text-gray-400">아직 대화가 없습니다.</p>
                </div>
              ) : threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => {
                    setMessagesLoading(true);
                    setSelectedThreadId(thread.id);
                  }}
                  className={`w-full border-b border-gray-100 px-4 py-3.5 text-left transition-colors ${selectedThreadId === thread.id ? "bg-teal-50" : "hover:bg-gray-50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-gray-800">{thread.other_participant_name ?? "의료진"}</p>
                    {thread.unread_count > 0 ? <span className="rounded-full bg-teal-600 px-1.5 text-[10px] text-white">{thread.unread_count}</span> : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-400">{thread.last_message ?? "대화를 시작해보세요."}</p>
                </button>
              ))}
            </div>
          </aside>

          <section className="flex min-h-[500px] flex-col">
            {selectedThread ? (
              <>
                <header className="border-b border-gray-100 px-5 py-4">
                  <p className="font-semibold text-gray-900">{selectedThread.other_participant_name ?? "의료진"}</p>
                  <p className="text-xs text-gray-400">의료진 전용 대화</p>
                </header>
                <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50/50 p-5">
                  {messagesLoading ? (
                    <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>
                  ) : messages.length === 0 ? (
                    <p className="py-12 text-center text-sm text-gray-400">첫 메시지를 보내보세요.</p>
                  ) : messages.map((message) => {
                    const mine = message.sender_name === currentUserName;
                    return (
                      <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${mine ? "bg-teal-600 text-white" : "border border-gray-200 bg-white text-gray-800"}`}>
                          {!mine ? <p className="mb-1 text-[11px] font-medium text-teal-700">{message.sender_name}</p> : null}
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                          <p className={`mt-1 text-right text-[10px] ${mine ? "text-teal-100" : "text-gray-400"}`}>
                            {new Date(message.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <form onSubmit={(event) => void handleSend(event)} className="flex gap-2 border-t border-gray-100 p-4">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    rows={2}
                    placeholder="메시지를 입력하세요. Shift+Enter로 줄바꿈"
                    className="min-h-11 flex-1 resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
                  />
                  <button type="submit" disabled={!draft.trim() || sending} className="flex w-12 items-center justify-center rounded-xl bg-teal-600 text-white disabled:opacity-40">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </form>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
                <MessageCircle className="h-10 w-10" />
                <p className="mt-3 text-sm">왼쪽에서 대화를 선택하세요.</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
