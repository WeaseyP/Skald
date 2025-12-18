# Skald-UI Codebase Analysis Report

## 1. Project Structure Mapping

```

## 2. Web Audio API Investigation

This section details the analysis of the Web Audio API implementation within the `skald-ui` codebase.

### Files and Components Related to Web Audio API

The core of the Web Audio API implementation is located in `skald-ui/src/hooks/nodeEditor/`. The key files are:

-   **`useAudioEngine.ts`**: The central hook that manages the `AudioContext` lifecycle, creates and destroys audio nodes, and handles connections between them based on the state of the React Flow graph.
-   **`audioNodeUtils.ts`**: Provides utility functions for connecting and disconnecting `AudioNode`s, including logic for handling connections to `AudioParam`s and custom `AudioWorkletNode`s.
-   **`instrument.ts`**: A class that represents a polyphonic instrument, which is composed of multiple `Voice` instances.
-   **`voice.ts`**: Represents a single monophonic voice within an instrument. It is responsible for building and managing its own internal audio graph.
-   **`audioNodeFactory/`**: A directory containing factory functions for creating the various types of `AudioNode`s used in the application (e.g., `createOscillatorNode.ts`, `createFilterNode.ts`).
-   **`audioWorklets/`**: Contains the `AudioWorkletProcessor` implementations for custom audio processing, such as `adsr.worklet.ts`.

### Audio Data Flow

The flow of audio data in the application is dynamic and determined by the graph created by the user in the UI. Here is a high-level overview of the audio data flow:

1.  **AudioContext Creation**: The `AudioContext` is created in `useAudioEngine.ts` when the user clicks the "Play" button.
2.  **Node Creation**: As the user adds nodes to the graph in the UI, the `useDeepCompareEffect` in `useAudioEngine.ts` detects these changes and uses the factory functions in `audioNodeFactory/` to create the corresponding `AudioNode`s.
3.  **Node Connection**: When the user connects nodes in the UI, the `useDeepCompareEffect` detects the new edges and calls the `connectNodes` function from `audioNodeUtils.ts` to establish the connections in the Web Audio API graph.
4.  **Instrument and Voice Handling**: If an `InstrumentNode` is added to the graph, an `Instrument` object is created. This `Instrument` object, in turn, creates multiple `Voice` objects to handle polyphony. Each `Voice` has its own internal subgraph of `AudioNode`s.
5.  **Audio Processing**: Audio signals originate from source nodes (e.g., `OscillatorNode`, `NoiseNode`), are processed by intermediate nodes (e.g., `FilterNode`, `DelayNode`), and are finally sent to an output node, which is connected to the `audioContext.destination`.
6.  **ADSR Envelope**: The `ADSRNode` and its corresponding `adsr.worklet.ts` are used to control the amplitude of the audio signal over time. The `trigger` and `release` methods in `voice.ts` control the ADSR envelope.

### Potential Issues and Errors

Based on the analysis of the codebase, here are the specific files and line numbers where nodes are likely not being set up correctly, along with the hypothesized nature of the errors:

1.  **Incomplete ADSR Envelope Implementation**
    -   **File**: `skald-ui/src/hooks/nodeEditor/voice.ts`
    -   **Line**: 65
    -   **Issue**: The `release` method in the `Voice` class is not fully implemented. It correctly captures the current gain value when release is triggered, but it then immediately schedules a linear ramp to zero. This doesn't account for the release time specified in the ADSR data, effectively making the release instantaneous.
    -   **Hypothesis**: This will cause notes to cut off abruptly when they are released, instead of fading out smoothly according to the release parameter of the ADSR envelope.

2.  **Incorrect PannerNode Initialization**
    -   **File**: `skald-ui/src/hooks/nodeEditor/audioNodeFactory/createPannerNode.ts`
    -   **Line**: 11
    -   **Issue**: The `StereoPannerNode` is created, but its `pan` AudioParam is never set. The initial value of `pan` is 0, which means the panner will have no effect on the audio signal.
    -   **Hypothesis**: The PannerNode will not perform any panning, and the audio signal will remain centered.

3.  **Fragile Node Connection Logic**
    -   **File**: `skald-ui/src/hooks/nodeEditor/audioNodeUtils.ts`
    -   **Lines**: 47-62
    -   **Issue**: The `connectNodes` function uses string matching on the `edge.targetHandle` to determine how to connect nodes. This is a fragile approach that can lead to silent failures if the handle names are changed in the UI components without updating this logic.
    -   **Hypothesis**: This could lead to situations where connections appear to be made in the UI but are not actually established in the Web Audio API graph, resulting in no audio being produced or processed as expected.

4.  **Complex and Error-Prone State Management**
    -   **File**: `skald-ui/src/hooks/nodeEditor/useAudioEngine.ts`
    -   **Lines**: 57-194
    -   **Issue**: The `useDeepCompareEffect` hook is overly complex and responsible for too many things (node creation, deletion, updates, edge connections, and disconnections). This makes the code difficult to understand and maintain, and increases the risk of bugs. For example, the disconnection logic has several special cases and error handling that might mask underlying issues.
    -   **Hypothesis**: This complexity could lead to a variety of hard-to-debug issues, such as memory leaks from nodes not being disconnected properly, or incorrect audio routing when the graph is modified.

## 3. Refactoring Candidate Identification

This section provides a prioritized list of files and components that are strong candidates for refactoring. The goal of these refactoring efforts would be to improve the overall quality of the codebase, making it more maintainable, robust, and easier to extend.

### Prioritized List of Refactoring Candidates

1.  **`useAudioEngine.ts` (Priority: High)**
    -   **Justification**: This hook is the most complex part of the application and violates the Single Responsibility Principle. It is responsible for managing the `AudioContext`, handling the entire lifecycle of audio nodes (creation, updates, deletion), and managing connections between them.
    -   **Recommendation**:
        -   Break down the `useDeepCompareEffect` into smaller, more focused hooks (e.g., `useNodeLifecycle`, `useEdgeConnections`).
        -   Encapsulate the logic for handling different node types into their respective classes or factory functions, rather than having special cases in the `useAudioEngine` hook.
        -   This will significantly improve readability, reduce the cognitive load required to understand the code, and make it easier to debug and add new features.

2.  **`audioNodeUtils.ts` (Priority: Medium)**
    -   **Justification**: The `connectNodes` and `disconnectNodes` functions rely on string-based matching of `targetHandle` names to connect to specific `AudioParam`s or `AudioWorkletNode`s. This is fragile and error-prone.
    -   **Recommendation**:
        -   Implement a more robust mechanism for identifying connection points on nodes. This could involve using a more structured data format for handles, or creating a more formal contract between the UI components and the audio engine.
        -   Refactoring this would make the connection logic more reliable and reduce the risk of silent failures.

3.  **`voice.ts` (Priority: Medium)**
    -   **Justification**: The `Voice` class has an incomplete implementation of the ADSR envelope's release phase. Additionally, the `buildSubgraph` method contains complex logic for creating and connecting the internal nodes of a voice.
    -   **Recommendation**:
        -   Complete the implementation of the `release` method to correctly handle the release time of the ADSR envelope.
        -   Refactor the `buildSubgraph` method to improve clarity and reduce its complexity. This could involve creating a separate `SubgraphBuilder` class or function.

4.  **`instrument.ts` (Priority: Low)**
    -   **Justification**: The `Instrument` class has a tight coupling with the `Voice` class and the React Flow data structure. This makes it less reusable and harder to test in isolation.
    -   **Recommendation**:
        -   Decouple the `Instrument` class from the React Flow data structure by passing in a cleaner, more abstract representation of the subgraph.
        -   This will improve the modularity of the code and make it easier to reuse the `Instrument` class in other contexts.

5.  **Node Components (`skald-ui/src/components/Nodes/*.tsx`) (Priority: Low)**
    -   **Justification**: Many of the node components contain their own state management logic, which is then passed up to the main graph state. This can lead to inconsistencies and make it harder to manage the overall state of the application.
    -   **Recommendation**:
        -   Centralize the state management for the audio graph, either by using a state management library like Zustand or by lifting the state up to a common ancestor component.
        -   This will simplify the node components, make the state management more predictable, and reduce the risk of bugs.
skald-ui/
├── forge.config.ts
├── forge.env.d.ts
├── index.html
├── package-lock.json
├── package.json
├── skald_codegen.exe
├── src/
│   ├── app.tsx
│   ├── components/
│   │   ├── CodePreviewPanel.tsx
│   │   ├── InstrumentNode.tsx
│   │   ├── NamePromptModal.tsx
│   │   ├── Nodes/
│   │   │   ├── ADSRNode.tsx
│   │   │   ├── DelayNode.tsx
│   │   │   ├── DistortionNode.tsx
│   │   │   ├── FMOperatorNode.tsx
│   │   │   ├── FilterNode.tsx
│   │   │   ├── GraphOutputNode.tsx
│   │   │   ├── GroupNode.tsx
│   │   │   ├── LFONode.tsx
│   │   │   ├── MixerNode.tsx
│   │   │   ├── NoiseNode.tsx
│   │   │   ├── OscillatorNode.tsx
│   │   │   ├── PannerNode.tsx
│   │   │   ├── ReverbNode.tsx
│   │   │   ├── SampleHoldNode.tsx
│   │   │   ├── WavetableNode.tsx
│   │   │   └── index.ts
│   │   ├── ParameterPanel.tsx
│   │   ├── Sidebar.tsx
│   │   └── controls/
│   │       ├── AdsrEnvelopeEditor.tsx
│   │       ├── BpmSyncControl.tsx
│   │       ├── CustomSlider.tsx
│   │       └── XYPad.tsx
│   ├── hooks/
│   │   └── nodeEditor/
│   │       ├── audioNodeFactory/
│   │       │   ├── BaseSkaldNode.ts
│   │       │   ├── createAdsrNode.ts
│   │       │   ├── createDefaultNode.ts
│   │       │   ├── createDelayNode.ts
│   │       │   ├── createDistortionNode.ts
│   │       │   ├── createFilterNode.ts
│   │       │   ├── createFmOperatorNode.ts
│   │       │   ├── createInstrumentInputNode.ts
│   │       │   ├── createInstrumentOutputNode.ts
│   │       │   ├── createLfoNode.ts
│   │       │   ├── createMixerNode.ts
│   │       │   ├── createNoiseNode.ts
│   │       │   ├── createOscillatorNode.ts
│   │       │   ├── createOutputNode.ts
│   │       │   ├── createPannerNode.ts
│   │       │   ├── createReverbNode.ts
│   │       │   ├── createSampleHoldNode.ts
│   │       │   ├── createWavetableNode.ts
│   │       │   └── index.ts
│   │       ├── audioNodeUtils.ts
│   │       ├── audioWorklets/
│   │       │   ├── adsr.worklet.ts
│   │       │   ├── sampleHold.worklet.ts
│   │       │   └── wavetable.worklet.ts
│   │       ├── instrument.ts
│   │       ├── types.ts
│   │       ├── useAudioEngine.ts
│   │       ├── useFileIO.ts
│   │       ├── useGraphState.ts
│   │       ├── useSequencer.ts
│   │       └── voice.ts
│   ├── index.css
│   ├── main.ts
│   ├── preload.ts
│   └── renderer.tsx
├── src_snapshot.txt
├── tsconfig.json
├── vite.main.config.ts
├── vite.preload.config.ts
└── vite.renderer.config.ts
```