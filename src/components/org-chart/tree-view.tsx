"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, tree, HierarchyPointNode } from "d3-hierarchy";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Users } from "lucide-react";

export interface OrgEmployee {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
  managerId?: string | null;
  jobTitle?: string;
  department?: { id: string; name: string } | null;
  directReportsCount: number;
}

export const DEPT_COLORS: Record<string, { border: string; bg: string; dot: string; text: string }> = {
  Executive:    { border: "#ef4444", bg: "rgba(239,68,68,0.08)",  dot: "#ef4444", text: "#b91c1c" },
  Engineering:  { border: "#3b82f6", bg: "rgba(59,130,246,0.08)", dot: "#3b82f6", text: "#1d4ed8" },
  Education:    { border: "#8b5cf6", bg: "rgba(139,92,246,0.08)", dot: "#8b5cf6", text: "#6d28d9" },
  Partnerships: { border: "#f97316", bg: "rgba(249,115,22,0.08)", dot: "#f97316", text: "#c2410c" },
  Sales:        { border: "#22c55e", bg: "rgba(34,197,94,0.08)",  dot: "#22c55e", text: "#15803d" },
  HR:           { border: "#14b8a6", bg: "rgba(20,184,166,0.08)", dot: "#14b8a6", text: "#0f766e" },
  Finance:      { border: "#f59e0b", bg: "rgba(245,158,11,0.08)", dot: "#f59e0b", text: "#b45309" },
  Operations:   { border: "#06b6d4", bg: "rgba(6,182,212,0.08)",  dot: "#06b6d4", text: "#0e7490" },
  Product:      { border: "#a855f7", bg: "rgba(168,85,247,0.08)", dot: "#a855f7", text: "#7e22ce" },
  Design:       { border: "#ec4899", bg: "rgba(236,72,153,0.08)", dot: "#ec4899", text: "#be185d" },
  Marketing:    { border: "#fb7185", bg: "rgba(251,113,133,0.08)",dot: "#fb7185", text: "#be123c" },
};

export const DEFAULT_COLORS = { border: "#94a3b8", bg: "rgba(148,163,184,0.08)", dot: "#94a3b8", text: "#334155" };

// Color palette for group-leader subtrees. Each direct child of the root
// gets one color; all their descendants inherit it. This visually groups
// each GL's team in the org chart.
const GROUP_PALETTE: Array<{ border: string; bg: string; dot: string; text: string }> = [
  { border: "#3b82f6", bg: "rgba(59,130,246,0.08)",  dot: "#3b82f6", text: "#1d4ed8" },  // blue
  { border: "#8b5cf6", bg: "rgba(139,92,246,0.08)",  dot: "#8b5cf6", text: "#6d28d9" },  // violet
  { border: "#10b981", bg: "rgba(16,185,129,0.08)",  dot: "#10b981", text: "#047857" },  // emerald
  { border: "#f59e0b", bg: "rgba(245,158,11,0.08)",  dot: "#f59e0b", text: "#b45309" },  // amber
  { border: "#ef4444", bg: "rgba(239,68,68,0.08)",   dot: "#ef4444", text: "#b91c1c" },  // red
  { border: "#06b6d4", bg: "rgba(6,182,212,0.08)",   dot: "#06b6d4", text: "#0e7490" },  // cyan
  { border: "#ec4899", bg: "rgba(236,72,153,0.08)",  dot: "#ec4899", text: "#be185d" },  // pink
  { border: "#f97316", bg: "rgba(249,115,22,0.08)",  dot: "#f97316", text: "#c2410c" },  // orange
  { border: "#14b8a6", bg: "rgba(20,184,166,0.08)",  dot: "#14b8a6", text: "#0f766e" },  // teal
  { border: "#a855f7", bg: "rgba(168,85,247,0.08)",  dot: "#a855f7", text: "#7e22ce" },  // purple
];

const ROOT_COLORS = { border: "#6b7280", bg: "rgba(107,114,128,0.08)", dot: "#6b7280", text: "#374151" };

const CARD_WIDTH = 240;
const CARD_HEIGHT = 92;
const LEVEL_HEIGHT = 150;

interface TreeViewProps {
  rootId: string;
  employees: OrgEmployee[];
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  highlightedId?: string | null;
}

interface TreeNode {
  id: string;
  employee: OrgEmployee;
  children?: TreeNode[];
  hiddenChildCount: number;
}

function buildTree(
  rootId: string,
  byId: Map<string, OrgEmployee>,
  childrenByParent: Map<string, OrgEmployee[]>,
  expanded: Set<string>,
): TreeNode | null {
  const root = byId.get(rootId);
  if (!root) return null;
  // Track the set of ancestor IDs along the current walk so we never recurse
  // into a cycle (defensive — shouldn't happen in clean data).
  function walk(emp: OrgEmployee, ancestors: Set<string>): TreeNode {
    const kids = (childrenByParent.get(emp.id) ?? []).filter(k => !ancestors.has(k.id));
    const isExpanded = expanded.has(emp.id);
    const nextAncestors = new Set(ancestors); nextAncestors.add(emp.id);
    return {
      id: emp.id,
      employee: emp,
      children: isExpanded ? kids.map(k => walk(k, nextAncestors)) : undefined,
      hiddenChildCount: isExpanded ? 0 : kids.length,
    };
  }
  return walk(root, new Set());
}

export function TreeView({ rootId, employees, expandedIds, onToggleExpand, highlightedId }: TreeViewProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Pan + zoom state
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const { byId, childrenByParent } = useMemo(() => {
    const m = new Map<string, OrgEmployee>();
    const kids = new Map<string, OrgEmployee[]>();
    employees.forEach(e => m.set(e.id, e));
    employees.forEach(e => {
      if (e.managerId && m.has(e.managerId)) {
        if (!kids.has(e.managerId)) kids.set(e.managerId, []);
        kids.get(e.managerId)!.push(e);
      }
    });
    for (const arr of kids.values()) {
      arr.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    }
    return { byId: m, childrenByParent: kids };
  }, [employees]);

  const layout = useMemo(() => {
    try {
      const root = buildTree(rootId, byId, childrenByParent, expandedIds);
      if (!root) return null;
      const h = hierarchy<TreeNode>(root);
      const t = tree<TreeNode>()
        .nodeSize([CARD_WIDTH + 40, LEVEL_HEIGHT])
        .separation((a, b) => (a.parent === b.parent ? 1 : 1.3));
      const laid = t(h);
      // Flip the tree upside-down: negate all Y so the root (CEO) is at the
      // bottom and leaf employees are at the top.
      laid.each(n => { n.y = -n.y; });
      return laid;
    } catch (err) {
      console.error("Org chart layout error:", err);
      return null;
    }
  }, [rootId, byId, childrenByParent, expandedIds]);

  // Fit content in viewport on first render / when layout changes structurally.
  // Tree is flipped (root at bottom), so anchor the view so the root (CEO) is
  // visible near the bottom and leaves extend upward.
  useEffect(() => {
    if (!layout || !containerRef.current) return;
    const bbox = computeBBox(layout);
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;
    const padding = 60;
    const scaleX = (w - padding * 2) / (bbox.width || 1);
    const scaleY = (h - padding * 2) / (bbox.height || 1);
    const scale = Math.min(1, scaleX, scaleY, 1.2);
    setTransform({
      x: w / 2 - (bbox.x + bbox.width / 2) * scale,
      y: h - padding - (bbox.y + bbox.height) * scale,
      scale,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootId]);

  // Pan / zoom handlers
  const onWheel = (e: React.WheelEvent) => {
    const container = containerRef.current;
    if (!container) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const newScale = Math.min(2.5, Math.max(0.15, transform.scale * (1 + delta)));
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const ratio = newScale / transform.scale;
    setTransform({
      scale: newScale,
      x: cx - (cx - transform.x) * ratio,
      y: cy - (cy - transform.y) * ratio,
    });
  };
  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-card]")) return;
    panStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const start = panStart.current;
    if (!start) return;
    const nextX = start.tx + (e.clientX - start.x);
    const nextY = start.ty + (e.clientY - start.y);
    setTransform(t => ({ ...t, x: nextX, y: nextY }));
  };
  const onMouseUp = () => { panStart.current = null; };

  const resetView = useCallback(() => {
    if (!layout || !containerRef.current) return;
    const bbox = computeBBox(layout);
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;
    const scale = Math.min(1, (w - 120) / (bbox.width || 1), (h - 120) / (bbox.height || 1), 1.2);
    setTransform({
      x: w / 2 - (bbox.x + bbox.width / 2) * scale,
      y: h - 60 - (bbox.y + bbox.height) * scale,
      scale,
    });
  }, [layout]);

  // Compute per-node group color: each direct child of root gets a palette color,
  // all their descendants inherit it. Root itself gets a neutral color.
  const groupColorMap = useMemo(() => {
    const map = new Map<string, typeof ROOT_COLORS>();
    if (!layout) return map;
    map.set(layout.data.id, ROOT_COLORS);
    const rootChildren = layout.children ?? [];
    rootChildren.forEach((child, i) => {
      const color = GROUP_PALETTE[i % GROUP_PALETTE.length];
      function tag(node: typeof child) {
        map.set(node.data.id, color);
        (node.children ?? []).forEach(tag);
      }
      tag(child);
    });
    return map;
  }, [layout]);

  if (!layout) {
    return <div className="h-full flex items-center justify-center text-gray-400">No employees to display</div>;
  }

  const nodes = layout.descendants();
  const links = layout.links();

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing select-none"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <svg ref={svgRef} width="100%" height="100%" style={{ display: "block" }}>
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {/* Edges — orthogonal elbow with rounded corners, traditional org-chart style */}
          {links.map((link, i) => {
            const targetColor = groupColorMap.get(link.target.data.id);
            return (
              <path
                key={i}
                d={elbowPath(link.source, link.target)}
                fill="none"
                stroke={targetColor?.dot ?? "#94a3b8"}
                strokeOpacity={0.4}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
          {/* Nodes */}
          {nodes.map(node => (
            <foreignObject
              key={node.data.id}
              x={node.x - CARD_WIDTH / 2}
              y={node.y - CARD_HEIGHT / 2}
              width={CARD_WIDTH}
              height={CARD_HEIGHT + 26}
              style={{ overflow: "visible" }}
            >
              <EmployeeCard
                node={node.data}
                highlighted={highlightedId === node.data.id}
                onToggle={() => onToggleExpand(node.data.id)}
                onOpenProfile={() => router.push(`/people/${node.data.id}`)}
                isExpanded={expandedIds.has(node.data.id)}
                groupColors={groupColorMap.get(node.data.id)}
              />
            </foreignObject>
          ))}
        </g>
      </svg>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 bg-white/90 dark:bg-charcoal-900/90 backdrop-blur border border-gray-200 dark:border-charcoal-700 rounded-lg shadow-sm p-1">
        <button
          onClick={() => setTransform(t => ({ ...t, scale: Math.min(2.5, t.scale * 1.2) }))}
          className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-charcoal-800 rounded text-lg font-medium"
          title="Zoom in"
        >+</button>
        <button
          onClick={() => setTransform(t => ({ ...t, scale: Math.max(0.15, t.scale / 1.2) }))}
          className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-charcoal-800 rounded text-lg font-medium"
          title="Zoom out"
        >−</button>
        <button
          onClick={resetView}
          className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-charcoal-800 rounded text-xs font-medium"
          title="Fit to screen"
        >⤢</button>
      </div>
    </div>
  );
}

function EmployeeCard({
  node,
  highlighted,
  onToggle,
  onOpenProfile,
  isExpanded,
  groupColors,
}: {
  node: TreeNode;
  highlighted: boolean;
  onToggle: () => void;
  onOpenProfile: () => void;
  isExpanded: boolean;
  groupColors?: { border: string; bg: string; dot: string; text: string };
}) {
  const emp = node.employee;
  const name = `${emp.firstName} ${emp.lastName}`;
  const dept = emp.department?.name || "";
  const colors = groupColors || DEPT_COLORS[dept] || DEFAULT_COLORS;
  const initials = `${emp.firstName?.[0] || ""}${emp.lastName?.[0] || ""}`.toUpperCase();
  const hasChildren = emp.directReportsCount > 0;

  return (
    <div
      data-card
      className={`relative bg-white dark:bg-charcoal-900 rounded-xl border-2 shadow-sm transition-all ${
        highlighted ? "ring-4 ring-primary-300 scale-105" : ""
      }`}
      style={{ borderColor: colors.border, width: CARD_WIDTH, height: CARD_HEIGHT }}
    >
      {/* Accent strip — at bottom since tree is flipped */}
      <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-lg" style={{ backgroundColor: colors.border }} />

      <button
        onClick={onOpenProfile}
        className="w-full h-full px-3 pt-3 pb-2 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-charcoal-800/50 rounded-xl"
      >
        {/* Avatar */}
        {emp.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={emp.avatar} alt={name} className="w-11 h-11 rounded-full object-cover shrink-0 ring-2 ring-white dark:ring-charcoal-900" />
        ) : (
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ring-2 ring-white dark:ring-charcoal-900"
            style={{ backgroundColor: colors.bg, color: colors.text }}
          >
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate text-gray-900 dark:text-white">{name}</p>
          {emp.jobTitle && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{emp.jobTitle}</p>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            {dept && (
              <span
                className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                style={{ backgroundColor: colors.bg, color: colors.text }}
              >
                {dept}
              </span>
            )}
            {hasChildren && (
              <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                <Users size={9} /> {emp.directReportsCount}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Expand/collapse button — at top since tree is flipped (children are above) */}
      {hasChildren && (
        <button
          onClick={e => { e.stopPropagation(); onToggle(); }}
          className="absolute left-1/2 -translate-x-1/2 -top-3 w-6 h-6 rounded-full bg-white dark:bg-charcoal-800 border-2 flex items-center justify-center shadow-sm hover:scale-110 transition-transform z-10"
          style={{ borderColor: colors.border }}
          title={isExpanded ? "Collapse" : `Expand (${emp.directReportsCount})`}
        >
          {isExpanded ? (
            <ChevronDown size={14} style={{ color: colors.text }} className="rotate-180" />
          ) : (
            <ChevronRight size={14} style={{ color: colors.text }} className="-rotate-90" />
          )}
        </button>
      )}

      {node.hiddenChildCount > 0 && !isExpanded && (
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-7 text-[9px] text-gray-400 whitespace-nowrap"
          style={{ color: colors.text }}
        >
          {node.hiddenChildCount} direct report{node.hiddenChildCount !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

// Orthogonal elbow path with rounded corners — the traditional org-chart connector.
// Tree is flipped: parent (source) is BELOW child (target), so the path goes upward.
function elbowPath(source: HierarchyPointNode<TreeNode>, target: HierarchyPointNode<TreeNode>) {
  const sx = source.x;
  const sy = source.y - CARD_HEIGHT / 2; // top edge of parent (parent is below)
  const tx = target.x;
  const ty = target.y + CARD_HEIGHT / 2; // bottom edge of child (child is above)
  if (sx === tx) {
    return `M${sx},${sy} L${tx},${ty}`;
  }
  const midY = sy + (ty - sy) / 2;
  const r = Math.min(10, Math.abs(tx - sx) / 2, Math.abs(sy - ty) / 2);
  const dir = tx > sx ? 1 : -1;
  return [
    `M${sx},${sy}`,
    `L${sx},${midY + r}`,
    `Q${sx},${midY} ${sx + dir * r},${midY}`,
    `L${tx - dir * r},${midY}`,
    `Q${tx},${midY} ${tx},${midY - r}`,
    `L${tx},${ty}`,
  ].join(" ");
}

function computeBBox(root: HierarchyPointNode<TreeNode>) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  root.each(n => {
    minX = Math.min(minX, n.x - CARD_WIDTH / 2);
    maxX = Math.max(maxX, n.x + CARD_WIDTH / 2);
    minY = Math.min(minY, n.y - CARD_HEIGHT / 2);
    maxY = Math.max(maxY, n.y + CARD_HEIGHT / 2);
  });
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
