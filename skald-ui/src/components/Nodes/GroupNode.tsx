import React, { memo, useMemo } from 'react';
import { Handle, Position, NodeProps, useStore } from 'reactflow';

// This selector efficiently grabs the latest nodes and edges from the React Flow store.
// Using a selector is more performant than accessing the entire store object.
const allNodesAndEdgesSelector = (s) => ({
    nodes: s.nodes,
    edges: s.edges,
});

const groupNodeStyle: React.CSSProperties = {
    backgroundColor: 'rgba(45, 55, 72, 0.5)',
    border: '1px solid #718096',
    borderRadius: '8px',
    width: '100%',
    height: '100%',
    position: 'relative',
    color: 'white',
};

const groupNodeHeaderStyle: React.CSSProperties = {
    background: '#4A5568',
    padding: '8px',
    borderTopLeftRadius: '7px',
    borderTopRightRadius: '7px',
    fontWeight: 'bold',
};

const handleLabelStyle: React.CSSProperties = {
    position: 'absolute',
    top: '-8px',
    fontSize: '10px',
    color: '#A0AEC0',
    background: '#2D3748',
    padding: '1px 4px',
    borderRadius: '3px',
    whiteSpace: 'nowrap',
};

const leftHandleLabelStyle: React.CSSProperties = {
    ...handleLabelStyle,
    left: '18px',
};

const rightHandleLabelStyle: React.CSSProperties = {
    ...handleLabelStyle,
    right: '18px',
};

// Use a named export 'export const' instead of 'export default'
export const GroupNode: React.FC<NodeProps> = memo(({ id, data }) => {
    // We use the selector to get the latest nodes and edges from the store.
    // This ensures the component re-renders when connections change.
    const { nodes: allNodes, edges: allEdges } = useStore(allNodesAndEdgesSelector);

    // Memoize the calculation of child nodes to avoid re-computation on every render.
    // ADDED a fallback to an empty array `|| []` to prevent crash on initial render.
    const childNodeIds = useMemo(() => 
        (allNodes || []).filter(n => n.parentNode === id).map(n => n.id), 
    [allNodes, id]);

    // This is the core logic for "Intelligent I/O".
    // It inspects all edges to determine which should create a handle on the group.
    const { inputs, outputs } = useMemo(() => {
        const inputs = new Map();
        const outputs = new Map();

        // ADDED defensive checks. If nodes or edges aren't available yet, return empty handles.
        if (!allNodes || !allEdges) {
            return { inputs: [], outputs: [] };
        }

        allEdges.forEach(edge => {
            const isTargetInGroup = childNodeIds.includes(edge.target);
            const isSourceInGroup = childNodeIds.includes(edge.source);

            // An edge from outside to inside means we need an INPUT handle on the group.
            if (!isSourceInGroup && isTargetInGroup) {
                const targetNode = allNodes.find(n => n.id === edge.target);
                // Create a unique but stable ID for the handle.
                const handleId = `group-input-${edge.target}-${edge.targetHandle || 'default'}`;
                if (!inputs.has(handleId)) {
                    inputs.set(handleId, {
                        id: handleId,
                        label: `${targetNode?.data.label || targetNode?.type} -> ${edge.targetHandle || 'input'}`,
                    });
                }
            }
            
            // An edge from inside to outside means we need an OUTPUT handle on the group.
            if (isSourceInGroup && !isTargetInGroup) {
                const sourceNode = allNodes.find(n => n.id === edge.source);
                const handleId = `group-output-${edge.source}-${edge.sourceHandle || 'default'}`;
                if (!outputs.has(handleId)) {
                    outputs.set(handleId, {
                        id: handleId,
                        label: `${sourceNode?.data.label || sourceNode?.type} -> ${edge.sourceHandle || 'output'}`,
                    });
                }
            }
        });

        return { inputs: Array.from(inputs.values()), outputs: Array.from(outputs.values()) };
    }, [allEdges, childNodeIds, allNodes]);


    return (
        <div style={groupNodeStyle}>
            <div style={groupNodeHeaderStyle}>
                {data.label || 'Group'}
            </div>
            
            {/* Dynamically render input handles based on the calculated connections */}
            {inputs.map((input, index) => (
                <Handle
                    key={input.id}
                    type="target"
                    position={Position.Left}
                    id={input.id}
                    style={{ top: `${(index + 1) * 35 + 20}px`, background: '#4A5568', borderColor: '#A0AEC0' }}
                >
                   <div style={leftHandleLabelStyle}>{input.label}</div>
                </Handle>
            ))}

            {/* Dynamically render output handles */}
            {outputs.map((output, index) => (
                <Handle
                    key={output.id}
                    type="source"
                    position={Position.Right}
                    id={output.id}
                    style={{ top: `${(index + 1) * 35 + 20}px`, background: '#4A5568', borderColor: '#A0AEC0' }}
                >
                    <div style={rightHandleLabelStyle}>{output.label}</div>
                </Handle>
            ))}
        </div>
    );
});