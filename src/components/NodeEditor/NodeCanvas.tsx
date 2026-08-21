import React, { useState, useRef, useEffect } from 'react';
import {
  CallFlowGraph,
  FlowNode,
  FlowTransition,
  AgentConfig,
} from '../../shared/types';
import { NodeCard } from './NodeCard';
import { NodeEditModal } from './NodeEditModal';
import { FlowTestSimulator } from './FlowTestSimulator';
import { DEFAULT_CALL_FLOW, DEFAULT_CONFIG } from '../../shared/constants';
import { compileFlowToSystemPrompt } from '../../services/promptCompiler';
import {
  Plus,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  GitBranch,
  Save,
  Check,
  Radio,
  Sparkles,
  PhoneCall,
  Wand2,
} from 'lucide-react';

interface NodeCanvasProps {
  flow: CallFlowGraph;
  activeNodeId: string;
  onUpdateFlow: (updatedFlow: CallFlowGraph) => void;
  config?: AgentConfig;
  onUpdateConfig?: (newConfig: AgentConfig) => void;
}

export const NodeCanvas: React.FC<NodeCanvasProps> = ({
  flow,
  activeNodeId,
  onUpdateFlow,
  config = DEFAULT_CONFIG,
  onUpdateConfig,
}) => {
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [editingNode, setEditingNode] = useState<FlowNode | null>(null);
  const [zoom, setZoom] = useState<number>(0.85);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [savedBadge, setSavedBadge] = useState<boolean>(false);
  const [promptCreatedBadge, setPromptCreatedBadge] = useState<boolean>(false);
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);

  // Workflow Live Voice Call State
  const [isTestDrawerOpen, setIsTestDrawerOpen] = useState<boolean>(false);
  const [testActiveNodeId, setTestActiveNodeId] = useState<string>(flow.initialNodeId || 'node-greeting');
  const [activeTraversedEdgeKey, setActiveTraversedEdgeKey] = useState<string | null>(null);

  // Active Drag-to-Connect Wire State
  const [dragConnection, setDragConnection] = useState<{
    sourceNodeId: string;
    transitionId: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Smooth Mouse Wheel Zoom with Cursor Anchoring
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    const newZoom = e.deltaY < 0
      ? Math.min(2.0, zoom * zoomFactor)
      : Math.max(0.35, zoom / zoomFactor);

    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newPanX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
      const newPanY = mouseY - (mouseY - pan.y) * (newZoom / zoom);

      setPan({ x: newPanX, y: newPanY });
    }
    setZoom(newZoom);
  };

  // Canvas Mouse Down (Pan)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (
      e.target === canvasRef.current ||
      (e.target as HTMLElement).tagName === 'svg' ||
      (e.target as HTMLElement).id === 'canvas-bg'
    ) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      setSelectedNode(null);
      setDragConnection(null);
    }
  };

  // Start Node Drag
  const handleNodeMouseDown = (e: React.MouseEvent, node: FlowNode) => {
    e.stopPropagation();
    if (dragConnection) return;
    setDraggingNodeId(node.id);
    setDragOffset({
      x: (e.clientX - pan.x) / zoom - node.position.x,
      y: (e.clientY - pan.y) / zoom - node.position.y,
    });
    setSelectedNode(node);
  };

  // Start Stretchable Wire Connection Drag from a specific branch condition
  const handleStartConnectionDrag = (
    sourceNodeId: string,
    transitionId: string,
    startX: number,
    startY: number
  ) => {
    setDragConnection({
      sourceNodeId,
      transitionId,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
    });
  };

  // Global Window Mouse Event Listeners for smooth unrestricted dragging in all directions
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isPanning) {
        setPan({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      } else if (draggingNodeId) {
        const newX = Math.round((e.clientX - pan.x) / zoom - dragOffset.x);
        const newY = Math.round((e.clientY - pan.y) / zoom - dragOffset.y);

        const updatedNodes = flow.nodes.map((n) =>
          n.id === draggingNodeId ? { ...n, position: { x: newX, y: newY } } : n
        );
        onUpdateFlow({ ...flow, nodes: updatedNodes });
      } else if (dragConnection) {
        const curX = (e.clientX - pan.x) / zoom;
        const curY = (e.clientY - pan.y) / zoom;
        setDragConnection((prev) => (prev ? { ...prev, currentX: curX, currentY: curY } : null));
      }
    };

    const handleGlobalMouseUp = () => {
      setIsPanning(false);
      setDraggingNodeId(null);
    };

    if (isPanning || draggingNodeId || dragConnection) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isPanning, panStart, draggingNodeId, dragConnection, pan, zoom, dragOffset, flow, onUpdateFlow]);

  // Connect stretched wire from branch condition to target node
  const handleConnectToNode = (targetNodeId: string) => {
    if (!dragConnection || dragConnection.sourceNodeId === targetNodeId) {
      setDragConnection(null);
      return;
    }

    const sourceNode = flow.nodes.find((n) => n.id === dragConnection.sourceNodeId);
    if (!sourceNode) return;

    const updatedTransitions = sourceNode.transitions.map((t) =>
      t.id === dragConnection.transitionId ? { ...t, targetNodeId } : t
    );

    const updatedNodes = flow.nodes.map((n) =>
      n.id === sourceNode.id ? { ...n, transitions: updatedTransitions } : n
    );

    onUpdateFlow({ ...flow, nodes: updatedNodes });
    setDragConnection(null);
  };

  // Disconnect branch condition wire
  const handleDisconnectBranch = (sourceNodeId: string, transitionId: string) => {
    const updatedNodes = flow.nodes.map((n) => {
      if (n.id === sourceNodeId) {
        return {
          ...n,
          transitions: n.transitions.map((t) =>
            t.id === transitionId ? { ...t, targetNodeId: '' } : t
          ),
        };
      }
      return n;
    });

    onUpdateFlow({ ...flow, nodes: updatedNodes });
  };

  // Quick Add Branch inside a Node
  const handleAddBranchToNode = (nodeId: string) => {
    const sourceNode = flow.nodes.find((n) => n.id === nodeId);
    if (!sourceNode) return;

    const newTransition: FlowTransition = {
      id: `t-${Date.now()}`,
      label: `Branch Condition #${sourceNode.transitions.length + 1}`,
      conditionText: 'Customer agrees or gives information',
      targetNodeId: '',
    };

    const updatedNodes = flow.nodes.map((n) =>
      n.id === nodeId ? { ...n, transitions: [...n.transitions, newTransition] } : n
    );

    onUpdateFlow({ ...flow, nodes: updatedNodes });
  };

  // Delete Branch from a Node
  const handleDeleteBranch = (nodeId: string, transitionId: string) => {
    const updatedNodes = flow.nodes.map((n) =>
      n.id === nodeId
        ? { ...n, transitions: n.transitions.filter((t) => t.id !== transitionId) }
        : n
    );
    onUpdateFlow({ ...flow, nodes: updatedNodes });
  };

  // Add a new Step Node
  const handleAddNode = (type: FlowNode['type'] = 'question') => {
    const newNodeId = `node-${Date.now()}`;
    const newNode: FlowNode = {
      id: newNodeId,
      type,
      title: `Step ${flow.nodes.length + 1}: Custom Step`,
      agentPrompt: 'Describe what the AI agent should say or ask in this step...',
      position: {
        x: Math.round((-pan.x + 350) / zoom),
        y: Math.round((-pan.y + 200) / zoom),
      },
      transitions: [],
    };

    onUpdateFlow({
      ...flow,
      nodes: [...flow.nodes, newNode],
    });
    setEditingNode(newNode);
  };

  // Delete a Node
  const handleDeleteNode = (nodeId: string) => {
    const updatedNodes = flow.nodes
      .filter((n) => n.id !== nodeId)
      .map((n) => ({
        ...n,
        transitions: n.transitions.filter((t) => t.targetNodeId !== nodeId),
      }));

    onUpdateFlow({
      ...flow,
      nodes: updatedNodes,
    });
  };

  // Save Node from Modal
  const handleSaveNode = (updatedNode: FlowNode) => {
    const updatedNodes = flow.nodes.map((n) => (n.id === updatedNode.id ? updatedNode : n));
    onUpdateFlow({ ...flow, nodes: updatedNodes });
    setEditingNode(null);
  };

  // Reset to default Real Estate flow
  const handleResetFlow = () => {
    localStorage.removeItem('apex_call_flow_graph');
    onUpdateFlow(DEFAULT_CALL_FLOW);
    setPan({ x: 50, y: 50 });
    setZoom(0.85);
    setTestActiveNodeId(DEFAULT_CALL_FLOW.initialNodeId);
  };

  // Save flow
  const handleManualSave = () => {
    localStorage.setItem('apex_call_flow_graph', JSON.stringify(flow));
    setSavedBadge(true);
    setTimeout(() => setSavedBadge(false), 2000);
  };

  // Create System Prompt from All Nodes
  const handleCreateSystemPromptFromNodes = () => {
    const compiledPrompt = compileFlowToSystemPrompt(flow);
    const updatedConfig: AgentConfig = {
      ...config,
      systemPrompt: compiledPrompt,
    };

    localStorage.setItem('apex_voice_config_v4', JSON.stringify(updatedConfig));
    if (onUpdateConfig) {
      onUpdateConfig(updatedConfig);
    }

    setPromptCreatedBadge(true);
    setTimeout(() => setPromptCreatedBadge(false), 2800);
  };

  // Highlight Traversed Wire when a branch condition is matched
  const handleHighlightEdge = (sourceId: string, targetId: string) => {
    const edgeKey = `${sourceId}-${targetId}`;
    setActiveTraversedEdgeKey(edgeKey);
    setTimeout(() => {
      setActiveTraversedEdgeKey(null);
    }, 2800);
  };

  const effectiveActiveNodeId = isTestDrawerOpen ? testActiveNodeId : activeNodeId;

  return (
    <div
      ref={canvasRef}
      onWheel={handleWheel}
      onMouseDown={handleCanvasMouseDown}
      className="relative w-full h-full bg-[#f8fafc] overflow-hidden select-none cursor-grab active:cursor-grabbing border border-slate-200 rounded-2xl shadow-xl font-['Plus_Jakarta_Sans',sans-serif]"
    >
      {/* Clean Dot Grid Background */}
      <div
        id="canvas-bg"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(148, 163, 184, 0.45) 1.2px, transparent 1.2px)`,
          backgroundSize: `${28 * zoom}px ${28 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />

      {/* Top Floating White SaaS Toolbar */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-white border border-slate-200/90 shadow-lg shadow-slate-900/5">
          {/* Live Voice Call Workflow Test Button */}
          <button
            onClick={() => setIsTestDrawerOpen(!isTestDrawerOpen)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs shadow-md transition active:scale-95 ${
              isTestDrawerOpen
                ? 'bg-emerald-600 text-white shadow-emerald-600/30 ring-2 ring-emerald-500/50 animate-pulse'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/20'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5 fill-white" />
            <span>{isTestDrawerOpen ? 'Close Voice Call' : 'Start Live Voice Call'}</span>
          </button>

          {/* Create System Prompt from All Nodes Button */}
          <button
            onClick={handleCreateSystemPromptFromNodes}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition active:scale-95 shadow-sm border ${
              promptCreatedBadge
                ? 'bg-purple-600 text-white border-purple-600 shadow-purple-600/30 ring-2 ring-purple-400'
                : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
            }`}
            title="Analyze all workflow nodes and generate a complete master system prompt"
          >
            <Wand2 className={`w-3.5 h-3.5 ${promptCreatedBadge ? 'text-white' : 'text-purple-600'}`} />
            <span>{promptCreatedBadge ? 'System Prompt Created!' : 'Create System Prompt from All Nodes'}</span>
          </button>

          <button
            onClick={() => handleAddNode('question')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 text-xs transition active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Node</span>
          </button>

          <button
            onClick={() => handleAddNode('objection')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Add Objection</span>
          </button>

          <button
            onClick={handleResetFlow}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition"
            title="Reset to default template"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Flow</span>
          </button>

          <button
            onClick={handleManualSave}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold transition shadow-sm"
          >
            {savedBadge ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Save className="w-3.5 h-3.5 text-emerald-600" />}
            <span>{savedBadge ? 'Saved!' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Top Right Live Step & Zoom Controls */}
      <div className={`absolute top-4 ${isTestDrawerOpen ? 'right-[436px]' : 'right-4'} z-30 flex items-center gap-2 transition-all duration-300`}>
        {effectiveActiveNodeId && (
          <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold shadow-md shadow-emerald-500/10">
            <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span>{isTestDrawerOpen ? 'In Call Node:' : 'Live Step:'} {flow.nodes.find((n) => n.id === effectiveActiveNodeId)?.title || effectiveActiveNodeId}</span>
          </div>
        )}

        <div className="flex items-center gap-1 p-1.5 rounded-2xl bg-white border border-slate-200 text-slate-700 shadow-md shadow-slate-900/5">
          <button
            onClick={() => setZoom((z) => Math.min(2.0, z * 1.15))}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-mono font-semibold px-1 text-slate-600">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.max(0.35, z / 1.15))}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setZoom(0.85);
              setPan({ x: 50, y: 50 });
            }}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition"
            title="Fit Canvas View"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Connection Drag Helper Banner */}
      {dragConnection && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 px-5 py-2.5 rounded-2xl bg-blue-600 text-white text-xs font-bold shadow-2xl flex items-center gap-2.5 animate-bounce">
          <GitBranch className="w-4 h-4" />
          <span>Release wire over the left port of any target node to connect!</span>
          <button
            onClick={() => setDragConnection(null)}
            className="ml-2 px-2 py-0.5 bg-blue-800 hover:bg-blue-900 rounded-lg text-[10px]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* SVG Canvas for Perfect Curved Bezier Branch Connection Wires */}
      <svg
        className="absolute inset-0 pointer-events-none w-full h-full z-10"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          overflow: 'visible',
        }}
      >
        <defs>
          <marker
            id="saas-arrowhead"
            markerWidth="12"
            markerHeight="8"
            refX="10"
            refY="4"
            orient="auto"
          >
            <polygon points="0 0, 12 4, 0 8" fill="#3b82f6" />
          </marker>
          <marker
            id="saas-arrowhead-active"
            markerWidth="12"
            markerHeight="8"
            refX="10"
            refY="4"
            orient="auto"
          >
            <polygon points="0 0, 12 4, 0 8" fill="#10b981" />
          </marker>
          <marker
            id="saas-arrowhead-traverse"
            markerWidth="14"
            markerHeight="10"
            refX="12"
            refY="5"
            orient="auto"
          >
            <polygon points="0 0, 14 5, 0 10" fill="#059669" />
          </marker>
        </defs>

        {/* Render Branch Condition Connection Wires (strictly from node.transitions) */}
        {flow.nodes.flatMap((sourceNode) =>
          sourceNode.transitions.map((trans, idx) => {
            if (!trans.targetNodeId) return null;
            const targetNode = flow.nodes.find((n) => n.id === trans.targetNodeId);
            if (!targetNode) return null;

            const wireKey = `${sourceNode.id}-${trans.id}-${targetNode.id}`;
            const sx = sourceNode.position.x + 320;
            const sy = sourceNode.position.y + 190 + (idx * 56) + 24;
            const tx = targetNode.position.x;
            const ty = targetNode.position.y + 114;

            const dx = Math.max(50, Math.abs(tx - sx) * 0.5);
            const pathData = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
            const midX = (sx + tx) / 2;
            const midY = (sy + ty) / 2;

            const isPathActive = sourceNode.id === effectiveActiveNodeId;
            const isTraversing = activeTraversedEdgeKey === `${sourceNode.id}-${targetNode.id}`;
            const isHovered = hoveredWireId === wireKey;

            return (
              <g
                key={wireKey}
                className="pointer-events-auto cursor-pointer"
                onMouseEnter={() => setHoveredWireId(wireKey)}
                onMouseLeave={() => setHoveredWireId(null)}
              >
                <path d={pathData} fill="none" stroke="transparent" strokeWidth="24" />
                {(isPathActive || isHovered || isTraversing) && (
                  <path
                    d={pathData}
                    fill="none"
                    stroke={isHovered ? '#f87171' : isTraversing ? '#10b981' : '#10b981'}
                    strokeWidth={isTraversing ? '8' : '7'}
                    strokeOpacity={isHovered ? 0.35 : isTraversing ? 0.6 : 0.25}
                    className={isTraversing ? 'animate-pulse' : undefined}
                  />
                )}
                <path
                  d={pathData}
                  fill="none"
                  stroke={isHovered ? '#ef4444' : isTraversing ? '#059669' : isPathActive ? '#10b981' : '#3b82f6'}
                  strokeWidth={isHovered || isTraversing ? '3.5' : '2.5'}
                  markerEnd={
                    isTraversing
                      ? 'url(#saas-arrowhead-traverse)'
                      : isPathActive
                      ? 'url(#saas-arrowhead-active)'
                      : 'url(#saas-arrowhead)'
                  }
                  opacity={isPathActive || isHovered || isTraversing ? 1 : 0.85}
                  strokeDasharray={isTraversing ? '6,4' : undefined}
                  className={isTraversing ? 'animate-dash-flow' : undefined}
                />
                <g
                  className="cursor-pointer group"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDisconnectBranch(sourceNode.id, trans.id);
                  }}
                >
                  <circle
                    cx={midX}
                    cy={midY}
                    r={isHovered ? 13 : 10}
                    fill={isHovered ? '#ef4444' : '#ffffff'}
                    stroke={isHovered ? '#ffffff' : '#94a3b8'}
                    strokeWidth={2}
                    className="transition-all shadow-md"
                  />
                  <text
                    x={midX}
                    y={midY + 4}
                    textAnchor="middle"
                    fill={isHovered ? '#ffffff' : '#64748b'}
                    fontSize={13}
                    fontWeight="bold"
                    className="select-none font-sans"
                  >
                    ×
                  </text>
                </g>
              </g>
            );
          })
        )}

        {/* Render Live Stretched Elastic Connection Wire while Dragging */}
        {dragConnection && (
          <g>
            <path
              d={`M ${dragConnection.startX} ${dragConnection.startY} C ${
                dragConnection.startX + Math.max(50, Math.abs(dragConnection.currentX - dragConnection.startX) * 0.5)
              } ${dragConnection.startY}, ${
                dragConnection.currentX - Math.max(50, Math.abs(dragConnection.currentX - dragConnection.startX) * 0.5)
              } ${dragConnection.currentY}, ${dragConnection.currentX} ${dragConnection.currentY}`}
              fill="none"
              stroke="#2563eb"
              strokeWidth="3.5"
              strokeDasharray="6,4"
              markerEnd="url(#saas-arrowhead)"
            />
          </g>
        )}
      </svg>

      {/* Nodes Container (Infinite Canvas Plane) */}
      <div
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          overflow: 'visible',
        }}
      >
        {flow.nodes.map((node) => (
          <div
            key={node.id}
            onMouseDown={(e) => handleNodeMouseDown(e, node)}
            style={{
              position: 'absolute',
              left: `${node.position.x}px`,
              top: `${node.position.y}px`,
            }}
            className="z-20 cursor-move pointer-events-auto"
          >
            <NodeCard
              node={node}
              isActive={node.id === effectiveActiveNodeId}
              isSelected={selectedNode?.id === node.id}
              onSelect={setSelectedNode}
              onEdit={setEditingNode}
              onDelete={handleDeleteNode}
              onAddBranch={handleAddBranchToNode}
              onDeleteBranch={handleDeleteBranch}
              onDisconnectBranch={handleDisconnectBranch}
              onStartConnectionDrag={handleStartConnectionDrag}
              onConnectToNode={handleConnectToNode}
              isConnecting={!!dragConnection}
            />
          </div>
        ))}
      </div>

      {/* Node Edit Modal */}
      <NodeEditModal
        isOpen={!!editingNode}
        node={editingNode}
        allNodes={flow.nodes}
        onClose={() => setEditingNode(null)}
        onSave={handleSaveNode}
      />

      {/* Full Live Voice Call Workflow Tester Panel */}
      <FlowTestSimulator
        isOpen={isTestDrawerOpen}
        flow={flow}
        activeTestNodeId={testActiveNodeId}
        onActiveNodeChange={setTestActiveNodeId}
        onHighlightEdge={handleHighlightEdge}
        onClose={() => setIsTestDrawerOpen(false)}
        config={config}
      />
    </div>
  );
};
