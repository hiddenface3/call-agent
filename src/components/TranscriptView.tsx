import React, { useEffect, useRef, useState } from 'react';
import {
  MessageSquare,
  Bot,
  User,
  Send,
  Download,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { ChatMessage } from '../shared/types';

interface TranscriptViewProps {
  messages: ChatMessage[];
  streamingAgentText: string;
  currentInterimText?: string;
  isThinking: boolean;
  onSendMessage: (text: string) => void;
  disabled?: boolean;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  messages,
  streamingAgentText,
  currentInterimText = '',
  isThinking,
  onSendMessage,
  disabled = false,
}) => {
  const [inputText, setInputText] = useState('');
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingAgentText, isThinking]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || disabled) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleCopyTranscript = () => {
    const text = messages
      .map((m) => `[${m.timestamp}] ${m.sender.toUpperCase()}: ${m.text}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTranscript = () => {
    const text = messages
      .map((m) => `[${m.timestamp}] ${m.sender.toUpperCase()}: ${m.text}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-transcript-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl glass-panel p-5 flex flex-col h-full border border-slate-800 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Live Call Transcript</h3>
            <p className="text-[11px] text-slate-400">Word-by-word conversation audit</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopyTranscript}
            disabled={messages.length === 0}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 disabled:opacity-40 transition text-xs flex items-center gap-1"
            title="Copy Transcript"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDownloadTranscript}
            disabled={messages.length === 0}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 disabled:opacity-40 transition text-xs flex items-center gap-1"
            title="Export TXT"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3.5 pr-2 my-1"
      >
        {messages.length === 0 && !streamingAgentText && !isThinking ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <Bot className="w-10 h-10 mb-2 opacity-30 text-blue-400" />
            <p className="text-xs font-medium text-slate-400">Transcript is ready</p>
            <p className="text-[11px] text-slate-600 max-w-xs mt-1">
              Click &quot;Start Voice Call&quot; to speak with Sarah or use the test simulator below.
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 text-xs leading-relaxed ${
                  msg.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {/* Agent Avatar */}
                {msg.sender === 'agent' && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-md shadow-sky-950">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                {/* Message Bubble */}
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-2.5 shadow-sm ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-slate-800/90 text-slate-200 border border-slate-700/80 rounded-bl-none'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1 opacity-75 text-[10px]">
                    <span className="font-semibold">{msg.sender === 'user' ? 'Homeowner' : 'Sarah (Apex AI)'}</span>
                    <span>{msg.timestamp}</span>
                  </div>
                  <p className="text-xs select-text">{msg.text}</p>
                </div>

                {/* User Avatar */}
                {msg.sender === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-md shadow-emerald-950">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {/* Live Streaming LLM Response */}
            {streamingAgentText && (
              <div className="flex gap-3 text-xs leading-relaxed justify-start">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-md animate-pulse">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="max-w-[82%] rounded-2xl px-4 py-2.5 bg-slate-800/90 text-slate-200 border border-sky-500/40 rounded-bl-none shadow-lg shadow-sky-950/20">
                  <div className="flex items-center gap-1.5 mb-1 text-sky-400 font-semibold text-[10px]">
                    <Sparkles className="w-3 h-3 animate-spin" />
                    <span>Sarah is speaking...</span>
                  </div>
                  <p className="text-xs select-text">{streamingAgentText}</p>
                </div>
              </div>
            )}

            {/* Live Homeowner Speaking Interim Bubble */}
            {currentInterimText && (
              <div className="flex gap-3 text-xs leading-relaxed justify-end animate-fade-in">
                <div className="max-w-[82%] rounded-2xl px-4 py-2.5 bg-emerald-600 text-white rounded-br-none border border-emerald-400/40 shadow-lg shadow-emerald-950/30">
                  <div className="flex items-center gap-1.5 mb-1 text-emerald-200 font-semibold text-[10px]">
                    <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping"></span>
                    <span>Homeowner (Speaking...)</span>
                  </div>
                  <p className="text-xs select-text italic">&quot;{currentInterimText}...&quot;</p>
                </div>
                <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-md shadow-emerald-950">
                  <User className="w-4 h-4" />
                </div>
              </div>
            )}

            {/* Thinking state */}
            {isThinking && !streamingAgentText && (
              <div className="flex gap-3 text-xs leading-relaxed justify-start animate-fade-in">
                <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="px-3.5 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-400 flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:0.2s]"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:0.4s]"></div>
                  </div>
                  <span className="text-[11px]">Reasoning with Local LLM...</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Manual Input Bar */}
      <form onSubmit={handleSubmit} className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type what you want to say (or speak into mic)..."
          disabled={disabled}
          className="flex-1 bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
        />
        <button
          type="submit"
          disabled={disabled || !inputText.trim()}
          className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition active:scale-95 shadow-md shadow-blue-600/20"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
