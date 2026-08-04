import apiClient from "./client";
import type { NotificationCategory, NotificationItem, NotificationPreference } from "../types/notification";

export async function getNotifications(): Promise<NotificationItem[]> {
  const { data } = await apiClient.get<NotificationItem[]>("/communication/notifications/");
  return data;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.post(`/communication/notifications/${id}/read/`);
}

export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  const { data } = await apiClient.get<NotificationPreference[]>("/auth/notifications/preferences/");
  return data;
}

export async function updateNotificationPreference(
  category: NotificationCategory,
  enabled: boolean,
): Promise<NotificationPreference> {
  const { data } = await apiClient.patch<NotificationPreference>("/auth/notifications/preferences/update/", {
    category,
    enabled,
  });
  return data;
}
