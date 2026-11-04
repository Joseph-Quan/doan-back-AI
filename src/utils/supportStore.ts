export type SupportMessage = {
  id: number;
  sender: 'customer' | 'ai' | 'staff';
  sender_name: string;
  message: string;
  image_url?: string;
  created_at: string;
};

export type SupportConversation = {
  id: number;
  customer_id: number;
  customer_name: string;
  status: 'open' | 'answered';
  updated_at: string;
  messages: SupportMessage[];
};

const conversations = new Map<number, SupportConversation>();
let nextConversationId = 1;
let nextMessageId = 1;

const now = (): string => new Date().toISOString();

export function getOrCreateConversation(customerId: number, customerName: string, conversationId?: number): SupportConversation {
  const existing = conversationId ? conversations.get(conversationId) : undefined;
  if (existing && existing.customer_id === customerId) return existing;

  const conversation: SupportConversation = {
    id: nextConversationId++,
    customer_id: customerId,
    customer_name: customerName,
    status: 'open',
    updated_at: now(),
    messages: []
  };
  conversations.set(conversation.id, conversation);
  return conversation;
}

export function addMessage(conversation: SupportConversation, sender: SupportMessage['sender'], senderName: string, message: string, imageUrl?: string): SupportMessage {
  const entry: SupportMessage = {
    id: nextMessageId++,
    sender,
    sender_name: senderName,
    message: message || '',
    ...(imageUrl ? { image_url: imageUrl } : {}),
    created_at: now()
  };
  conversation.messages.push(entry);
  conversation.updated_at = entry.created_at;
  if (sender === 'staff') conversation.status = 'answered';
  return entry;
}

export function listConversations(): SupportConversation[] {
  return [...conversations.values()].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export function getConversation(id: number): SupportConversation | undefined {
  return conversations.get(id);
}
