import apiClient from "./client";
import type { NotificationItem } from "../types/notification";

export async function getNotifications(): Promise<NotificationItem[]> {
  const { data } = await apiClient.get<NotificationItem[]>("/communication/notifications/");
  return data;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.post(`/communication/notifications/${id}/read/`);
}
