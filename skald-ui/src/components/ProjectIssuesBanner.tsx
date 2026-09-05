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
|                                                                              |
| SEVERITY carries the verdict: red when codegen will fail over a broken        |
| step override, amber when there is a problem that still builds. Nothing       |
| else earns a place here — a condition the app has already handled belongs     |
| in the auto-clearing load toast (useFileIO.ts), not in a banner the user      |
| cannot dismiss.                                                               |
================================================================================
*/
import React from 'react';
import { ProjectIssueSeverity } from '../hooks/nodeEditor/useProjectIssues';

const SEVERITY_COLOR: Record<ProjectIssueSeverity, string> = {
    error: 'rgba(178,45,45,0.95)',
    warning: 'rgba(178,120,25,0.95)',
    none: 'transparent', // unreachable: caller returns before rendering with no lines
};

const containerStyles = (severity: ProjectIssueSeverity): React.CSSProperties => ({
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
    backgroundColor: SEVERITY_COLOR[severity],
    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
});

const headline = (severity: ProjectIssueSeverity, lineCount: number): string => {
    if (severity === 'error') return 'Code generation will fail — see below';
    return lineCount === 1 ? '1 sequencer problem' : `${lineCount} sequencer problems`;
};

export const ProjectIssuesBanner: React.FC<{ lines: string[]; severity: ProjectIssueSeverity }> = ({
    lines,
    severity,
}) => {
    if (lines.length === 0) return null;
    return (
        <div style={containerStyles(severity)} data-testid="project-issues-banner">
            <strong>{headline(severity, lines.length)}</strong>
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
