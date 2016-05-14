# Simple WASM module execution demo

Demostrate interaction between WASM and JavaScript.

The 'main' module calls the 'sub', and the 'sub' module calls 'env'.

The 'sub.wast' file was compiled by the binaryen's wasm-as to produce
the 'sub.wasm', which is loaded as module.

