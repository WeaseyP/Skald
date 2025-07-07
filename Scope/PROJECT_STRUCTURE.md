# Skald Project Structure

This document provides a detailed, recursive breakdown of the Skald project's directory and file structure.

```
C:/Users/ryanp/Documents/dev/skald-react/Skald/
├───.gitignore
├───README.md
├───skald-backend_snapshot.txt
├───examples/
│   ├───AmbientReverbPad.json
│   ├───BandPassFilterSweep.json
│   ├───BPM-SyncedArpeggiatorDelay.json
│   ├───ClassicDelayPuck.json
│   ├───ComplexDroneMachine.json
│   ├───DetunedUnisonLead.json
│   ├───FMBellTone.json
│   ├───FullPolyphonicPad.json
│   ├───GlideLead.json
│   ├───LFOFilterWobbleBass.json
│   ├───PercussiveHighPassNoiseHit.json
│   ├───PWMPad.json
│   ├───SawLead.json
│   ├───SineSubBass.json
│   └───skald-graph-1751635686788.json
├───Scope/
│   ├───bugreport.txt
│   ├───CONTRACT.md
│   ├───phase9.txt
│   ├───PLAN.md
│   └───PROJECT_STRUCTURE.md
├───skald-backend/
│   ├───build_and_test.bat
│   ├───build_codegen.bat
│   ├───graph.json
│   ├───main.odin
│   └───tester/
│       ├───test_harness.odin
│       └───generated_audio/
│           └───audio.odin
└───skald-ui/
    ├───.eslintrc.json
    ├───forge.config.ts
    ├───forge.env.d.ts
    ├───index.html
    ├───package-lock.json 
    ├───package.json
    ├───tsconfig.json
    ├───vite.main.config.ts
    ├───vite.preload.config.ts
    ├───vite.renderer.config.ts
    └───src/
        ├───app.tsx
        ├───index.css
        ├───main.ts
        ├───preload.ts
        ├───renderer.tsx
        ├───components/
        │   ├───CodePreviewPanel.tsx
        │   ├───InstrumentNode.tsx
        │   ├───NamePromptModal.tsx
        │   ├───ParameterPanel.tsx
        │   ├───Sidebar.tsx
        │   ├───controls/
        │   │   ├───AdsrEnvelopeEditor.tsx
        │   │   ├───BpmSyncControl.tsx
        │   │   ├───CustomSlider.tsx
        │   │   └───XYPad.tsx
        │   └───Nodes/
        │       ├───ADSRNode.tsx
        │       ├───DelayNode.tsx
        │       ├───DistortionNode.tsx
        │       ├───FilterNode.tsx
        │       ├───FMOperatorNode.tsx
        │       ├───GraphOutputNode.tsx
        │       ├───GroupNode.tsx
        │       ├───index.ts
        │       ├───LFONode.tsx
        │       ├───MixerNode.tsx
        │       ├───NoiseNode.tsx
        │       ├───OscillatorNode.tsx
        │       ├───PannerNode.tsx
        │       ├───ReverbNode.tsx
        │       ├───SampleHoldNode.tsx
        │       └───WavetableNode.tsx
        └───hooks/
            ├───beatSequencer/
            └───nodeEditor/
                ├───useAudioEngine.ts
                ├───useFileIO.ts
                └───useGraphState.ts
```