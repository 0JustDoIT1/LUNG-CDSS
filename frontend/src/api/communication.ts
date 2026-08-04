import apiClient from "./client";
import type { ChatCounterpart, ChatMessage, ChatThread } from "../types/communication";

export async function getChatThreads() {
  const { data } = await apiClient.get<ChatThread[]>("/communication/threads/");
  return data;
}

export async function getChatCounterparts() {
  const { data } = await apiClient.get<ChatCounterpart[]>("/communication/threads/counterparts/");
  return data;
}

export async function startChatThread(userId: string) {
  const { data } = await apiClient.post<ChatThread>("/communication/threads/start/", { user_id: userId });
  return data;
}

export async function getChatMessages(threadId: string) {
  const { data } = await apiClient.get<ChatMessage[]>(`/communication/threads/${threadId}/messages/`);
  return data;
}

export async function sendChatMessage(threadId: string, content: string) {
  const { data } = await apiClient.post<ChatMessage>(`/communication/threads/${threadId}/messages/`, { content });
  return data;
}
