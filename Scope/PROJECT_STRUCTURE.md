# Skald Project Structure

This document provides a detailed, recursive breakdown of the Skald project's directory and file structure.

```
.
├── .gitignore
├── README.md
├── Scope/
│   ├── CONTRACT.md
│   ├── PLAN.md
│   ├── PROJECT_STRUCTURE.md
│   ├── TASK_BOARD.md
├── examples/
│   ├── Acoustic & Electric DrumsFile/
│   │   ├── Cowbell.json
│   │   ├── CyberCymbal.json
│   │   ├── HiHat.json
│   │   ├── KickDrum.json
│   │   └── SnareDrum.json
│   ├── Cosmic/
│   │   ├── AlienChatter.json
│   │   ├── BlackHoleDrone.json
│   │   ├── PulsarBeam.json
│   │   └── WarpDrive.json
│   ├── Piano and Keys/
│   │   ├── MellowElectricPiano.json
│   │   └── PianoChord.json
│   ├── Synth Sound Effects/
│   │   ├── Alarm.json
│   │   ├── AlarmPulse.json
│   │   ├── LaserPew.json
│   │   └── PowerUp.json
│   ├── bug_testing/
│   │   ├── Crash.json
│   │   └── FM_OPERATOR.json
│   └── misc/
│       ├── AmbientReverbPad.json
│       ├── BPM-SyncedArpeggiatorDelay.json
│       ├── BandPassFilterSweep.json
│       ├── ClassicDelayPuck.json
│       ├── ComplexDroneMachine.json
│       ├── DetunedUnisonLead.json
│       ├── FMBellTone.json
│       ├── FullPolyphonicPad.json
│       ├── GlideLead.json
│       ├── LFOFilterWobbleBass.json
│       ├── PWMPad.json
│       ├── PercussiveHighPassNoiseHit.json
│       ├── SawLead.json
│       └── SineSubBass.json
├── skald-backend/
│   ├── build_and_test.bat
│   ├── build_codegen.bat
│   ├── codegen.odin
│   ├── graph.json
│   ├── graph_utils.odin
│   ├── json.odin
│   ├── main.odin
│   ├── param_utils.odin
│   ├── tester/
│   │   ├── generated_audio/
│   │   │   ├── AlarmPulse.json
│   │   │   └── audio.odin
│   │   ├── test_harness.odin
│   ├── types.odin
└── skald-ui/
    ├── .eslintrc.json
    ├── forge.config.ts
    ├── forge.env.d.ts
    ├── index.html
    ├── package-lock.json
    ├── package.json
    ├── skald_codegen.exe
    ├── tsconfig.json
    ├── vite.main.config.ts
    ├── vite.preload.config.ts
    ├── vite.renderer.config.ts
    └── src/
        ├── app.tsx
        ├── index.css
        ├── main.ts
        ├── preload.ts
        ├── renderer.tsx
        ├── components/
        │   ├── CodePreviewPanel.tsx
        │   ├── InstrumentNode.tsx
        │   ├── NamePromptModal.tsx
        │   ├── ParameterPanel.tsx
        │   ├── Sidebar.tsx
        │   ├── controls/
        │   │   ├── AdsrEnvelopeEditor.tsx
        │   │   ├── BpmSyncControl.tsx
        │   │   ├── CustomSlider.tsx
        │   │   └── XYPad.tsx
        │   └── Nodes/
        │       ├── ADSRNode.tsx
        │       ├── DelayNode.tsx
        │       ├── DistortionNode.tsx
        │       ├── FMOperatorNode.tsx
        │       ├── FilterNode.tsx
        │       ├── GraphOutputNode.tsx
        │       ├── GroupNode.tsx
        │       ├── LFONode.tsx
        │       ├── MixerNode.tsx
        │       ├── NoiseNode.tsx
        │       ├── OscillatorNode.tsx
        │       ├── PannerNode.tsx
        │       ├── ReverbNode.tsx
        │       ├── SampleHoldNode.tsx
        │       ├── WavetableNode.tsx
        │       └── index.ts
        └── hooks/
            └── nodeEditor/
                ├── audioNodeFactory/
                │   ├── BaseSkaldNode.ts
                │   ├── createAdsrNode.ts
                │   ├── createDefaultNode.ts
                │   ├── createDelayNode.ts
                │   ├── createDistortionNode.ts
                │   ├── createFilterNode.ts
                │   ├── createFmOperatorNode.ts
                │   ├── createInstrumentInputNode.ts
                │   ├── createInstrumentOutputNode.ts
                │   ├── createLfoNode.ts
                │   ├── createMixerNode.ts
                │   ├── createNoiseNode.ts
                │   ├── createOscillatorNode.ts
                │   ├── createOutputNode.ts
                │   ├── createPannerNode.ts
                │   ├── createReverbNode.ts
                │   ├── createSampleHoldNode.ts
                │   ├── createWavetableNode.ts
                │   └── index.ts
                ├── audioNodeUtils.ts
                ├── audioWorklets/
                │   ├── adsr.worklet.ts
                │   ├── sampleHold.worklet.ts
                │   └── wavetable.worklet.ts
                ├── instrument.ts
                ├── types.ts
                ├── useAudioEngine.ts
                ├── useFileIO.ts
                ├── useGraphState.ts
                ├── useSequencer.ts
                └── voice.ts
```