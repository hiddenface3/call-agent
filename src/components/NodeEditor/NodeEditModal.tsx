import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Save,
  Sparkles,
  GitBranch,
  ArrowRight,
  Tag,
  Target,
  Database,
  SlidersHorizontal,
  CheckCircle2,
} from 'lucide-react';
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

const STANDARD_VARIABLES: { key: string; label: string; description: string }[] = [
  { key: '', label: '-- None (No variable to capture on this step) --', description: 'Agent speaks without capturing a CRM slot' },
  { key: 'asking_price', label: 'Asking Price (asking_price)', description: 'Captures homeowner price expectation or refusal' },
  { key: 'callback_time', label: 'Scheduled Callback Time (callback_time)', description: 'Captures agreed follow-up appointment time' },
  { key: 'property_details', label: 'Property Details & Bed/Bath (property_details)', description: 'Captures bed, bath, and property specs' },
  { key: 'client_name', label: 'Client / Seller Name (client_name)', description: 'Captures the caller or homeowner name' },
  { key: 'property_address', label: 'Property Address (property_address)', description: 'Captures property street address or location' },
  { key: 'condition', label: 'Condition & Repairs (condition)', description: 'Captures repair status, updates, or fixer info' },
  { key: 'timeline', label: 'Selling Timeline (timeline)', description: 'Captures urgency or closing timeframe' },
  { key: 'reason_for_selling', label: 'Reason for Selling / Motivation (reason_for_selling)', description: 'Captures reason for sale' },
];

export const NodeEditModal: React.FC<NodeEditModalProps> = ({
  isOpen,
  node,
  allNodes,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState<FlowNode | null>(null);
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
    if (node) {
      const cloned: FlowNode = JSON.parse(JSON.stringify(node));
      // Auto-sanitize existing agentPrompt if it contains residual {{...}} tags
      cloned.agentPrompt = (cloned.agentPrompt || '')
        .replace(/\{\{[^}]*\}\}/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      setForm(cloned);
    } else {
      setForm(null);
    }
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
   * Set the target capture variable for this node
   */
  const handleSelectVariable = (variableKey: string) => {
    if (!variableKey) {
      setForm({
        ...form,
        targetVariable: undefined,
        targetVariableLabel: undefined,
      });
      return;
    }

    const std = STANDARD_VARIABLES.find((v) => v.key === variableKey);
    const label = std
      ? std.label.split(' (')[0]
      : variableKey.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

    setForm({
      ...form,
      targetVariable: variableKey,
      targetVariableLabel: label,
    });
  };

  /**
   * Create a new custom extraction variable and attach it to this node
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

    // Attach to current node as its target variable
    handleSelectVariable(cleanedSlug);
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
    if (form.targetVariable === slug) {
      setForm({ ...form, targetVariable: undefined, targetVariableLabel: undefined });
    }
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
      // Ensure agentPrompt is 100% clean of any {{...}} brackets
      const cleanPrompt = (form.agentPrompt || '')
        .replace(/\{\{[^}]*\}\}/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      onSave({
        ...form,
        agentPrompt: cleanPrompt,
      });
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

          {/* Section 1: Agent Spoken Speech Instructions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-slate-800 block font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                Agent Speech Instructions for this Step
              </label>
              <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Pure Spoken Speech</span>
              </span>
            </div>

            <p className="text-[11px] text-slate-500">
              Type exactly what the AI agent should speak aloud. Write natural conversational sentences only (strictly no curly braces, variables, or brackets).
            </p>

            <textarea
              ref={textareaRef}
              rows={3}
              value={form.agentPrompt}
              onChange={(e) => setForm({ ...form, agentPrompt: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 text-xs focus:border-blue-600 focus:bg-white focus:outline-none transition leading-relaxed font-sans"
              placeholder="e.g. Great! What ballpark cash price do you have in mind for the property?"
              required
            />
          </div>

          {/* Section 2: Dedicated CRM Data Capture Variable (Completely Separate from Prompt) */}
          <div className="p-3.5 bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-purple-50/80 rounded-2xl border border-indigo-100/90 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-xs">
                  <Database className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900 block flex items-center gap-1">
                    <span>Data Capture Target for this Step</span>
                    <span className="text-[10px] text-indigo-700 bg-white/90 px-1.5 py-0.5 rounded font-semibold border border-indigo-200">
                      AI Brain Powered
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    Kept completely separate from spoken speech so the AI will NEVER utter variable names aloud.
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCreatingVar(!isCreatingVar)}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 bg-white hover:bg-slate-50 px-2.5 py-1 rounded-xl border border-indigo-200 transition shadow-2xs flex items-center gap-1 active:scale-95 shrink-0"
              >
                <Plus className="w-3 h-3 text-indigo-600" />
                <span>{isCreatingVar ? 'Hide Creator' : '+ Custom Variable'}</span>
              </button>
            </div>

            {/* Variable Selection Dropdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Select CRM Variable to Capture:
                </label>
                <select
                  value={form.targetVariable || ''}
                  onChange={(e) => handleSelectVariable(e.target.value)}
                  className="w-full bg-white border border-indigo-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:border-indigo-600 focus:outline-none transition shadow-2xs"
                >
                  <optgroup label="Standard CRM Variables">
                    {STANDARD_VARIABLES.map((v) => (
                      <option key={v.key} value={v.key}>
                        {v.label}
                      </option>
                    ))}
                  </optgroup>
                  {customVariables.length > 0 && (
                    <optgroup label="Your Custom Dynamic Variables">
                      {customVariables.map((cVar) => (
                        <option key={cVar} value={cVar}>
                          {cVar} (Custom)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Active Variable Display Card */}
              <div className="flex flex-col justify-center">
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Active Extraction Target:
                </label>
                {form.targetVariable ? (
                  <div className="px-3 py-2 bg-white rounded-xl border border-indigo-200 flex items-center justify-between shadow-2xs">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-indigo-600 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-indigo-900 block leading-none">
                          {form.targetVariableLabel || form.targetVariable}
                        </span>
                        <span className="text-[10px] font-mono text-indigo-500 block mt-0.5">
                          Key: {form.targetVariable}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectVariable('')}
                      className="text-[10px] text-slate-400 hover:text-rose-600 font-semibold px-2 py-0.5 rounded-lg hover:bg-rose-50 transition"
                      title="Clear variable"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="px-3 py-2 bg-slate-100/70 rounded-xl border border-dashed border-slate-200 text-[11px] text-slate-500 italic">
                    No variable attached (Speech only)
                  </div>
                )}
              </div>
            </div>

            {/* Custom Variable Creator */}
            {isCreatingVar && (
              <div className="p-2.5 bg-white rounded-xl border border-indigo-200 space-y-2 animate-fade-in shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3 h-3 text-indigo-600" />
                    Create New Dynamic Extraction Variable
                  </span>
                  <span className="text-[10px] text-slate-500">Auto-converts to slug syntax</span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1">
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
                      placeholder="e.g. loan_balance, monthly_rent, roof_age, tenant_status"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-mono focus:border-indigo-600 focus:bg-white focus:outline-none transition"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddCustomVariable()}
                    disabled={!newVarName.trim()}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs shadow-xs transition active:scale-95 flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create & Connect</span>
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
