export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  avatarText: string;
  avatarUrl?: string;
  text: string;
  time: string;
  reactions: Record<string, number>; // Эмодзи -> Количество реакций
  isStaff?: boolean;
  replyToId?: string | null;
  replySenderName?: string | null;
  replyText?: string | null;
  mentionIds?: string[];
}

export const CHAT_SNAPSHOT_KEY='dvizh:messages';
export const normalizeChatMessages=(data:{messages?:any[]}):ChatMessage[]=>(data.messages || []).map((msg: any) => ({
        id: String(msg.id),
        senderId: String(msg.sender_id),
        senderName: msg.sender_name || 'Партнёр VVD',
        avatarText: (msg.sender_name || 'VV').slice(0, 2).toUpperCase(),
        avatarUrl: msg.avatar_url || '',
        text: msg.text,
        time: new Date(msg.created_at).toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        reactions: msg.reactions || {},
        isStaff: Boolean(msg.is_staff),
        replyToId: msg.reply_to_id ? String(msg.reply_to_id) : null,
        replySenderName: msg.reply_sender_name || null,
        replyText: msg.reply_text || null,
        mentionIds: Array.isArray(msg.mention_ids) ? msg.mention_ids.map(String) : [],
      }));
