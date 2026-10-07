#!/bin/sh
# Сборка keo-bim.js: данные + ядро калькулятора + модуль «КЕО по модели» (для запуска в окне Autodesk Viewer)
cd "$(dirname "$0")/.."
node -e "
const D=require('./data.js'); D.regions=[{name:'г. Москва',g:1}];
process.stdout.write('window.DATA='+JSON.stringify(D)+';\n');
" > bim/_data.js
{ echo '/* КЕО по модели — сборка. Запуск: KeoBim.run() в окне Autodesk Viewer с открытой 3D-моделью. */';
  echo '(function(){';
  cat bim/_data.js report.js engine.js schemes.js model.js bim/geom.js bim/calc.js bim/app.js | grep -v "^if (typeof module\|^if(typeof module";
  echo '})();'; } > bim/keo-bim.js
rm bim/_data.js
mkdir -p docs && cp bim/keo-bim.js docs/keo-bim.js
