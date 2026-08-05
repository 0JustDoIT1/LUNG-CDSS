export interface ChatThread {
  id: string;
  related_case: string | null;
  other_participant_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
}

export interface ChatCounterpart {
  id: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  thread: string;
  sender: string;
  sender_name: string;
  content: string | null;
  voice_url: string | null;
  created_at: string;
}
