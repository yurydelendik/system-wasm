/* Copyright 2016 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var WASM_EXPERIMENTAL_VERSION = 0xb;

function bindWasm(wasmCode, libs) {
    var nativeEnabled = typeof Wasm !== 'undefined' &&
                        Wasm.experimentalVersion === WASM_EXPERIMENTAL_VERSION;
    if (!nativeEnabled) {
        throw new Error('Wasm was not found - polyfill not bundled?');
    }
    return Wasm.instantiateModule(wasmCode, libs);
}

function getImportsAndExports(code) {
    // Light parsing to extract import modules and export names.
    function readVarUint() {
      var shift = 0;
      var n = 0, ch;
      do {
          if (i >= code.length) throw new Error('Unexpected EOF');
          ch = code[i++];
          n = n | ((ch & 0x7F) << shift);
          shift += 7;
      } while ((ch & 0x80));
      return n;
    }
    function readString() {
      var length = readVarUint();
      if (i + length > code.length) throw new Error('Unexpected EOF');
      var s = String.fromCharCode.apply(null, code.subarray(i, i + length));
      i += length;
      return s; 
    }
    if (code[0] !== 0x00 || code[1] !== 0x61 || code[2] !== 0x73 || code[3] !== 0x6D) {
        throw new Error('Invalid WASM header');
    }
    if (code[4] !== WASM_EXPERIMENTAL_VERSION || 
        code[5] !== 0x00 || code[6] !== 0x00 || code[7] !== 0x00) {
        throw new Error('Invalid WASM experimental version');
    }
    var exportNames = [], importNamesSet = Object.create(null);
    var i = 8;
    while (i < code.length) {
        var sectionIdLength = code[i++];
        if (sectionIdLength === 0 || sectionIdLength >= 128 || 
            i + sectionIdLength > code.length) {
           throw new Error('Invalid section name length at ' + i);
        }
        var sectionId = String.fromCharCode.apply(null, code.subarray(i, i + sectionIdLength));
        i += sectionIdLength;
        var sectionLength = readVarUint() >>> 0;
        if (i + sectionLength > code.length) {
           throw new Error('Invalid section length at ' + i);            
        }
        var sectionEnd = i + sectionLength;
        switch (sectionId) {
          case 'export':
            var count = readVarUint();
            for (var j = 0; j < count && i < code.length; j++) {
                readVarUint();
                exportNames.push(readString());
            }
            break;
          case 'import':
            var count = readVarUint();
            for (var j = 0; j < count && i < code.length; j++) {
                readVarUint();
                importNamesSet[readString()] = true;
                readString();
            }
            break;  
        }
        i = sectionEnd;
    }
    return {
        exportNames: exportNames,
        importNames: Object.keys(importNamesSet)
    };
};

exports.instantiate = function (load, instantiate) {
    var importsAndExports = getImportsAndExports(load.metadata.binary);

    // Some dirty hacking: looks like system.js docs lie, so doing what
    // CommonJS plugin does.
    load.metadata.deps = importsAndExports.importNames;
    load.metadata.format = 'cjs';
    var loader = this;
    var result = instantiate(load);
    var entry = load.metadata.entry;
    var oldExecute = entry.execute;
    entry.execute = function (_require, exports) {
        var k = load;
        var libs = {};
        for (var i = 0; i < load.metadata.deps.length; i++) {
            var depName = load.metadata.deps[i];
            libs[depName] = _require(depName);
        }
        var module = bindWasm(load.metadata.binary, libs);
        importsAndExports.exportNames.forEach(function (exportName) {
           exports[exportName] = module.exports[exportName]; 
        });
        load.metadata.wasmModule = module;
        return oldExecute.apply(this, arguments);
    };
    return result;
};

exports.fetch = function (load) {
    load.metadata.format = 'wasm';
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', load.address, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function () {
            if (!(xhr.status === 0 || xhr.status === 200) ||
                !xhr.response.byteLength) {
              reject(new Error('Unable to load ' + load.address + ': ' + xhr.statusText));
              return;  
            }
            load.metadata.binary = new Uint8Array(xhr.response); 
            resolve('');
        };
        xhr.onerror = function () {
            reject(new Error('Unable to load ' + load.address + ': ' + xhr.error));
        };
        xhr.send();
    });
};
