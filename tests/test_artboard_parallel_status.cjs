'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '../artboard-v2.js'), 'utf8');
const deployed = fs.readFileSync(path.join(__dirname, '../dist/artboard-v2.js'), 'utf8');
assert.equal(main, deployed, 'deployed dist must match actual source');
assert.match(main, /const parallelReported=.*artboardEvents/);
assert.match(main, /generating visible artwork sides in parallel/i);
assert.match(main, /isSideRow=label=>label==='AI artwork generation \(Front\)'\|\|label==='AI artwork generation \(Back\)'/);
assert.match(main, /i===active\|\|\(parallelSides&&isSideRow\(label\)\)/);
assert.match(main, /parallelSides&&isSideRow\(label\)\?'Processing in parallel':'In progress'/);
assert.match(main, /ui\.generationStarted&&state\.busy&&!state\.lastError/);
console.log('Artboard Front/Back parallel status contract passed.');
