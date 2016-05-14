# System.js loader for WASM modules

Helper for WebAssembly file, to be loaded as module.

# Including in a project

For using with system.js:

    System.config({
        map: {
            wasm: 'system-wasm'
        }
    });
    
To use and wasm file as module, just call e.g.:

    var wasmModule = require('./module.wasm!');   

 
# Execution of the wasm module 

If the global `Wasm` object is present (WebAssembly is enabled for browser),
it will use `Wasm.instantiateModule`, otherwise it will fallback on the
binaryen's wasm.js (needs to be explicitly included as script).