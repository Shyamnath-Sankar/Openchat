import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Message } from '../types';
import { Send, Crown, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const DirectChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user, isOP } = useAuth();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchMessages();
    
    const channel = supabase
      .channel('messages_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || sending) return;

    setSending(true);
    const content = newMessage.trim();
    const tempId = `temp-${Date.now()}`;

    const optimisticMessage: Message = {
      id: tempId,
      user_id: user.id,
      username: user.username,
      content,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    setMessages(prev => [...prev, optimisticMessage]);
    setNewMessage('');

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert([{ user_id: user.id, username: user.username, content }])
        .select();

      if (error) throw error;

      // Replace the temporary message with the actual one from the database
      setMessages(prev => prev.map(m => m.id === tempId ? { ...data[0], expires_at: m.expires_at } : m));

    } catch (error) {
      console.error('Error sending message:', error);
      setNewMessage(content); // Re-populate the input if sending fails
      setMessages(prev => prev.filter(m => m.id !== tempId)); // Remove optimistic message on failure
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-900">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-100 dark:bg-zinc-900">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {messages.map((message) => {
          const isOwn = message.user_id === user?.id;
          return (
            <div key={message.id} className={`flex items-end gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0 ${isOwn ? 'bg-indigo-500' : 'bg-zinc-400'}`}>
                {message.username.charAt(0).toUpperCase()}
              </div>
              <div className={`max-w-lg p-3.5 rounded-2xl shadow-sm ${isOwn ? 'bg-indigo-500 text-white rounded-br-none' : 'bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-bl-none'}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold">{message.username}</span>
                  {isOP && message.username === user?.username && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <p className="text-sm break-words">{message.content}</p>
                <div className={`text-xs mt-2 flex items-center gap-1.5 ${isOwn ? 'text-indigo-100' : 'text-zinc-400'}`}>
                  <Clock size={12} />
                  <span>{formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <div className="bg-white dark:bg-zinc-800 p-4 border-t border-zinc-200 dark:border-zinc-700">
        <form onSubmit={sendMessage} className="flex items-center space-x-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="w-full px-5 py-3 bg-zinc-100 dark:bg-zinc-700 border-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
              disabled={sending}
            />
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="p-3 bg-indigo-500 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-zinc-800 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
            ) : (
              <Send size={20} />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default DirectChat;
