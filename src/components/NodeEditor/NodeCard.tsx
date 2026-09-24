import React from 'react';
import { FlowNode } from '../../shared/types';
import {
  HelpCircle,
  ShieldAlert,
  Zap,
  PhoneOff,
  Sparkles,
  Edit2,
  Trash2,
  Radio,
  Plus,
  Unlink,
  GripVertical,
  Target,
  Database,
} from 'lucide-react';

interface NodeCardProps {
  node: FlowNode;
  isActive: boolean;
  isSelected: boolean;
  onSelect: (node: FlowNode) => void;
  onEdit: (node: FlowNode) => void;
  onDelete: (nodeId: string) => void;
  onAddBranch: (nodeId: string) => void;
  onDeleteBranch: (nodeId: string, transitionId: string) => void;
  onDisconnectBranch: (nodeId: string, transitionId: string) => void;
  onStartConnectionDrag: (sourceNodeId: string, transitionId: string, startX: number, startY: number) => void;
  onConnectToNode: (targetNodeId: string) => void;
  isConnecting: boolean;
}

export const NodeCard: React.FC<NodeCardProps> = ({
  node,
  isActive,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onAddBranch,
  onDeleteBranch,
  onDisconnectBranch,
  onStartConnectionDrag,
  onConnectToNode,
  isConnecting,
}) => {
  const getTypeBadge = () => {
    switch (node.type) {
      case 'start':
        return {
          icon: <Sparkles className="w-3 h-3 text-emerald-600" />,
          label: 'Start / Pitch',
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
      case 'question':
        return {
          icon: <HelpCircle className="w-3 h-3 text-blue-600" />,
          label: 'Question',
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
        };
      case 'objection':
        return {
          icon: <ShieldAlert className="w-3 h-3 text-amber-600" />,
          label: 'Objection',
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
        };
      case 'action':
        return {
          icon: <Zap className="w-3 h-3 text-indigo-600" />,
          label: 'Action / Close',
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        };
      case 'end':
        return {
          icon: <PhoneOff className="w-3 h-3 text-rose-600" />,
          label: 'End Call',
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
        };
    }
  };

  const badge = getTypeBadge();

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (isConnecting) {
          onConnectToNode(node.id);
        } else {
          onSelect(node);
        }
      }}
      className={`relative w-[320px] rounded-2xl transition-shadow duration-150 select-none ${
        isActive
          ? 'bg-white border-2 border-emerald-500 shadow-2xl shadow-emerald-500/15 ring-4 ring-emerald-500/20'
          : isSelected
          ? 'bg-white border-2 border-blue-600 shadow-2xl shadow-blue-500/15 ring-4 ring-blue-500/20'
          : 'bg-white border border-slate-200 hover:border-slate-300 shadow-lg shadow-slate-900/5 hover:shadow-xl'
      }`}
    >
      {/* Live Active in Call Indicator */}
      {isActive && (
        <div className="absolute -top-3.5 left-5 px-3 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold tracking-wide uppercase flex items-center gap-1.5 shadow-md shadow-emerald-500/40 animate-pulse">
          <Radio className="w-3 h-3 animate-pulse" />
          <span>Active in Call</span>
        </div>
      )}

      {/* Target Inward Port (Left side of Node at Y = 114px) */}
      <div
        className="input-port absolute -left-3.5 top-[114px] -translate-y-1/2 w-7 h-7 rounded-full bg-white border-2 border-slate-400 hover:border-blue-600 flex items-center justify-center cursor-pointer hover:scale-125 transition shadow-md group z-30"
        title="Inward Target Port (Drop line here to connect to this node)"
        onClick={(e) => {
          e.stopPropagation();
          onConnectToNode(node.id);
        }}
      >
        <div className="w-2.5 h-2.5 rounded-full bg-slate-400 group-hover:bg-blue-600 transition"></div>
      </div>

      {/* Card Header (Height: ~46px) */}
      <div className="h-[46px] px-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <div className="text-slate-400 cursor-grab active:cursor-grabbing">
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${badge.bg}`}>
            {badge.icon}
            {badge.label}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(node);
            }}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition"
            title="Edit Prompt & Branches"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          {node.type !== 'start' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.id);
              }}
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
              title="Delete Node"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Node Title & Agent Speech Prompt (Clean Text Area - No Output Dot) */}
      <div className="p-3.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-900 tracking-tight leading-snug truncate">
            {node.title}
          </h4>
        </div>

        <div className="min-h-[64px] max-h-[85px] p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-700 leading-relaxed overflow-y-auto font-sans">
          &quot;{node.agentPrompt.replace(/\{\{[^}]*\}\}/g, '').replace(/\s{2,}/g, ' ').trim()}&quot;
        </div>

        {/* Dedicated Data Capture Variable Badge */}
        {node.targetVariable && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <span className="text-[9px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1">
              <Target className="w-2.5 h-2.5 text-indigo-600" />
              Captures:
            </span>
            <span
              className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-800 font-mono text-[10px] font-bold truncate max-w-[220px] flex items-center gap-1"
              title={`CRM Variable: ${node.targetVariable}`}
            >
              <Database className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
              <span>{node.targetVariableLabel || node.targetVariable}</span>
            </span>
          </div>
        )}
      </div>

      {/* Branch Conditions Section (All Outgoing Connection Routing Happens Here) */}
      <div className="px-3.5 pb-3.5 pt-0.5 space-y-2">
        <div className="h-[20px] flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
          <span>Branch Conditions</span>
          <span className="text-slate-400 font-mono text-[9px]">{node.transitions.length} routes</span>
        </div>

        {/* Branch Rows - Each with its own unique outward connection port */}
        {node.transitions.length === 0 ? (
          <div className="py-2.5 px-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-[10px] text-slate-400 italic">
            {node.type === 'end' ? 'Call ends here' : 'No branch conditions added yet'}
          </div>
        ) : (
          <div className="space-y-2">
            {node.transitions.map((trans, idx) => (
              <div
                key={trans.id}
                className="h-[48px] relative group p-2 rounded-xl bg-slate-50 hover:bg-blue-50/40 border border-slate-200 hover:border-blue-300 flex items-center justify-between text-[11px] transition shadow-2xs"
              >
                <div className="flex-1 truncate mr-2">
                  <span className="text-slate-800 font-semibold truncate block text-xs">
                    {trans.label}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate block">
                    {trans.targetNodeId ? (
                      <span className="text-blue-600 font-medium">➔ Connected: {trans.targetNodeId}</span>
                    ) : (
                      <span className="italic text-slate-400">Drag dot on right to connect</span>
                    )}
                  </span>
                </div>

                {/* Actions on Branch */}
                <div className="flex items-center gap-0.5 mr-1">
                  {trans.targetNodeId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDisconnectBranch(node.id, trans.id);
                      }}
                      className="p-1 text-slate-400 hover:text-amber-600 rounded hover:bg-amber-50 transition"
                      title="Disconnect wire link"
                    >
                      <Unlink className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteBranch(node.id, trans.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 rounded hover:bg-rose-50 transition"
                    title="Delete branch condition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* Stretchable Branch Output Handle (Right Side of this Specific Condition Row) */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onStartConnectionDrag(
                      node.id,
                      trans.id,
                      node.position.x + 320,
                      node.position.y + 190 + (idx * 56) + 24
                    );
                  }}
                  className={`output-port absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white border-2 flex items-center justify-center cursor-crosshair hover:scale-125 shadow-md transition group/port z-20 ${
                    trans.targetNodeId
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-slate-400 hover:border-blue-600'
                  }`}
                  title="Click and drag wire from this branch condition to connect to next node"
                >
                  <div
                    className={`w-2.5 h-2.5 rounded-full transition ${
                      trans.targetNodeId ? 'bg-blue-600' : 'bg-slate-400 group-hover/port:bg-blue-600'
                    }`}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Inline Add Branch Button */}
        {node.type !== 'end' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddBranch(node.id);
            }}
            className="w-full mt-1.5 py-2 px-3 rounded-xl bg-slate-50 hover:bg-blue-50 border border-dashed border-slate-300 hover:border-blue-400 text-slate-600 hover:text-blue-700 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition active:scale-98"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Branch Condition</span>
          </button>
        )}
      </div>
    </div>
  );
};
