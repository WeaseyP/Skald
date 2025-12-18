# Skald-UI Refactoring Plan

This document outlines a strategic plan for refactoring the `skald-ui` codebase. The plan is based on the analysis provided in `ANALYSIS_REPORT.md` and is prioritized to address the most critical areas of technical debt first.

## Prioritized Refactoring Tasks

The following is a prioritized list of refactoring tasks. The order is chosen to maximize impact, unblock subsequent work, and group related changes together.

1.  **`useAudioEngine.ts` Decomposition** (High Priority)
2.  **Robust Connection Logic** (Medium Priority)
3.  **ADSR Envelope and Voice Logic** (Medium Priority)
4.  **Decouple Instrument from React Flow** (Low Priority)
5.  **Centralize Node State Management** (Low Priority)

---

## Detailed Task Breakdown

Here are the detailed definitions for the top-priority refactoring tasks.

### 1. `useAudioEngine.ts` Decomposition

*   **Goal:** Decompose the monolithic `useAudioEngine` hook into smaller, more focused hooks. The primary goal is to separate the concerns of audio node lifecycle management (creation, updates, deletion) from the logic of managing connections between those nodes. This will improve readability, testability, and maintainability.
*   **Files to be Modified:**
    *   `skald-ui/src/hooks/nodeEditor/useAudioEngine.ts`
*   **Files to be Created:**
    *   `skald-ui/src/hooks/nodeEditor/useNodeLifecycle.ts`: This hook will be responsible for creating, updating, and deleting audio nodes based on changes to the React Flow nodes state.
    *   `skald-ui/src/hooks/nodeEditor/useEdgeConnections.ts`: This hook will manage connecting and disconnecting audio nodes based on changes to the React Flow edges state.
*   **Definition of Done:**
    *   The large `useDeepCompareEffect` within `useAudioEngine.ts` is removed, and its logic is delegated to the new `useNodeLifecycle` and `useEdgeConnections` hooks.
    *   `useAudioEngine.ts` is simplified to primarily manage the `AudioContext` and orchestrate the other hooks.
    *   The application's audio processing functionality remains unchanged and all existing features work as expected.

### 2. Robust Connection Logic in `audioNodeUtils.ts`

*   **Goal:** Refactor the node connection logic to be more robust and less reliant on fragile string matching of handle IDs. This will prevent silent failures when UI components are changed and make the connection logic more explicit and reliable.
*   **Files to be Modified:**
    *   `skald-ui/src/hooks/nodeEditor/audioNodeUtils.ts`
    *   All node components in `skald-ui/src/components/Nodes/*.tsx` that have multiple input/output handles.
*   **Files to be Created:**
    *   None.
*   **Definition of Done:**
    *   The `connectNodes` function in `audioNodeUtils.ts` no longer uses string parsing on `edge.targetHandle` to determine the connection point (e.g., an `AudioParam`).
    *   A more structured format for handle IDs is adopted. For example, `param:pan` or a JSON stringified object, which can be easily parsed.
    *   The node components are updated to use this new handle ID format.
    *   Connections in the audio graph are established reliably, and the system is less prone to errors from UI changes.

### 3. ADSR Envelope and `voice.ts` Logic

*   **Goal:** Correct the ADSR envelope's release phase implementation and improve the clarity of the `voice.ts` internal subgraph construction.
*   **Files to be Modified:**
    *   `skald-ui/src/hooks/nodeEditor/voice.ts`
*   **Files to be Created:**
    *   (Optional) `skald-ui/src/hooks/nodeEditor/SubgraphBuilder.ts` if the `buildSubgraph` logic proves complex enough to warrant its own module.
*   **Definition of Done:**
    *   The `release` method in the `Voice` class correctly implements the release ramp of the ADSR envelope, respecting the `release` time parameter. Notes fade out smoothly as expected.
    *   The `buildSubgraph` method in `voice.ts` is refactored to be more readable and maintainable, potentially by breaking it into smaller functions or extracting it into a separate builder module.
    *   The polyphonic instrument functionality remains correct.