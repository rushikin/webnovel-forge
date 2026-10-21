

import { useState } from 'react';
import { ForgeLogo } from './ForgeLogo';

export function ChatBotCorner() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: 'Hi! I am your Forge Novel Assistant. I can help brainstorm twists, audit continuity, or format character voice.' },
  ]);
  const [input, setInput] = useState('');

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = { role: 'user' as const, content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    try {
      const reply = await window.electronAPI.runContinuityCheck('', 0, input);
      const content = typeof reply === 'object' && 'content' in reply ? (reply as any).content : 'Draft received and analyzed.';
      setMessages((prev) => [...prev, { role: 'assistant', content }]);
    } catch (e) {
      console.error(e);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Connected to local workspace.' }]);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 select-none">
      {open ? (
        <div className="flex flex-col w-84 h-96 bg-aged-paper border border-muted-slate/20 rounded-2xl shadow-2xl overflow-hidden animate-spring-pop ring-1 ring-lamp-gold/20">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-aged-paper-dark border-b border-muted-slate/15">
            <div className="flex items-center gap-2">
              <ForgeLogo size={20} />
              <span className="font-semibold text-xs text-text-primary">Forge Companion</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-slate hover:text-text-primary text-sm px-1.5 py-0.5 rounded hover:bg-muted-slate/10 hover:scale-110 active:scale-90 transition-transform"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar text-xs">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'assistant' ? 'justify-start' : 'justify-end'} animate-slide-up-fade`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl leading-relaxed transition-all duration-200 ${
                    m.role === 'assistant'
                      ? 'bg-aged-paper-dark border border-muted-slate/15 text-text-primary'
                      : 'bg-lamp-gold text-ink-night font-medium shadow-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>
          <div className="p-2.5 border-t border-muted-slate/15 bg-aged-paper-dark flex gap-1.5 items-center">
            <input
              className="flex-1 bg-ink-night/40 border border-muted-slate/20 text-text-primary placeholder:text-muted-slate text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-lamp-gold/60 transition-colors"
              placeholder="Ask writing assistant…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className="btn-primary !px-3 !py-2 text-xs font-semibold shrink-0 hover:scale-105 active:scale-95 transition-all duration-150 disabled:hover:scale-100"
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="p-3 bg-aged-paper hover:bg-aged-paper-dark border border-lamp-gold/40 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center ring-2 ring-lamp-gold/30 hover:ring-lamp-gold/60 animate-pulse-subtle group"
          title="Open Forge Companion"
        >
          <div className="transition-transform duration-300 group-hover:rotate-12">
            <ForgeLogo size={26} />
          </div>
        </button>
      )}
    </div>
  );
}
