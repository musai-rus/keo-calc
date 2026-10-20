const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const file=path.join(__dirname,'../../bim/test-native-side-input.js');
const fixtures=new Function('require','__dirname','console',fs.readFileSync(file,'utf8')+';return {one:fixture(false),four:fixture(true)};')(createRequire(file),path.dirname(file),{log(){}});
const output=process.argv[2];if(!output)throw Error('Usage: node prepare-keo-panel-fixtures.cjs output.json');
fs.writeFileSync(output,JSON.stringify(fixtures),{flag:'wx'});
console.log('Control fixtures prepared; geometry adapter assertions passed.');
