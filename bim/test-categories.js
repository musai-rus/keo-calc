/* Synthetic exported properties; no private model IDs or names as conditions. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Categories=require('./categories.js');
const cat=(value,extra={})=>({attributeName:'Category',displayCategory:'__category__',displayValue:value,...extra});
const id=(value,extra={})=>({attributeName:'CategoryId',displayCategory:'__categoryId__',displayValue:value,...extra});
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name)}
test('ru/en exact aliases and bilingual categories resolve identically',()=>{
 for(const [en,ru] of [['Rooms','Помещения'],['Spaces','Пространства'],['Areas','Зоны'],['Walls','Стены'],['Windows','Окна'],['Doors','Двери'],['Columns','Колонны'],['Structural Columns','Несущие колонны'],['<Room Separation>','<Разделитель помещений>'],['Curtain Panels','Панели витража'],['Curtain Wall Mullions','Импосты витража'],['Roofs','Крыши'],['Floors','Перекрытия'],['Generic Models','Обобщенные модели']]) {
  for(const text of ['Revit '+en,'Revit '+ru,'Revit '+en+' / '+ru,'Revit '+ru+' / Revit '+en])assert.equal(Categories.resolve([cat(text)]).canonical,'Revit '+en);
  assert.equal(Categories.resolve([cat('Revit '+ru),cat('Revit '+en)]).canonical,'Revit '+en);
 }
});
test('stable CategoryId accepts renamed display value and internal property labels',()=>{
 const r=Categories.resolve([id(-2000160,{displayName:'renamed id label'}),cat('renamed category label',{displayName:'renamed property label'})]);
 assert.equal(r.canonical,'Revit Rooms');assert.equal(r.source,'category-id');
 assert.equal(Categories.resolve([id('-2000011')]).canonical,'Revit Walls');
});
test('symbolic BuiltInCategory has the same identity and preserves spatial distinctions',()=>{
 for(const [symbol,c]of[['OST_Rooms','Rooms'],['OST_MEPSpaces','Spaces'],['OST_Areas','Areas'],['OST_Columns','Columns']])assert.equal(Categories.resolve([{attributeName:'BuiltInCategory',displayCategory:'__categoryId__',displayValue:symbol}]).canonical,'Revit '+c);
});
test('Rooms, Spaces and Areas are separate for both IDs and fallback labels',()=>{
 for(const [n,c]of[[-2000160,'Rooms'],[-2003600,'Spaces'],[-2003200,'Areas']])assert.equal(Categories.resolve([id(n),cat('Revit '+c)]).canonical,'Revit '+c);
 assert.equal(Categories.resolve([id(-2003200),cat('Revit Rooms')]).canonical,null);
 assert.equal(Categories.resolve([id(-2003600),cat('Revit Помещения')]).canonical,null);
});
test('unknown, positive/custom, empty or malformed IDs block name fallback',()=>{
 for(const v of [-999999,1234,null,undefined,'',NaN,Infinity,true,'-2000160.0','-2000160x',{},[]])assert.equal(Categories.resolve([id(v),cat('Revit Rooms')]).canonical,null);
});
test('conflicting stable identities or name evidence fail closed in either order',()=>{
 for(const p of [[id(-2000160),id(-2003200)],[cat('Revit Rooms'),cat('Revit Spaces')],[id(-2000011),cat('Revit Doors')]])for(const q of [p,p.slice().reverse()])assert.equal(Categories.resolve(q).canonical,null);
});
test('duplicate consistent evidence is accepted; unknown extra fallback label is not ignored',()=>{
 assert.equal(Categories.resolve([id(-2000160),id(-2000160),cat('Revit Помещения')]).canonical,'Revit Rooms');
 assert.equal(Categories.resolve([cat('Revit Rooms'),cat('Unexpected')]).canonical,null);
});
test('displayName, element name, family and substrings cannot create a category',()=>{
 for(const p of [cat('Revit Bed Rooms'),cat('Revit Rooms Tags'),cat('Rooms'),cat('Revit Spaces / Помещения'),{attributeName:'User parameter',displayName:'Category',displayValue:'Revit Rooms'},cat('Revit Rooms',{displayCategory:'User parameters'}),{name:'Rooms',family:'Revit Rooms'}])assert.equal(Categories.resolve([p]).canonical,null);
});
test('CategoryId in a user parameter group cannot override or validate fallback',()=>{
 assert.equal(Categories.resolve([id(-2000160,{displayCategory:'User parameters'}),cat('Revit Rooms')]).canonical,null);
});
test('height map exclusions use canonical categories rather than arbitrary substrings',()=>{
 for(const c of ['Revit Rooms','Revit Spaces','Revit Areas','Revit Furniture','Revit <Room Separation>'])assert.equal(Categories.skipHeight(c),true);
 for(const c of ['Revit Walls','Unknown category: furniture-like wall','Revit Curtain Panels'])assert.equal(Categories.skipHeight(c),false);
});
const raw=(value,name,category='__category__',type=20,context=null)=>({name,category,dataType:type,dataTypeContext:context,value});
const record=(category,n,extra=[])=>({id:n,values:[raw(category,'Category'),raw('Name '+n,'Name','Identity'),raw(String(n),'Number','Identity'),raw(12000000,'Area','Dimensions',3,'autodesk.unit.unit:squareMillimeters-1.0.1'),raw(14000,'Perimeter','Dimensions',3,'autodesk.unit.unit:millimeters-1.0.1'),raw('02','Level','Constraints',20),...extra]});
function pdb(records){
 const defs=[],values=[],objects=new Map();
 records.forEach(o=>objects.set(o.id,o.values.map(p=>{const a=defs.push(p)-1,v=values.push(p.value)-1;return[a,v]})));
 return {enumObjects:cb=>objects.forEach((v,id)=>cb(id)),enumObjectProperties:(id,cb)=>(objects.get(id)||[]).forEach(([a,v])=>cb(a,v)),getAttributeDef:a=>defs[a],getAttrValue:(a,v)=>values[v]};
}
function worker(records){const c=vm.createContext({pdb:pdb(records),config:Categories.config()});return vm.runInContext('('+Categories.workerSource()+')(pdb,config)',c)}
test('isolated actual worker separates spatial types and unsupported category evidence',()=>{
 const rows=[record('Revit Помещения',1,[raw(-2000160,'CategoryId','__categoryId__',2)]),record('Revit Rooms',2),record('Revit Spaces',3),record('Revit Зоны',4),record('Revit Rooms',5,[raw(-9999,'CategoryId','__categoryId__',2)])];
 const r=worker(rows);assert.deepEqual(Array.from(r.records,x=>x.id),[1,2]);assert.equal(r.diagnostics.counts.rooms,2);assert.equal(r.diagnostics.counts.spaces,1);assert.equal(r.diagnostics.counts.areas,1);assert.equal(r.diagnostics.counts.unknown,1);
});
test('typed numeric-string level name survives numeric internal reference in either order',()=>{
 const r=record('Revit Rooms',1,[raw(42,'Level','__internalref__',11)]);
 for(const values of [r.values,r.values.slice().reverse()])assert.equal(worker([{...r,values}]).records[0].level,'02');
});
test('unresolved reference-only or conflicting level names stay explicit',()=>{
 const r=record('Revit Rooms',1);r.values=r.values.filter(p=>p.name!=='Level');r.values.push(raw(42,'Level','__internalref__',11));
 assert.equal(worker([r]).records[0].level,null);assert.match(worker([r]).records[0].levelWarning,/недоступно/);
 r.values.push(raw('02','Level','Constraints',20),raw('03','Level','Constraints',20));assert.equal(worker([r]).records[0].level,null);assert.match(worker([r]).records[0].levelWarning,/противоречивые/);
});
const SP=new Function(fs.readFileSync(__dirname+'/spaces.js','utf8')+';return BimSpaces;')();
const G=new Function('BimCategories','BimSpaces',fs.readFileSync(__dirname+'/geom.js','utf8')+';return BimGeom;')(Categories,SP);
async function main(){
 const rows=[record('Revit Помещения',1),record('Revit Rooms',2),record('Revit Spaces',3),record('Revit Зоны',4)];
 // No Viewer fragments, instance tree, or geometry are supplied: Rooms belong to the property database.
 const C={m:{getPropertyDb:()=>({executeUserFunction:async(source,config)=>{const c=vm.createContext({pdb:pdb(rows),config});return vm.runInContext('('+source+')(pdb,config)',c)}})}};
 const rooms=await G.rooms(C);assert.equal(rooms.length,2);assert.equal(rooms[0].area,12);assert.equal(rooms[0].per,14);assert.equal(rooms[0].level,'02');assert.equal(rooms.diagnostics.counts.areas,1);count++;console.log('PASS actual G.rooms preserves localized property units and numeric level without geometry');
 const props=rows.map(r=>({dbId:r.id,properties:r.values.map(p=>({attributeName:p.name,displayCategory:p.category,displayValue:p.value,displayName:'renamed display label'}))}));
 const ctx={it:{getRootId:()=>0,enumNodeChildren:(root,fn)=>props.forEach(p=>fn(p.dbId)),getChildCount:()=>0,getNodeName:id=>'Unrelated family name '+id},m:{getBulkProperties2:(ids,opts,ok)=>{assert.equal(opts.ignoreHidden,false);assert.ok(opts.propFilter.includes('CategoryId'));ok(props)}}};
 const catalog=await G.catalog(ctx);assert.equal(catalog.byCat['Revit Rooms'].length,2);assert.equal(catalog.byCat['Revit Spaces'].length,1);assert.equal(catalog.byCat['Revit Areas'].length,1);count++;console.log('PASS actual G.catalog canonicalizes ru/en categories and preserves source evidence');
 console.log(`${count}/${count} category groups passed`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
