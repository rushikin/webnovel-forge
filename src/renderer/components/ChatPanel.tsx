import React, { useState, useRef, useEffect, useCallback } from 'react'
import { SkillsDrawer, type Skill } from './SkillsDrawer'

interface ChatPanelProps {
  phase: string
  onSave: (content: string) => void
  onRegenerate: () => void
  isGenerating?: boolean
  savedContent?: string
  projectPath?: string
  initialMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  chapterNumber?: number
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  isStreaming?: boolean
}

export function ChatPanel({ 
  phase, 
  onSave, 
  onRegenerate, 
  isGenerating = false,
  savedContent,
  projectPath,
  initialMessages = [],
  chapterNumber = 1,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [showSkills, setShowSkills] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Initialize with greeting or initial messages
  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages.map((m, i) => ({
        id: `init-${i}`,
        role: m.role,
        content: m.content,
        timestamp: Date.now() - (initialMessages.length - i) * 1000,
      })))
    } else if (messages.length === 0) {
      const greetings: Record<string, string> = {
        brainstorm: "Welcome to **Brainstorming**. Tell me about the story you're imagining — genre, vibe, any inspirations? I'll ask a few questions, then propose 3-5 distinct concepts.",
        structure: "Welcome to **Structure**. I have your chosen concept. Pick a template - Three-Act, Hero's Journey, Cultivation Arc, or Custom - and I'll build the skeleton with turning points, midpoint, climax, and ending.",
        world_plot: "Welcome to **World & Plot**. We'll build your world bible (magic system, factions, history) and then a chapter-by-chapter outline in batches of 20. What's the core magic/power system?",
        characters: "Welcome to **Characters**. I'll generate full character sheets with voice fingerprints and locked facts. Want me to extract names from your outline, or add characters manually?",
        chapters: `Welcome to **Chapter Writing**. Select a chapter from your outline and I'll draft it using the full context pack, then run a continuity check. Which chapter shall we start? (Currently selected: Chapter ${chapterNumber})`,
      }
      setMessages([{
        id: 'greeting',
        role: 'assistant',
        content: greetings[phase] || greetings.brainstorm,
        timestamp: Date.now(),
      }])
    }
  }, [phase, initialMessages, chapterNumber])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    }

    setMessages(prev => [...prev, userMessage])
    const currentInput = input
    setInput('')
    setIsStreaming(true)

    // Generate unique requestId for streaming correlation
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const assistantId = `assistant-${Date.now()}`
    let unsubscribe: (() => void) | null = null
    let streamedContent = ''
    let didStream = false

    // Create placeholder assistant bubble for streaming
    const placeholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    }
    setMessages(prev => [...prev, placeholder])

    // Listen for streaming chunks via window.electronAPI.onAiStreamChunk
    if (projectPath && window.electronAPI?.onAiStreamChunk) {
      unsubscribe = window.electronAPI.onAiStreamChunk((chunk: { requestId: string; text?: string; done?: boolean; error?: string }) => {
        if (chunk.requestId !== requestId) return
        if (chunk.text) {
          didStream = true
          streamedContent += chunk.text
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: streamedContent, isStreaming: true } : m))
        }
        if (chunk.done) {
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, isStreaming: false } : m))
          setIsStreaming(false)
          if (unsubscribe) {
            unsubscribe()
            unsubscribe = null
          }
        }
        if (chunk.error) {
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `Error: ${chunk.error}`, isStreaming: false } : m))
          setIsStreaming(false)
          if (unsubscribe) {
            unsubscribe()
            unsubscribe = null
          }
        }
      })
    }

    try {
      let aiResponse = ''
      
      // Build chat history for the pipeline call (includes greeting + all prior + current)
      const chatHistory = [...messages, { role: 'user' as const, content: currentInput }].map(m => ({
        role: m.role,
        content: m.content,
      }))

      // Call the appropriate pipeline phase based on the current phase
      if (projectPath && window.electronAPI) {
        let result: any = null

        // 2.2 Clarifying Questions Gate — Chat-First, Not Auto-Pilot
        // If fewer than 3 turns (user+assistant exchanges), ask clarifying questions before drafting
        // This ensures 2–4 targeted questions per APP_INSTRUCTIONS.md §0.1
        const shouldClarify = chatHistory.length < 3
        if (shouldClarify && window.electronAPI.pipelineClarifyingQuestions) {
          try {
            const clarifyingResult = await window.electronAPI.pipelineClarifyingQuestions(projectPath, phase, chatHistory)
            if (clarifyingResult) {
              // Handle both shapes: PipelineResult { content } or { questions: string[] }
              if (clarifyingResult.questions && Array.isArray(clarifyingResult.questions)) {
                aiResponse = clarifyingResult.questions.join('\n\n')
              } else if (clarifyingResult.content) {
                aiResponse = clarifyingResult.content
              } else if (typeof clarifyingResult === 'string') {
                aiResponse = clarifyingResult
              }
              // If clarifying returned a valid response, use it and skip artifact generation
              if (aiResponse) {
                result = { success: true, content: aiResponse, isClarifying: true }
              }
            }
          } catch (clarifyErr) {
            console.warn('Clarifying questions step failed, falling back to generation:', clarifyErr)
          }
        }

        // If not in clarifying mode, or clarifying returned empty, do normal generation
        if (!result) {
          switch (phase) {
            case 'brainstorm':
              result = await window.electronAPI.pipelineBrainstorm(projectPath, chatHistory)
              break
            case 'structure':
              result = await window.electronAPI.pipelineStructure(projectPath, chatHistory)
              break
            case 'world_plot':
              // Try world building first, then plot outline
              result = await window.electronAPI.pipelineWorldBuilding(projectPath, chatHistory)
              break
            case 'characters':
              result = await window.electronAPI.pipelineCharacter(projectPath, chatHistory)
              break
            case 'chapters':
              // 2.1 Fix: use passed chapterNumber instead of hardcoded 1
              result = await window.electronAPI.pipelineWriteChapter(projectPath, chatHistory, chapterNumber)
              break
            default:
              result = { success: false, error: 'Unknown phase' }
          }
          
          if (result?.success) {
            aiResponse = result.content
          } else {
            aiResponse = `Error: ${result?.error || 'Unknown error'}`
          }

        } else {
          // Clarifying path already filled aiResponse
          if (!aiResponse && result?.content) aiResponse = result.content
        }
      } else {
        // Fallback: simulated response for development without a project
        aiResponse = await simulateAIResponse(phase, chapterNumber)
      }
      
      // If streaming already filled the bubble via chunks, just finalize it
      if (didStream) {
        // Content already streamed into placeholder; ensure final content matches if needed
        if (streamedContent && !streamedContent.includes(aiResponse?.slice(0, 20) || '___none___') && aiResponse) {
          // Prefer streamed content, but if pipeline returned different content and we streamed, keep streamed
        }
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: streamedContent || aiResponse, isStreaming: false } : m))
      } else {
        // No streaming occurred — fill placeholder with full response at once
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: aiResponse, isStreaming: false } : m))
      }
    } catch (error) {
      console.error('Failed to get AI response:', error)
      const errorContent = 'Sorry, I encountered an error. Please check your API key in Settings and try again.'
      if (didStream) {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: streamedContent || errorContent, isStreaming: false } : m))
      } else {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: errorContent, isStreaming: false } : m))
      }
    } finally {
      setIsStreaming(false)
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
    }
  }, [input, isStreaming, phase, messages, projectPath, chapterNumber])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleSave = () => {
    if (savedContent) {
      onSave(savedContent)
    }
  }

  // Regenerate with streaming support
  const handleRegenerateWithStream = useCallback(async () => {
    if (isStreaming || isGenerating) return
    // Delegate to parent's regenerate, but also show streaming placeholder if no content
    // Parent handles actual regeneration (potentially with editor feedback loop)
    onRegenerate()
  }, [onRegenerate, isStreaming, isGenerating])

  const handleRunSkill = useCallback((skill: Skill) => {
    // Append skill prompt to input (per spec: appends SKILL_PROMPTS[skill] to chat input)
    setInput(skill.prompt)
    setShowSkills(false)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [])

  const handleClear = useCallback(() => {
    const greetings: Record<string, string> = {
      brainstorm: "Welcome to **Brainstorming**. Tell me about the story you're imagining — genre, vibe, any inspirations? I'll ask a few questions, then propose 3-5 distinct concepts.",
      structure: "Welcome to **Structure**. I have your chosen concept. Pick a template - Three-Act, Hero's Journey, Cultivation Arc, or Custom - and I'll build the skeleton with turning points, midpoint, climax, and ending.",
      world_plot: "Welcome to **World & Plot**. We'll build your world bible (magic system, factions, history) and then a chapter-by-chapter outline in batches of 20. What's the core magic/power system?",
      characters: "Welcome to **Characters**. I'll generate full character sheets with voice fingerprints and locked facts. Want me to extract names from your outline, or add characters manually?",
      chapters: `Welcome to **Chapter Writing**. Select a chapter from your outline and I'll draft it using the full context pack, then run a continuity check. Which chapter shall we start? (Currently selected: Chapter ${chapterNumber})`,
    }
    setMessages([{
      id: 'greeting-clear',
      role: 'assistant',
      content: greetings[phase] || greetings.brainstorm,
      timestamp: Date.now(),
    }])
  }, [phase, chapterNumber])

  const handleCopyChat = useCallback(async () => {
    const text = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {}
  }, [messages])

  return (
    <div className="flex flex-col h-full bg-ink-night">
      {/* Phase Header */}
      <div className="flex items-center justify-between p-4 border-b border-muted-slate/10 bg-ink-night/50 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span className="phase-seal locked font-display text-sm">
            {phase.charAt(0).toUpperCase()}
          </span>
          <h2 className="font-display text-xl text-lamp-gold">{phase.charAt(0).toUpperCase() + phase.slice(1)}</h2>
          {phase === 'chapters' && (
            <span className="text-xs font-mono bg-lamp-gold/10 text-lamp-gold px-2 py-1 rounded">Ch. {chapterNumber}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleClear} className="btn-ghost p-1.5 text-xs" title="Clear chat (ChatPanel.tsx:160)">Clear</button>
          <button onClick={handleCopyChat} className="btn-ghost p-1.5 text-xs" title="Copy chat (clipboard)">📋</button>
          <button
            onClick={() => setShowSkills(true)}
            className="btn-ghost text-sm px-3 py-1.5 border border-muted-slate/20 hover:border-lamp-gold/40 hover:text-lamp-gold"
            title="Bonus Writing Skills"
          >
            ✨ Skills
          </button>
          {savedContent && (
            <button onClick={handleSave} className="btn-primary text-sm px-4 py-2">
              Save & Continue →
            </button>
          )}
          <button onClick={handleRegenerateWithStream} disabled={isGenerating || isStreaming} className="btn-secondary text-sm px-4 py-2">
            {isGenerating || isStreaming ? 'Generating...' : 'Regenerate'}
          </button>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {messages.map(msg => {
          const isDraftProposal = msg.role === 'assistant' && (msg.content.includes('Draft Proposal') || msg.content.includes('Phase 1 of') || (msg.content.includes('1.') && msg.content.includes('2.') && msg.content.includes('3.') && msg.content.length > 500))
          if (isDraftProposal) {
            return (
              <div key={msg.id} className="flex justify-start animate-slide-up-fade">
                <div className="bg-[#0D0F14] border-2 rounded-xl p-4 max-w-[85%] relative" style={{ borderColor: 'rgba(201,168,76,0.4)', borderRadius: '12px', padding: '16px' }}>
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide mb-2" style={{ color: '#C9A84C' }}>
                    <span>📄 Draft Proposal</span>
                    <span className="text-muted-slate text-[10px]">Phase 1 of 5</span>
                  </div>
                  <div className="relative max-h-[200px] overflow-y-auto custom-scrollbar pr-2" style={{ maxHeight: '200px' }}>
                    <div className="prose prose-inherit text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#E8EAF0' }}>
                      {msg.content}
                      {msg.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-lamp-gold animate-pulse" />}
                    </div>
                    <div className="sticky bottom-0 left-0 right-0 h-8 pointer-events-none" style={{ background: 'linear-gradient(to top, #0D0F14, transparent)' }} />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button className="btn-ghost text-xs px-3 py-1">✏ Edit</button>
                    <button onClick={handleRegenerateWithStream} className="btn-ghost text-xs px-3 py-1">🔄 Regenerate</button>
                    <button onClick={handleSave} className="btn-primary text-xs px-3 py-1">💾 Save & Continue →</button>
                  </div>
                  <div className="text-[10px] text-muted-slate/60 mt-2 text-right font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            )
          }
          return (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up-fade`}>
              <div className={`${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}>
                <div className="prose prose-inherit text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                  {msg.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-lamp-gold animate-pulse" />}
                </div>
                <div className="text-[10px] text-muted-slate/60 mt-1 text-right font-mono">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {msg.isStreaming && <span className="ml-2 text-lamp-gold">● streaming</span>}
                </div>
              </div>
            </div>
          )
        })}
        {/* AI typing: 3 staggered pulsing dots */}
        {isStreaming && (
          <div className="flex justify-start animate-slide-up-fade">
            <div className="flex items-center gap-1 bg-card rounded-2xl rounded-bl-md px-4 py-3 border border-muted-slate/10">
              <div className="flex gap-1 dots-pulse">
                <span className="w-2 h-2 bg-muted-slate rounded-full animate-dots-pulse" style={{ backgroundColor: '#6B7A99' }}></span>
                <span className="w-2 h-2 bg-muted-slate rounded-full animate-dots-pulse" style={{ backgroundColor: '#6B7A99', animationDelay: '0.2s' }}></span>
                <span className="w-2 h-2 bg-muted-slate rounded-full animate-dots-pulse" style={{ backgroundColor: '#6B7A99', animationDelay: '0.4s' }}></span>
              </div>
              <span className="text-xs text-muted-slate ml-2">AI typing</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-muted-slate/10 bg-ink-night/50">
        {/* Quick Action chips (spec) */}
        <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
          {[
            { label: '💡 Generate Ideas', prompt: 'Generate ideas for the next scene' },
            { label: '🎲 Surprise Me', prompt: 'Surprise me with an unexpected twist for this story' },
            { label: '📖 Genre Picker', prompt: 'Suggest genre-appropriate tropes and how to use them' },
          ].map((chip) => (
            <button
              key={chip.label}
              onClick={() => setInput(chip.prompt)}
              className="whitespace-nowrap rounded-full px-3 py-1 text-xs border border-muted-slate/20 bg-aged-paper text-muted-slate hover:border-lamp-gold/50 hover:text-lamp-gold hover:scale-105 active:scale-95 transition-all duration-150 h-7 font-sans shadow-sm"
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'AI is thinking...' : 'Type your response...'}
            disabled={isStreaming || isGenerating}
            className="textarea-field flex-1 min-h-[60px] max-h-48 focus:ring-1 focus:ring-lamp-gold/30 transition-all duration-200"
            rows={2}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming || isGenerating}
            className="btn-primary self-end mb-1 px-6 hover:scale-105 active:scale-95 transition-all duration-150 shadow disabled:hover:scale-100"
          >
            Send
          </button>
        </div>
        <p className="text-[11px] text-muted-slate/50 mt-1 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>

      {/* Bonus Writing Skills Drawer — Screen 6 spec */}
      <SkillsDrawer isOpen={showSkills} onClose={() => setShowSkills(false)} onRunSkill={handleRunSkill} />
    </div>
  )
}

// Simulated AI response for development (no API key / projectPath)
async function simulateAIResponse(phase: string, chapterNumber: number = 1): Promise<string> {
  const responses: Record<string, string[]> = {
    brainstorm: [
      "That's a fantastic starting point! Before I generate concepts, I'd love to understand more about your vision. **Quick questions:**\n\n1. What sub-genre calls to you?\n2. Protagonist style: lone wolf, crew/sect builder, or merchant/diplomat?\n3. Any tropes you love or hate?\n4. Tone check: gritty, lighthearted, dark, or comedic?",
    ],
    structure: [
      "Great! Now let's give this story bones. **A few structural questions:**\n\n1. Which template - Three-Act, Hero's Journey, or Cultivation Arc?\n2. How long - ~50, ~100, ~200+ chapters?\n3. Ending preference: victory, open-ended, bittersweet, or ascension?\n4. Any major turning points you already see?",
    ],
    world_plot: [
      "Now let's build the **world bible** and **chapter outline**.\n\n1. What's the core magic/power system?\n2. Setting scope: single sect, multiple kingdoms, cross-realm?\n3. Major factions?\n4. Outline batch size (recommend 20 at a time)?",
    ],
    characters: [
      "Time to populate your world! For each major character, I need:\n1. Name & Role\n2. Any real-world inspiration?\n3. One defining contradiction\n\nWho's first?",
    ],
    chapters: [
      `Ready to write **Chapter ${chapterNumber}**? I'll build the Context Pack automatically and draft the chapter. After, the Continuity Editor will audit it. Shall we begin?`,
    ],
  }

  const phaseResponses = responses[phase] || responses.brainstorm
  return phaseResponses[Math.floor(Math.random() * phaseResponses.length)]
}
