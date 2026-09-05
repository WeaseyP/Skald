/*
================================================================================
| FILE: skald-ui/src/hooks/useGraphKeyboardTraversal.ts                        |
|                                                                              |
| Patching without a mouse (roadmap E10, §9.22 item 1).                        |
|                                                                              |
| `[` and `]` walked the nodes, and that was the whole of it: selecting a node |
| said nothing about its ports, and there was no keyboard path to a wire at    |
| all. Everything past that point — which is most of what the editor is for —  |
| needed a pointing device.                                                    |
================================================================================
*/
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Connection } from '@xyflow/react';
import { isTypingTarget } from '../utils/keyboardTarget';

export type PortType = 'source' | 'target';

export interface PortRef {
    nodeId: string;
    /** React Flow allows an unnamed handle; codegen-bearing nodes always name theirs. */
    handleId: string | null;
    type: PortType;
}

/**
 * Step to the previous / next port of the selected node. Deliberately not Tab:
 * React Flow already owns Tab (it makes NODES focusable, `nodesFocusable`) and
 * owns the arrow keys (they nudge the selected node's position), so a port
 * walker bound to either would be fighting the library for the same keystroke.
 * `,` and `.` sit next to each other the way `[` and `]` do, and mean the same
 * thing one level further in.
 */
export const PORT_PREV_KEY = ',';
export const PORT_NEXT_KEY = '.';

/**
 * The focus ring and the in-flight wire are marked on React Flow's own handle
 * elements (index.css styles both attributes) rather than drawn as an overlay,
 * so the highlight is always exactly where the port is however the canvas is
 * panned or zoomed.
 */
export const PORT_FOCUS_ATTR = 'data-skald-port-focus';
export const PORT_PENDING_ATTR = 'data-skald-port-pending';

const handleSelector = (nodeId: string) => {
    // CSS.escape is the difference between a node id being data and being
    // selector syntax; jsdom and every target browser have it, but the manual
    // fallback keeps a malformed id from throwing inside a keydown handler.
    const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(nodeId)
        : nodeId.replace(/["\\]/g, '\\$&');
    return `.react-flow__handle[data-nodeid="${escaped}"]`;
};

/**
 * Every port of one node, in the order its card draws them (inputs down the
 * left, then outputs down the right, for anything built by `makeParamNode`).
 *
 * Read from the rendered DOM on purpose. Only the node components know which
 * ports they have — `node-definitions.ts` carries `inputs`/`outputs` for
 * exactly one node type — so a manifest here would be a second reader of a
 * fact the JSX owns, and would go stale the first time a node gained a
 * modulation input. `<Handle>` stamps `data-nodeid`, `data-handleid` and a
 * `source`/`target` class on each port, which is the same information React
 * Flow's own hit-testing uses.
 */
export const portsOfNode = (nodeId: string, root: ParentNode = document): PortRef[] =>
    Array.from(root.querySelectorAll<HTMLElement>(handleSelector(nodeId))).map(element => ({
        nodeId,
        handleId: element.getAttribute('data-handleid'),
        type: element.classList.contains('target') ? 'target' : 'source',
    }));

const elementForPort = (port: PortRef, root: ParentNode = document): HTMLElement | null =>
    root.querySelector<HTMLElement>(
        `${handleSelector(port.nodeId)}[data-handleid="${port.handleId ?? ''}"]`,
    );

const samePort = (a: PortRef | null, b: PortRef | null) =>
    !!a && !!b && a.nodeId === b.nodeId && a.handleId === b.handleId && a.type === b.type;

export interface GraphKeyboardTraversalOptions {
    /** The single selected node, whose ports the walker steps through. */
    selectedNodeId: string | null;
    /**
     * The editor's own connect handler — the same one React Flow calls after a
     * mouse drag. Routing through it is what makes a keyboard-drawn wire an
     * ordinary edge: one `pushHistory('Connect wire')` entry, the same
     * self-loop rejection, the same handle-bearing edge id.
     */
    onConnect: (connection: Connection) => void;
}

export interface GraphKeyboardTraversalState {
    focusedPort: PortRef | null;
    /** The output a wire is being drawn from, once Enter has anchored it. */
    pendingSource: PortRef | null;
}

export const useGraphKeyboardTraversal = ({
    selectedNodeId,
    onConnect,
}: GraphKeyboardTraversalOptions): GraphKeyboardTraversalState => {
    const [focusedPort, setFocusedPort] = useState<PortRef | null>(null);
    const [pendingSource, setPendingSource] = useState<PortRef | null>(null);

    const latest = useRef({ selectedNodeId, onConnect, focusedPort, pendingSource });
    latest.current = { selectedNodeId, onConnect, focusedPort, pendingSource };

    const step = useCallback((delta: number) => {
        const { selectedNodeId: nodeId, focusedPort: current } = latest.current;
        if (!nodeId) return;
        const ports = portsOfNode(nodeId);
        if (ports.length === 0) return;

        const index = current ? ports.findIndex(p => samePort(p, current)) : -1;
        // Entering the node from nowhere lands on the first port going forward
        // and the last going back, so `,` reaches an output — which is where a
        // wire starts — without walking past every modulation input first.
        const next = index === -1
            ? (delta > 0 ? 0 : ports.length - 1)
            : (index + delta + ports.length) % ports.length;
        setFocusedPort(ports[next]);
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (isTypingTarget(e.target)) return;

            // Captured at the window rather than bubbled to it. React Flow's
            // node wrapper answers Enter, Space and Escape itself (they toggle
            // and clear node selection), so a node that happens to hold DOM
            // focus would deselect itself out from under a half-drawn wire.
            // Stopping propagation only for keys actually consumed here leaves
            // every other handler — including that one — alone.
            const consume = () => { e.preventDefault(); e.stopPropagation(); };

            if (e.key === PORT_NEXT_KEY || e.key === PORT_PREV_KEY) {
                if (!latest.current.selectedNodeId) return;
                consume();
                step(e.key === PORT_NEXT_KEY ? 1 : -1);
                return;
            }

            if (e.key === 'Escape') {
                // One Escape gives up the wire, a second gives up the port. An
                // Escape that did both would leave a keyboard user who mis-hit
                // it re-walking the ports from the top.
                if (latest.current.pendingSource) {
                    consume();
                    setPendingSource(null);
                } else if (latest.current.focusedPort) {
                    consume();
                    setFocusedPort(null);
                }
                return;
            }

            if (e.key !== 'Enter') return;

            const { focusedPort: port, pendingSource: pending } = latest.current;
            if (!port) return;

            if (!pending) {
                // Wires are drawn output-to-input, matching React Flow's
                // default strict connection mode: an input is where a wire
                // lands, never where it starts.
                if (port.type !== 'source') return;
                consume();
                setPendingSource(port);
                return;
            }

            if (port.type !== 'target') return;
            consume();
            // The anchored output may have been deleted while the wire was in
            // flight; connecting to a node that is no longer on the canvas
            // would put an edge into the document with nothing at one end.
            if (!elementForPort(pending)) {
                setPendingSource(null);
                return;
            }
            latest.current.onConnect({
                source: pending.nodeId,
                sourceHandle: pending.handleId,
                target: port.nodeId,
                targetHandle: port.handleId,
            });
            setPendingSource(null);
        };

        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [step]);

    // A selection change means a different node's ports; keeping the old focus
    // would leave the ring sitting on a node the walker is no longer walking.
    // The pending wire deliberately survives — moving to the target node is the
    // whole middle of the gesture.
    useEffect(() => {
        setFocusedPort(null);
    }, [selectedNodeId]);

    useEffect(() => {
        // Cleared by query rather than by remembering which element was marked:
        // React Flow re-creates handle elements as nodes mount and unmount, and
        // a stale reference would strand the ring on a detached node.
        for (const attr of [PORT_FOCUS_ATTR, PORT_PENDING_ATTR]) {
            document.querySelectorAll(`[${attr}]`).forEach(el => el.removeAttribute(attr));
        }
        if (focusedPort) elementForPort(focusedPort)?.setAttribute(PORT_FOCUS_ATTR, 'true');
        if (pendingSource) elementForPort(pendingSource)?.setAttribute(PORT_PENDING_ATTR, 'true');
    });

    return { focusedPort, pendingSource };
};
