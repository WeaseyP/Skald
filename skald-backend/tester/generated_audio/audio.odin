package generated_audio
{
  "project": {
    "bpm": 120,
    "master_volume": 0.8,
    "instruments": [
      {
        "id": "mjtewcvhr6k8y",
        "name": "Kick",
        "mute": false,
        "solo": false,
        "voice_count": 8,
        "midi_config": {
          "device": "All",
          "channel": 1
        },
        "audio_graph": {
          "nodes": [
            {
              "id": "1",
              "id_raw": "1",
              "type": "Oscillator",
              "position": {
                "x": 1653.8667325226754,
                "y": 2118.3501182826594
              },
              "parameters": {
                "frequency": 121.35,
                "waveform": "Sine",
                "amplitude": 0.5,
                "pulseWidth": 0.5,
                "phase": 0,
                "exposedParameters": [
                  "frequency",
                  "amplitude",
                  "pulseWidth",
                  "phase"
                ]
              },
              "exposed_parameters": [
                "frequency",
                "amplitude",
                "pulseWidth",
                "phase"
              ]
            },
            {
              "id": "2",
              "id_raw": "2",
              "type": "ADSR",
              "position": {
                "x": 1342.0900359024522,
                "y": 2043.3501182826594
              },
              "parameters": {
                "attack": 0.001,
                "decay": 0.052333333333333336,
                "sustain": 0,
                "release": 0.001,
                "depth": 1,
                "velocitySensitivity": 0.5,
                "attackCurve": "linear",
                "decayCurve": "linear",
                "releaseCurve": "linear",
                "exposedParameters": [
                  "attack",
                  "decay",
                  "sustain",
                  "release",
                  "depth"
                ]
              },
              "exposed_parameters": [
                "attack",
                "decay",
                "sustain",
                "release",
                "depth"
              ]
            },
            {
              "id": "3",
              "id_raw": "3",
              "type": "ADSR",
              "position": {
                "x": 1986.6078336492676,
                "y": 2244.0912194092516
              },
              "parameters": {
                "attack": 0.001,
                "decay": 0.052333333333333336,
                "sustain": 0.011057692307692268,
                "release": 0.1333333333333333,
                "depth": 1,
                "velocitySensitivity": 0.5,
                "attackCurve": "linear",
                "decayCurve": "linear",
                "releaseCurve": "linear",
                "exposedParameters": [
                  "attack",
                  "decay",
                  "sustain",
                  "release",
                  "depth"
                ]
              },
              "exposed_parameters": [
                "attack",
                "decay",
                "sustain",
                "release",
                "depth"
              ]
            },
            {
              "id": "4",
              "id_raw": "4",
              "type": "Distortion",
              "position": {
                "x": 2353.887822811987,
                "y": 2271.8394821094125
              },
              "parameters": {
                "drive": 5,
                "tone": 4000,
                "mix": 0.5,
                "exposedParameters": [
                  "drive",
                  "tone",
                  "mix"
                ]
              },
              "exposed_parameters": [
                "drive",
                "tone",
                "mix"
              ]
            },
            {
              "id": "5",
              "id_raw": "5",
              "type": "GraphOutput",
              "position": {
                "x": 2747.376677421835,
                "y": 2297.955999008296
              },
              "parameters": {},
              "exposed_parameters": []
            }
          ],
          "connections": [
            {
              "from_node": "4",
              "from_port": "output",
              "to_node": "5",
              "to_port": "input"
            },
            {
              "from_node": "3",
              "from_port": "output",
              "to_node": "4",
              "to_port": "input"
            },
            {
              "from_node": "1",
              "from_port": "output",
              "to_node": "3",
              "to_port": "input"
            },
            {
              "from_node": "2",
              "from_port": "output",
              "to_node": "1",
              "to_port": "input_freq"
            }
          ],
          "sequencer_tracks": [
            {
              "target_node_id": 0,
              "name": "Kick",
              "mute": false,
              "solo": false,
              "events": [
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 0,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 0.5,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 1.25,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 1.75,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 2.25,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 2.75,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 3.5,
                  "duration": 0.1
                }
              ]
            }
          ]
        }
      },
      {
        "id": "mjtf42lp1mbtn",
        "name": "Snare Drum",
        "mute": false,
        "solo": false,
        "voice_count": 8,
        "midi_config": {
          "device": "All",
          "channel": 1
        },
        "audio_graph": {
          "nodes": [
            {
              "id": "1",
              "id_raw": "1",
              "type": "Noise",
              "position": {
                "x": 2251.6550485395055,
                "y": 1426.8327934558408
              },
              "parameters": {
                "type": "White",
                "amplitude": 1,
                "exposedParameters": [
                  "amplitude"
                ]
              },
              "exposed_parameters": [
                "amplitude"
              ]
            },
            {
              "id": "2",
              "id_raw": "2",
              "type": "Mixer",
              "position": {
                "x": 2497.997315124952,
                "y": 1536.2225266831647
              },
              "parameters": {
                "inputCount": 4,
                "levels": [
                  {
                    "id": 1,
                    "level": 0.75,
                    "pan": 0
                  },
                  {
                    "id": 2,
                    "level": 0.75,
                    "pan": 0
                  },
                  {
                    "id": 3,
                    "level": 0.75,
                    "pan": 0
                  },
                  {
                    "id": 4,
                    "level": 0.75,
                    "pan": 0
                  }
                ],
                "exposedParameters": []
              },
              "exposed_parameters": []
            },
            {
              "id": "3",
              "id_raw": "3",
              "type": "Oscillator",
              "position": {
                "x": 2246.520703884294,
                "y": 1568.6602245715671
              },
              "parameters": {
                "frequency": 220,
                "waveform": "Triangle",
                "amplitude": 0.5,
                "pulseWidth": 0.5,
                "phase": 0,
                "exposedParameters": [
                  "frequency",
                  "amplitude",
                  "pulseWidth",
                  "phase"
                ]
              },
              "exposed_parameters": [
                "frequency",
                "amplitude",
                "pulseWidth",
                "phase"
              ]
            },
            {
              "id": "4",
              "id_raw": "4",
              "type": "Filter",
              "position": {
                "x": 2749.4338586984036,
                "y": 1510.7602027723274
              },
              "parameters": {
                "type": "Bandpass",
                "cutoff": 2449.232398530096,
                "resonance": 0.5933709653149176,
                "exposedParameters": [
                  "cutoff",
                  "resonance"
                ]
              },
              "exposed_parameters": [
                "cutoff",
                "resonance"
              ]
            },
            {
              "id": "5",
              "id_raw": "5",
              "type": "ADSR",
              "position": {
                "x": 3047.6460333999244,
                "y": 1521.8557675598354
              },
              "parameters": {
                "attack": 0.001,
                "decay": 0.159,
                "sustain": 0,
                "release": 0.1333333333333333,
                "depth": 1,
                "velocitySensitivity": 0.5,
                "attackCurve": "linear",
                "decayCurve": "linear",
                "releaseCurve": "linear",
                "exposedParameters": [
                  "attack",
                  "decay",
                  "sustain",
                  "release",
                  "depth"
                ]
              },
              "exposed_parameters": [
                "attack",
                "decay",
                "sustain",
                "release",
                "depth"
              ]
            },
            {
              "id": "6",
              "id_raw": "6",
              "type": "GraphOutput",
              "position": {
                "x": 3368.9779455001285,
                "y": 1518.8243344268144
              },
              "parameters": {},
              "exposed_parameters": []
            }
          ],
          "connections": [
            {
              "from_node": "3",
              "from_port": "output",
              "to_node": "2",
              "to_port": "input_2"
            },
            {
              "from_node": "1",
              "from_port": "output",
              "to_node": "2",
              "to_port": "input_1"
            },
            {
              "from_node": "2",
              "from_port": "output",
              "to_node": "4",
              "to_port": "input"
            },
            {
              "from_node": "4",
              "from_port": "output",
              "to_node": "5",
              "to_port": "input"
            },
            {
              "from_node": "5",
              "from_port": "output",
              "to_node": "6",
              "to_port": "input"
            }
          ],
          "sequencer_tracks": [
            {
              "target_node_id": 0,
              "name": "Snare Drum",
              "mute": false,
              "solo": false,
              "events": [
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 0.25,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 0.75,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 1.5,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 2,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 3.25,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 2.5,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 3,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 1.25,
                  "duration": 0.1
                }
              ]
            }
          ]
        }
      },
      {
        "id": "1767577587190-0",
        "name": "sax",
        "mute": false,
        "solo": false,
        "voice_count": 8,
        "midi_config": {
          "device": "All",
          "channel": 1
        },
        "audio_graph": {
          "nodes": [
            {
              "id": "1",
              "id_raw": "1",
              "type": "Mapper",
              "position": {
                "x": 2429.5657729198188,
                "y": 2884.7313670322733
              },
              "parameters": {
                "inMin": 0,
                "inMax": 1,
                "outMin": 400,
                "outMax": 3000
              },
              "exposed_parameters": []
            },
            {
              "id": "2",
              "id_raw": "2",
              "type": "Oscillator",
              "position": {
                "x": 2398.3183079531022,
                "y": 2711.017313706302
              },
              "parameters": {
                "frequency": 440,
                "waveform": "Sawtooth",
                "amplitude": 0.5,
                "pulseWidth": 0.5,
                "phase": 0,
                "exposedParameters": [
                  "frequency",
                  "amplitude",
                  "pulseWidth",
                  "phase"
                ]
              },
              "exposed_parameters": [
                "frequency",
                "amplitude",
                "pulseWidth",
                "phase"
              ]
            },
            {
              "id": "3",
              "id_raw": "3",
              "type": "Filter",
              "position": {
                "x": 2804.7267444711533,
                "y": 2790.187788352676
              },
              "parameters": {
                "type": "Lowpass",
                "cutoff": 857.0970407948786,
                "resonance": 1.9104520808904857,
                "exposedParameters": [
                  "cutoff",
                  "resonance"
                ]
              },
              "exposed_parameters": [
                "cutoff",
                "resonance"
              ]
            },
            {
              "id": "4",
              "id_raw": "4",
              "type": "Gain",
              "position": {
                "x": 3258.6374657770293,
                "y": 2890.4703895714156
              },
              "parameters": {
                "gain": 0,
                "exposedParameters": [
                  "gain"
                ]
              },
              "exposed_parameters": [
                "gain"
              ]
            },
            {
              "id": "5",
              "id_raw": "5",
              "type": "GraphOutput",
              "position": {
                "x": 3659.767870651989,
                "y": 2956.4457851100606
              },
              "parameters": {},
              "exposed_parameters": []
            },
            {
              "id": "6",
              "id_raw": "6",
              "type": "MidiInput",
              "position": {
                "x": 1991.9098714350507,
                "y": 2914.221531965328
              },
              "parameters": {
                "device": "All",
                "useMpe": false,
                "exposedParameters": [
                  "device",
                  "useMpe"
                ]
              },
              "exposed_parameters": [
                "device",
                "useMpe"
              ]
            },
            {
              "id": "7",
              "id_raw": "7",
              "type": "ADSR",
              "position": {
                "x": 2403.5963395961935,
                "y": 3077.840512901167
              },
              "parameters": {
                "attack": 0.05333333333333334,
                "decay": 0.24,
                "sustain": 0.81875,
                "release": 0.21333333333333326,
                "depth": 1,
                "velocitySensitivity": 0.5,
                "attackCurve": "linear",
                "decayCurve": "linear",
                "releaseCurve": "linear",
                "exposedParameters": [
                  "attack",
                  "decay",
                  "sustain",
                  "release",
                  "depth"
                ]
              },
              "exposed_parameters": [
                "attack",
                "decay",
                "sustain",
                "release",
                "depth"
              ]
            }
          ],
          "connections": [
            {
              "from_node": "2",
              "from_port": "output",
              "to_node": "3",
              "to_port": "input"
            },
            {
              "from_node": "3",
              "from_port": "output",
              "to_node": "4",
              "to_port": "input"
            },
            {
              "from_node": "4",
              "from_port": "output",
              "to_node": "5",
              "to_port": "input"
            },
            {
              "from_node": "6",
              "from_port": "pitch",
              "to_node": "2",
              "to_port": "input_freq"
            },
            {
              "from_node": "6",
              "from_port": "gate",
              "to_node": "7",
              "to_port": "input"
            },
            {
              "from_node": "7",
              "from_port": "output",
              "to_node": "4",
              "to_port": "input_gain"
            },
            {
              "from_node": "7",
              "from_port": "output",
              "to_node": "3",
              "to_port": "input_cutoff"
            },
            {
              "from_node": "1",
              "from_port": "output",
              "to_node": "3",
              "to_port": "input_cutoff"
            },
            {
              "from_node": "6",
              "from_port": "velocity",
              "to_node": "1",
              "to_port": "input"
            }
          ],
          "sequencer_tracks": [
            {
              "target_node_id": 1767577587190,
              "name": "sax",
              "mute": false,
              "solo": false,
              "events": [
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 0,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 0.25,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 0.75,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 1.75,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 2.5,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 2.75,
                  "duration": 0.1
                },
                {
                  "note": 60,
                  "velocity": 1,
                  "start_time": 3.25,
                  "duration": 0.1
                }
              ]
            }
          ]
        }
      }
    ]
  }
}