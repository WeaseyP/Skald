package main

import "core:fmt"
import "core:os"
import "core:strings"
import json "core:encoding/json"
import "../core"

make_node :: proc(id: int, type: string) -> core.Node {
    n := core.Node{}
    n.id = id
    n.type = type
    n.parameters = make(json.Object)
    return n
}

main :: proc() {
    graph := core.Graph{}
    graph.nodes = make(map[int]core.Node)
    
    // Instrument
    inst := make_node(99, "Instrument")
    inst.subgraph = new(core.Graph)
    inst.subgraph.nodes = make(map[int]core.Node)
    
    inst.parameters["polyphony"] = json.Integer(1) // Monophonic for clean analysis
    graph.nodes[99] = inst
    
    // Oscillator
    osc := make_node(1, "Oscillator")
    osc.parameters["frequency"] = json.Float(440.0)
    osc.parameters["waveform"] = json.String("Sine")
    inst.subgraph.nodes[1] = osc
    
    // Output
    out_node := make_node(2, "GraphOutput")
    inst.subgraph.nodes[2] = out_node
    
    // Connect Osc -> Output
    inst.subgraph.connections = make([]core.Connection, 1)
    inst.subgraph.connections[0] = core.Connection{
        from_node = 1, from_port = "out",
        to_node = 2, to_port = "input",
    }
    
    // Generate Code
    code := core.generate_processor_code(&graph)
    
    // Write to tester audio file
    filename := "tester/generated_audio/audio.odin"
    ok := os.write_entire_file(filename, transmute([]u8)code)
    if !ok {
        fmt.printf("ERROR: Failed to write to %s\n", filename)
        os.exit(1)
    }
    fmt.printf("Generated Oscillator Test Code to %s\n", filename)
}
