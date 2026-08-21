import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Trash2, Save, Sparkles, GitBranch, ArrowRight, Tag, Check, SlidersHorizontal } from 'lucide-react';
import { FlowNode, FlowTransition } from '../../shared/types';

interface NodeEditModalProps {
  isOpen: boolean;
  node: FlowNode | null;
  allNodes: FlowNode[];
  onClose: () => void;
  onSave: (updatedNode: FlowNode) => void;
}

const DEFAULT_CUSTOM_VARIABLES = [
  'loan_balance',
  'monthly_rent',
  'email_address',
  'tenant_status',
  'square_footage',
  'roof_age',
];

export const NodeEditModal: React.FC<NodeEditModalProps> = ({
  isOpen,
  node,
  allNodes,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState<FlowNode | null>(node);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Custom Variable State
  const [customVariables, setCustomVariables] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('apex_voice_custom_variables');
      return stored ? JSON.parse(stored) : DEFAULT_CUSTOM_VARIABLES;
    } catch {
      return DEFAULT_CUSTOM_VARIABLES;
    }
  });

  const [newVarName, setNewVarName] = useState<string>('');
  const [isCreatingVar, setIsCreatingVar] = useState<boolean>(false);

  useEffect(() => {
    setForm(node ? JSON.parse(JSON.stringify(node)) : null);
  }, [node]);

  const saveCustomVarsToStorage = (vars: string[]) => {
    setCustomVariables(vars);
    try {
      localStorage.setItem('apex_voice_custom_variables', JSON.stringify(vars));
    } catch (e) {
      console.warn('Could not save custom variables:', e);
    }
  };

  if (!isOpen || !form) return null;

  /**
   * Insert variable tag at cursor position inside prompt textarea
   */
  const handleInsertTag = (tagText: string) => {
    const currentPrompt = form.agentPrompt || '';
    const textarea = textareaRef.current;

    if (textarea && typeof textarea.selectionStart === 'number') {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = currentPrompt.substring(0, start);
      const after = currentPrompt.substring(end);
      
      const insertStr = (before.endsWith(' ') || before.length === 0 ? '' : ' ') +
        tagText +
        (after.startsWith(' ') || after.length === 0 ? '' : ' ');

      const updatedText = before + insertStr + after;
      setForm({ ...form, agentPrompt: updatedText });

      setTimeout(() => {
        textarea.focus();
        const nextPos = start + insertStr.length;
        textarea.setSelectionRange(nextPos, nextPos);
      }, 50);
    } else {
      const updatedText = currentPrompt ? `${currentPrompt} ${tagText}` : tagText;
      setForm({ ...form, agentPrompt: updatedText });
    }
  };

  /**
   * Create a new custom extraction variable
   */
  const handleAddCustomVariable = (customName?: string) => {
    const nameToAdd = (customName || newVarName).trim();
    if (!nameToAdd) return;

    // Convert into clean identifier slug
    const cleanedSlug = nameToAdd
      .toLowerCase()
      .replace(/[\{\}]/g, '')
      .replace(/[\s-]+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    if (!cleanedSlug) return;

    if (!customVariables.includes(cleanedSlug)) {
      const updated = [...customVariables, cleanedSlug];
      saveCustomVarsToStorage(updated);
    }

    // Immediately insert tag into prompt
    handleInsertTag(`{{${cleanedSlug}}}`);
    setNewVarName('');
    setIsCreatingVar(false);
  };

  /**
   * Delete a custom variable from user registry
   */
  const handleDeleteCustomVariable = (slug: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customVariables.filter((v) => v !== slug);
    saveCustomVarsToStorage(updated);
  };

  const handleAddTransition = () => {
    const newTransition: FlowTransition = {
      id: `t-${Date.now()}`,
      label: 'New Condition / Intent',
      conditionText: 'User says...',
      targetNodeId: allNodes.find((n) => n.id !== form.id)?.id || '',
    };

    setForm({
      ...form,
      transitions: [...form.transitions, newTransition],
    });
  };

  const handleUpdateTransition = (idx: number, field: keyof FlowTransition, val: string) => {
    const updated = [...form.transitions];
    updated[idx] = { ...updated[idx], [field]: val };
    setForm({ ...form, transitions: updated });
  };

  const handleDeleteTransition = (idx: number) => {
    setForm({
      ...form,
      transitions: form.transitions.filter((_, i) => i !== idx),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form) {
      onSave(form);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Configure Script Node</h2>
              <p className="text-xs text-slate-500">Edit agent speech instructions and dynamic data extraction</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 block mb-1 font-semibold">Node Title / Step Name</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-medium focus:border-blue-600 focus:bg-white focus:outline-none transition"
                required
              />
            </div>

            <div>
              <label className="text-slate-700 block mb-1 font-semibold">Node Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as FlowNode['type'] })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-medium focus:border-blue-600 focus:bg-white focus:outline-none transition"
              >
                <option value="start">Start / Greeting</option>
                <option value="question">Question / Qualification</option>
                <option value="objection">Objection Handling</option>
                <option value="action">Action / Call to Action</option>
                <option value="end">End Call</option>
              </select>
            </div>
          </div>

          {/* Prompt Instructions with Dynamic Data Extraction Variables */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-slate-800 block font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                Agent Speech Instructions for this Step
              </label>
              <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100 flex items-center gap-1">
                <Tag className="w-3 h-3 text-indigo-500" />
                <span>AI Data Extraction Enabled</span>
              </span>
            </div>

            <p className="text-[11px] text-slate-500">
              What Sarah should say or ask. Click any variable below to insert it at cursor position—answers will be automatically extracted into your CRM table & downloadable CSV!
            </p>

            {/* Variable Tag Toolbar & Custom Variable Creator */}
            <div className="p-3 bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-purple-50/80 rounded-2xl border border-blue-100/90 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <span>Standard Extraction Variables:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreatingVar(!isCreatingVar)}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 bg-white/90 hover:bg-white px-2 py-0.5 rounded-lg border border-indigo-200 transition shadow-2xs flex items-center gap-1 active:scale-95"
                >
                  <Plus className="w-3 h-3 text-indigo-600" />
                  <span>{isCreatingVar ? 'Hide Custom Creator' : '+ Add Custom Variable'}</span>
                </button>
              </div>

              {/* Standard Built-in Variable Chips */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { tag: '{{client_name}}', label: 'Client Name', color: 'bg-white hover:bg-blue-100 text-blue-800 border-blue-200' },
                  { tag: '{{property_details}}', label: 'Property Details (Bed/Bath)', color: 'bg-white hover:bg-emerald-100 text-emerald-800 border-emerald-200' },
                  { tag: '{{property_address}}', label: 'Property Address', color: 'bg-white hover:bg-purple-100 text-purple-800 border-purple-200' },
                  { tag: '{{asking_price}}', label: 'Asking Price', color: 'bg-white hover:bg-amber-100 text-amber-800 border-amber-200' },
                  { tag: '{{callback_time}}', label: 'Callback Time', color: 'bg-white hover:bg-cyan-100 text-cyan-800 border-cyan-200' },
                  { tag: '{{condition}}', label: 'Repairs & Condition', color: 'bg-white hover:bg-rose-100 text-rose-800 border-rose-200' },
                  { tag: '{{timeline}}', label: 'Selling Timeline', color: 'bg-white hover:bg-teal-100 text-teal-800 border-teal-200' },
                ].map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => handleInsertTag(item.tag)}
                    className={`px-2 py-1 rounded-lg border text-[10px] font-mono font-semibold transition active:scale-95 shadow-xs flex items-center gap-1 ${item.color}`}
                    title={`Click to insert ${item.tag} at cursor`}
                  >
                    <Plus className="w-2.5 h-2.5" />
                    <span>{item.tag}</span>
                  </button>
                ))}
              </div>

              {/* Custom Dynamic Variables List */}
              {customVariables.length > 0 && (
                <div className="pt-2 border-t border-indigo-100/80 space-y-1.5">
                  <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block">
                    Your Custom Dynamic Variables:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {customVariables.map((cVar) => (
                      <div
                        key={cVar}
                        className="inline-flex items-center rounded-lg border border-purple-200 bg-white hover:bg-purple-50 text-purple-800 text-[10px] font-mono font-semibold shadow-xs overflow-hidden transition group"
                      >
                        <button
                          type="button"
                          onClick={() => handleInsertTag(`{{${cVar}}}`)}
                          className="px-2 py-1 flex items-center gap-1 hover:text-purple-900"
                          title={`Insert {{${cVar}}} into prompt`}
                        >
                          <Sparkles className="w-2.5 h-2.5 text-purple-500" />
                          <span>{`{{${cVar}}}`}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteCustomVariable(cVar, e)}
                          className="px-1 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border-l border-purple-100 transition"
                          title={`Remove ${cVar} variable`}
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Interactive Custom Variable Creator Section */}
              {isCreatingVar && (
                <div className="p-2.5 bg-white rounded-xl border border-indigo-200 space-y-2 animate-fade-in shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3 h-3 text-indigo-600" />
                      Create New Dynamic Extraction Variable
                    </span>
                    <span className="text-[10px] text-slate-500">Auto-converts to slug syntax</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={newVarName}
                        onChange={(e) => setNewVarName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomVariable();
                          }
                        }}
                        placeholder="e.g. loan_balance, monthly_rent, preferred_time, email"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-mono focus:border-indigo-600 focus:bg-white focus:outline-none transition"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddCustomVariable()}
                      disabled={!newVarName.trim()}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs shadow-xs transition active:scale-95 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add & Insert</span>
                    </button>
                  </div>

                  {/* Quick Suggestions */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[9px] text-slate-400 font-medium">Quick suggestions:</span>
                    {[
                      'mortgage_balance',
                      'monthly_rent',
                      'email_address',
                      'preferred_time',
                      'roof_age',
                      'square_footage',
                      'occupancy',
                      'decision_maker',
                    ].map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => handleAddCustomVariable(sug)}
                        className="text-[9px] font-mono text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-100 transition"
                      >
                        + {sug}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Prompt Text Area */}
            <textarea
              ref={textareaRef}
              rows={4}
              value={form.agentPrompt}
              onChange={(e) => setForm({ ...form, agentPrompt: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 text-xs focus:border-blue-600 focus:bg-white focus:outline-none transition leading-relaxed"
              placeholder="e.g. Great! How many bedrooms and bathrooms does the property have? {{property_details}}"
              required
            />

            {/* Live Detected Slots Indicator */}
            {(() => {
              const detected = [...form.agentPrompt.matchAll(/\{\{([a-zA-Z0-9_\s-]+)\}\}/g)].map((m) => m[1].trim());
              if (detected.length === 0) return null;
              return (
                <div className="flex items-center gap-2 text-[11px] text-slate-600 p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="font-bold text-emerald-800 flex items-center gap-1 shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Detected Extraction Slots in this Step:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {detected.map((slot, sIdx) => (
                      <span
                        key={sIdx}
                        className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-mono text-[10px] font-semibold flex items-center gap-1 shadow-2xs"
                      >
                        <Tag className="w-2.5 h-2.5" />
                        {`{{${slot}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Outgoing Branch Transitions */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-slate-800 font-bold block">Outgoing Branch Conditions & Connections</label>
              <button
                type="button"
                onClick={handleAddTransition}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 text-xs transition active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Branch Route</span>
              </button>
            </div>

            {form.transitions.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                No outgoing branch rules. This node will act as a terminal step.
              </p>
            ) : (
              <div className="space-y-2.5">
                {form.transitions.map((t, idx) => (
                  <div
                    key={t.id}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                        Branch Condition #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteTransition(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 transition"
                        title="Delete branch"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold block mb-0.5">
                          Condition Label (e.g. Yes / Willing to Sell)
                        </label>
                        <input
                          type="text"
                          value={t.label}
                          onChange={(e) => handleUpdateTransition(idx, 'label', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-medium text-xs focus:border-blue-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold block mb-0.5 flex items-center gap-1">
                          <ArrowRight className="w-3 h-3 text-emerald-600" />
                          Connects To Target Node:
                        </label>
                        <select
                          value={t.targetNodeId}
                          onChange={(e) => handleUpdateTransition(idx, 'targetNodeId', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-medium text-xs focus:border-blue-600 focus:outline-none"
                        >
                          <option value="">-- Drag wire or select node --</option>
                          {allNodes.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 font-semibold block mb-0.5">
                        Matching Criteria (What customer says to trigger this path):
                      </label>
                      <input
                        type="text"
                        value={t.conditionText}
                        onChange={(e) => handleUpdateTransition(idx, 'conditionText', e.target.value)}
                        placeholder="e.g. Customer says yes or gives bedroom details"
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 text-xs focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/20 transition active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Apply Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
