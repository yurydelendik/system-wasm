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

var WASM_EXPERIMENTAL_VERSION = 0xd;

function getImportsAndExports(code) {
    // Light parsing to extract import modules and export names.
    function nameToString(bytes) {
      return String.fromCharCode.apply(null, bytes);
    }
    var wasmparser = require('wasmparser');
    var reader = new wasmparser.BinaryReader();
    reader.setData(code.buffer, code.byteOffset, code.byteLength);
    var exportNames = [], importNamesSet = Object.create(null), eof = false;
    while (!eof) {
      if (!reader.read()) {
        throw new Error('Unexpected wasm reader stop');
      }
      switch (reader.state) {
        case wasmparser.BinaryReaderState.BEGIN_SECTION:
          var section = reader.currentSection;
          if (section.id !== wasmparser.SectionCode.Import &&
              section.id !== wasmparser.SectionCode.Export) {
            reader.skipSection();
          }
          break;
        case wasmparser.BinaryReaderState.EXPORT_SECTION_ENTRY:
          exportNames.push(nameToString(reader.result.field));
          break;
        case wasmparser.BinaryReaderState.IMPORT_SECTION_ENTRY:
          importNamesSet[nameToString(reader.result.module)] = true;
          break;
        case wasmparser.BinaryReaderState.END_WASM:
          eof = true;
          break;
      }
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
        var module = new WebAssembly.Module(load.metadata.binary);
        var instance = new WebAssembly.Instance(module, libs);
        importsAndExports.exportNames.forEach(function (exportName) {
           exports[exportName] = instance.exports[exportName];
        });
        load.metadata.wasmModule = instance;
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
