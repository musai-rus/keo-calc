#!/bin/sh
# Сборка keo-bim.js: данные + ядро калькулятора + модуль «КЕО по модели» (для запуска в окне Autodesk Viewer)
cd "$(dirname "$0")/.."
node -e "
const D=require('./data.js');
process.stdout.write('window.DATA='+JSON.stringify(D)+';\n');
" > bim/_data.js
{ echo '/* КЕО по модели — сборка. Запуск: KeoBim.run() в окне Autodesk Viewer с открытой 3D-моделью. */';
  echo '(function(){';
  node -e "const fs=require('node:fs'),crypto=require('node:crypto'); const files=['data.js','report.js','engine.js','schemes.js','model.js','bim/spaces.js','bim/precision.js','bim/categories.js','bim/geom.js','bim/calc.js','bim/rectangles.js','bim/sections.js','bim/viewer-binding.js','bim/north.js','bim/diagnostics.js','bim/app.js','bim/build.sh']; const h=crypto.createHash('sha256');for(const f of files){h.update(f+'\\0');h.update(fs.readFileSync(f));h.update('\\0')}process.stdout.write('const KeoBimBuild='+JSON.stringify({sha256:h.digest('hex'),files})+';\\n');";
  cat bim/_data.js report.js engine.js schemes.js model.js bim/spaces.js bim/precision.js bim/categories.js bim/geom.js bim/calc.js bim/rectangles.js bim/sections.js bim/viewer-binding.js bim/north.js bim/diagnostics.js bim/app.js | grep -v "^if (typeof module\|^if(typeof module";
  echo '})();'; } > bim/keo-bim.js
rm bim/_data.js
mkdir -p docs && cp bim/keo-bim.js docs/keo-bim.js
