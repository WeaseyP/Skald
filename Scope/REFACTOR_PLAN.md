# Skald Frontend Refactor and Audit Plan

This document outlines a comprehensive plan to audit, refactor, and improve the Skald frontend application. The plan is divided into three sections:
1.  **Inconsistencies and Bug Fixes:** A list of discrepancies between the UI, the audio engine, and the `SCOPE/CONTRACT.md`.
2.  **Refactoring Plan:** A high-level strategy for improving the codebase's architecture and maintainability.
3.  **Actionable Task List:** A checklist of discrete tasks for implementing this plan.

---

## 1. Inconsistencies and Bug Fixes

This section details mismatches found during the codebase audit. The `SCOPE/CONTRACT.md` should be updated to become the source of truth.

### 1.1. General Naming Conventions

-   **Issue:** Node type names are inconsistent across the project. Examples include `adsr` (UI), `sample-hold` (node factory), `SampleHold` (contract), `fmOperator` (UI & factory), and `FMOperator` (contract).
-   **Proposal:** Standardize all node type identifiers to `PascalCase` as defined in `CONTRACT.md` (e.g., `Oscillator`, `SampleHold`, `FmOperator`). This convention should be applied globally across the frontend codebase, including in UI component logic, the `nodeCreationMap`, and any other type-string comparisons.

### 1.2. `ParameterPanel.tsx` Discrepancies

-   **ADSR Node:**
    -   **Issue:** The UI panel includes a `velocitySensitivity` control which is not defined in `CONTRACT.md`.
    -   **Proposal:** The `velocitySensitivity` parameter should be officially added to the `ADSR` node's definition in `CONTRACT.md`, as it is a valuable feature for musical expression.
-   **Wavetable Node:**
    -   **Issue:** The UI panel includes a `position` control for wavetable scanning, which is not defined in `CONTRACT.md`.
    -   **Proposal:** Add the `position` parameter (number, `0.0` to `1.0`) to the `Wavetable` node's definition in `CONTRACT.md`.

### 1.3. Audio Engine Discrepancies

-   **`nodeCreationMap` Mismatches:**
    -   **Issue:** The map's keys (`sample-hold`, `fmOperator`) do not align with the proposed `PascalCase` naming convention.
    -   **Proposal:** Refactor the keys in `skald-ui/src/hooks/nodeEditor/audioNodeFactory/index.ts` to match the standardized `PascalCase` names.
-   **Missing/Mismatched Node Implementations:**
    -   **Issue:** `CONTRACT.md` defines `GraphInput` and `GraphOutput`, but the factory implements `InstrumentInput` and `InstrumentOutput`. This creates confusion.
    -   **Proposal:**
        -   Rename `createInstrumentInputNode.ts` to `createGraphInputNode.ts`.
        -   Rename `createInstrumentOutputNode.ts` to `createGraphOutputNode.ts`.
        -   Update the `nodeCreationMap` keys from `InstrumentInput` and `InstrumentOutput` to `GraphInput` and `GraphOutput` respectively, aligning with the contract.
-   **Ambiguous `output` Node:**
    -   **Issue:** The factory contains a generic `createOutputNode`, which is not specified in the contract and whose role is unclear.
    -   **Proposal:** Remove the generic `output` node type. The final output of the main graph should be handled by connecting nodes directly to the `audioContext.destination`, not via a special node.
-   **Missing `Instrument` in Factory:**
    -   **Issue:** The `Instrument` node is handled as a special case in `useAudioEngine.ts` and is absent from the `nodeCreationMap`.
    -   **Proposal:** For consistency, create a `createInstrumentNode.ts` file. This creator function will encapsulate the `new Instrument(...)` logic and be added to the `nodeCreationMap` under the `Instrument` key.

### 1.4. Potential Bug: BPM Sync Propagation

-   **Issue:** In `useAudioEngine.ts`, BPM updates are explicitly passed to `Instrument` subgraphs. However, it is not clear if standalone nodes with `bpmSync` enabled (e.g., `LFO`, `Delay`) correctly receive and react to BPM changes.
-   **Proposal:** Investigate the `skaldNode.update()` method for all syncable nodes. Ensure it correctly recalculates rates/times when the global BPM changes and passes this information down.

---

## 2. Refactoring Plan

This section outlines architectural improvements to enhance code quality and maintainability.

### 2.1. Refactoring `ParameterPanel.tsx`

-   **Problem:** A single, monolithic `switch` statement manages the UI for all node types. This makes the component difficult to read, modify, and extend without increasing its complexity.
-   **Proposed Solution:**
    1.  **Component-Driven UI:** Create a dedicated React component for each node type's parameter editor (e.g., `AdsrPanel.tsx`, `FilterPanel.tsx`, `LfoPanel.tsx`). Each component will manage its own state and call a generic `onUpdateNode` prop.
    2.  **Dynamic Component Mapping:** In `ParameterPanel.tsx`, replace the `switch` statement with a component map: `const ParameterPanelMap = { Adsr: AdsrPanel, Filter: FilterPanel, ... }`.
    3.  **Dynamic Rendering:** Use the map to dynamically render the correct parameter panel based on the `selectedNode.type`: `const PanelComponent = ParameterPanelMap[selectedNode.type];`.

### 2.2. Simplifying `useAudioEngine.ts`

-   **Problem:** The main `useDeepCompareEffect` hook is overly complex, handling all node and edge lifecycle events in one place. The edge connection logic is brittle, relying on string comparisons of constructor names, which is not scalable or robust.
-   **Proposed Solution:**
    1.  **Decompose the Monolith:** Break down the `useDeepCompareEffect` into smaller, more focused functions called from within the hook (e.g., `handleNodeChanges(prevNodes, currentNodes)`, `handleEdgeChanges(prevEdges, currentEdges)`).
    2.  **Introduce a `SkaldNode` Interface:**
        -   Define a TypeScript `interface SkaldNode` that all audio node wrappers (including the `Instrument` class) will implement.
        -   This interface will standardize the API for all nodes, including methods like:
            -   `update(data: any, bpm: number): void`
            -   `connectInput(portName: string, sourceNode: AudioNode, sourcePortName: string): void`
            -   `disconnectInput(portName: string): void`
            -   `getOutput(portName: string): AudioNode`
            -   `getAudioNode(): AudioNode`
    3.  **Refactor Edge Handling:**
        -   Rewrite the edge connection logic to use the new `SkaldNode` interface. The new logic will be a simple, universal call:
            ```typescript
            const sourceNode = audioNodes.get(edge.source);
            const targetNode = audioNodes.get(edge.target);
            if (sourceNode && targetNode) {
                const sourceOutput = sourceNode.getOutput(edge.sourceHandle);
                targetNode.connectInput(edge.targetHandle, sourceOutput, edge.sourceHandle);
            }
            ```
        -   This eliminates all special `if/else` cases for Mixer, FMOperator, etc., as that connection logic will be encapsulated within each node's own `connectInput` method.
    4.  **Unify `audioNodes` Map:** The `audioNodes` map should be typed as `Map<string, SkaldNode>`, ensuring all stored instances conform to the standard interface. This removes the need for `instanceof Instrument` checks in the connection logic.

---

## 3. Actionable Task List

-   [ ] **Standardization:** Standardize all node type strings to `PascalCase` across the entire frontend.
-   [ ] **Contract Update:** Update `SCOPE/CONTRACT.md` to add `ADSR.velocitySensitivity` and `Wavetable.position`.
-   [ ] **Refactor `ParameterPanel.tsx`:** Replace the `switch` statement with a dynamic component map.
-   [ ] **Componentization:** Create individual parameter panel components (e.g., `AdsrPanel.tsx`, `FilterPanel.tsx`).
-   [ ] **Node Interface:** Define a unified `SkaldNode` TypeScript interface for all audio processing nodes.
-   [ ] **Refactor `useAudioEngine.ts`:** Decompose the main effect hook into smaller, focused functions.
-   [ ] **Node Implementation:** Refactor all audio node wrappers (`create...Node.ts`, `instrument.ts`) to implement the `SkaldNode` interface.
-   [ ] **Edge Logic:** Rewrite the edge connection logic in `useAudioEngine.ts` to use the new `SkaldNode` interface methods.
-   [ ] **BPM Bugfix:** Verify and fix BPM propagation for standalone syncable nodes (`LFO`, `Delay`).
-   [ ] **Node Factory Cleanup:** Rename and consolidate `InstrumentInput`/`InstrumentOutput`/`output` nodes to `GraphInput`/`GraphOutput` to align with the contract, and remove the generic `output` node.

---

## 4. Additional Findings from Broader Review

This section details further opportunities for improvement discovered after a wider review of the `components` and `hooks` directories.

### 4.1. Centralize Node Definitions

-   **Issue:** The definitions for new nodes, including their default parameters and UI labels, are scattered across multiple files:
    1.  `useGraphState.ts`: A large `switch` statement in the `onDrop` handler defines default data for new nodes.
    2.  `Sidebar.tsx`: The list of draggable nodes is hardcoded in the JSX, with hardcoded display names and type strings.
    3.  `ParameterPanel.tsx`: Uses `??` optional chaining to provide default values for rendering controls if they don't exist in the node's data.
-   **Proposal:** Create a single source of truth for node definitions.
    -   Create a new file, e.g., `skald-ui/src/node-definitions.ts`.
    -   This file will export a configuration array or object that, for each node type, defines:
        -   `type`: The standardized `PascalCase` type string.
        -   `label`: The display name for the UI (e.g., "S & H" for `SampleHold`).
        -   `defaults`: An object containing all default parameter values.
    -   Refactor `useGraphState.ts` and `Sidebar.tsx` to consume this configuration, dynamically generating the node list and using the default data when creating new nodes. This eliminates redundancy and makes adding/modifying nodes much simpler.

### 4.2. Decompose `useGraphState.ts`

-   **Issue:** This hook is a monolith responsible for graph state, node creation, selection, undo/redo, and complex grouping/instrumentation logic.
-   **Proposal:**
    -   **Extract Grouping Logic:** Move the `handleCreateInstrument`, `handleInstrumentNameSubmit`, and `handleCreateGroup` functions into a new, dedicated hook (e.g., `useNodeGrouping.ts`). This hook would take the `nodes` and `edges` as input and return the handler functions.
    -   **Encapsulate ID Generation:** The global `getId` counter is a code smell. This counter should be moved inside the `useGraphState` hook, potentially as a `useRef`, to properly encapsulate the hook's state and dependencies.

### 4.3. Update Actionable Task List

The main task list should be updated to include these new items:

-   [ ] **Centralize Node Definitions:** Create a single configuration file for all node types and their default values.
-   [ ] **Refactor `Sidebar.tsx`:** Dynamically generate the draggable node list from the central configuration.
-   [ ] **Refactor `useGraphState.ts`:**
    -   Use the central node definition configuration for creating new nodes.
    -   Extract grouping and instrument creation logic into a separate `useNodeGrouping.ts` hook.
    -   Encapsulate the `getId` counter within the hook to remove the global variable.
