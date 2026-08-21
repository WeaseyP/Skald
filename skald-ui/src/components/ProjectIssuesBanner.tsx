/*
================================================================================
| FILE: skald-ui/src/components/ProjectIssuesBanner.tsx                        |
|                                                                              |
| Where useProjectIssues' verdict is shown.                                     |
|                                                                              |
| SKB-009: a P-lock key can be fatal to codegen two ways — unresolvable (the     |
| node was renamed or deleted) or, since B5-4-followup, resolved but DEAD (the   |
| node is still there but its current bpmSync/fixedPitch configuration makes     |
| the targeted parameter unreachable) — and the only thing that ever checked      |
| either was codegen itself. A project could sit in that state indefinitely —     |
| autosaving, previewing, looking healthy — and announce it only as a failed     |
| Generate. Non-dismissible on purpose: a warning the user can wave away is a    |
| warning that goes stale, and this one is derived fresh from the document      |
| every render, so it disappears the moment the cause does.                      |
================================================================================
*/
import React from 'react';

const containerStyles = (blocksBuild: boolean): React.CSSProperties => ({
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 49,
    maxWidth: '48%',
    maxHeight: '40%',
    overflowY: 'auto',
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: '0.8em',
    color: '#fff',
    backgroundColor: blocksBuild ? 'rgba(178,45,45,0.95)' : 'rgba(178,120,25,0.95)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
});

export const ProjectIssuesBanner: React.FC<{ lines: string[]; blocksBuild: boolean }> = ({
    lines,
    blocksBuild,
}) => {
    if (lines.length === 0) return null;
    return (
        <div style={containerStyles(blocksBuild)} data-testid="project-issues-banner">
            <strong>
                {blocksBuild
                    ? 'Code generation will fail — a step override is broken (see below)'
                    : `${lines.length === 1 ? '1 sequencer problem' : `${lines.length} sequencer problems`}`}
            </strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {/* Index-keyed: two tracks sharing a name can produce the
                    same line, and React would then drop one of them. */}
                {lines.map((line, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{line}</li>
                ))}
            </ul>
        </div>
    );
};
