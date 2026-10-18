/* Synthetic counterexample only. No Revit execution or model data. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../bim/geom.js'), 'utf8') + '\nthis.G = BimGeom;', context);
const G = context.G;

// A real 1 mm opening in the bottom side of an otherwise closed 4 x 3 m box.
// Point (2, 1.5) has a continuous free path through x=2 to the exterior.
const a = 1.9995, b = 2.0005;
const source = [[0, 0, a, 0], [b, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0]];
assert.ok(b > a);
assert.ok(source.every(s => !(s[1] === 0 && s[3] === 0 && Math.min(s[0], s[2]) <= 2 && Math.max(s[0], s[2]) >= 2)));
const observations = [];
for (const cell of [0.05, 0.025, 0.0125]) {
  const grid = G.raster(source, cell, [-1, -1, 5, 4]);
  const id = G.labelAt(grid, 2, 1.5);
  assert.ok(id > 0);
  assert.equal(grid.regs[id].border, false);
  observations.push({ cell, digitalBorder: grid.regs[id].border, areaC: grid.regs[id].areaC });
}
console.log(JSON.stringify({ test: 'a bounded digital region does not prove continuous source closure', gapMetres: b - a, observations, geometryAccepted: false, normativeAccepted: false }));
