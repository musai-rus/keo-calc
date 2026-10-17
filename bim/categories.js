/* Revit category identities, not element/family names. The exact same resolver
   is serialized into the Autodesk property worker (no model-specific rules). */
const BimCategories = (function () {
  // Numeric values and symbols: Autodesk Revit API 2026 BuiltInCategory.
  // https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/ba1c5b30-242f-5fdc-8ea9-ec3b61e6e722.htm
  const rows = [
    ['Rooms',-2000160,'OST_Rooms','Помещения'],
    ['Spaces',-2003600,'OST_MEPSpaces','Пространства'],
    ['Areas',-2003200,'OST_Areas','Зоны'],
    ['Walls',-2000011,'OST_Walls','Стены'],
    ['Windows',-2000014,'OST_Windows','Окна'],
    ['Doors',-2000023,'OST_Doors','Двери'],
    ['Columns',-2000100,'OST_Columns','Колонны'],
    ['Structural Columns',-2001330,'OST_StructuralColumns','Несущие колонны'],
    ['<Room Separation>',-2000066,'OST_RoomSeparationLines','<Разделитель помещений>'],
    ['Curtain Panels',-2000170,'OST_CurtainWallPanels','Панели витража'],
    ['Curtain Wall Mullions',-2000171,'OST_CurtainWallMullions','Импосты витража'],
    ['Floors',-2000032,'OST_Floors','Перекрытия'],
    ['Roofs',-2000035,'OST_Roofs','Крыши'],
    ['Generic Models',-2000151,'OST_GenericModel','Обобщенные модели'],
    ['Level',-2000240,'OST_Levels','Уровни'],
    ['Lines',-2000051,'OST_Lines','Линии'],
    ['Grids',-2000220,'OST_Grids','Оси'],
    ['Furniture',-2000080,'OST_Furniture','Мебель'],
    ['Mechanical Equipment',-2001140,'OST_MechanicalEquipment','Оборудование'],
    ['Plumbing Fixtures',-2001160,'OST_PlumbingFixtures','Сантехнические приборы'],
    ['Specialty Equipment',-2001350,'OST_SpecialityEquipment','Специальное оборудование'],
    ['Planting',-2001360,'OST_Planting','Озеленение'],
    ['Skylights',null,null,'Световые люки'],
    ['Sun Path',null,null,'Траектория солнца']
  ];
  const config = { ids:{}, names:{}, symbols:{} };
  const norm = s => typeof s === 'string' ? s.trim().replace(/\s+/g,' ').toLowerCase() : '';
  rows.forEach(([en,id,symbol,ru]) => {
    const canonical = 'Revit ' + en;
    if (id !== null) config.ids[String(id)] = canonical;
    if (symbol) config.symbols[symbol] = canonical;
    for (const label of [en,ru]) config.names[norm('Revit '+label)] = canonical;
    // Explicit bilingual export labels. Never split an arbitrary family/name.
    for (const pair of [[en,ru],[ru,en]]) {
      config.names[norm('Revit '+pair[0]+' / '+pair[1])] = canonical;
      config.names[norm('Revit '+pair[0]+' / Revit '+pair[1])] = canonical;
    }
  });
  function resolve(properties, table) {
    const normalized = s => typeof s === 'string' ? s.trim().replace(/\s+/g,' ').toLowerCase() : '';
    const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
    const ids=[], labels=[], stable=[], named=[]; let badIdentity=false, unknownIdentity=false;
    for (const p of properties || []) {
      const name = p.attributeName ?? p.name, group = p.displayCategory ?? p.category ?? '';
      const value = own(p,'displayValue') ? p.displayValue : p.value;
      if (name === 'CategoryId' || name === 'BuiltInCategory') {
        ids.push(value);
        if (group !== '__categoryId__') { badIdentity=true; continue; }
        let c = null;
        if (name === 'CategoryId') {
          const key = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : typeof value === 'string' && /^-\d+$/.test(value.trim()) ? String(Number(value.trim())) : '';
          c = own(table.ids,key) ? table.ids[key] : null;
        } else c = typeof value === 'string' && own(table.symbols,value) ? table.symbols[value] : null;
        if (c) stable.push(c); else unknownIdentity=true;
      }
      if ((name === 'Category' || name === 'Категория') && (group === '__category__' || group === '')) {
        labels.push(value); const key=normalized(value);
        named.push(own(table.names,key) ? table.names[key] : null);
      }
    }
    const knownNames=[...new Set(named.filter(Boolean))], knownIds=[...new Set(stable)];
    const result = (canonical,source,reason) => ({canonical,source,reason,ids,labels});
    if (badIdentity) return result(null,'unknown','untrusted-category-id-field');
    if (unknownIdentity) return result(null,'unknown','unsupported-category-id');
    if (knownIds.length > 1 || knownNames.length > 1 || knownIds.length && knownNames.some(c=>c!==knownIds[0])) return result(null,'unknown','conflicting-category-evidence');
    if (knownIds.length === 1) return result(knownIds[0],'category-id',null);
    if (knownNames.length === 1 && named.every(Boolean)) return result(knownNames[0],'controlled-name',null);
    return result(null,'unknown',labels.length ? 'unsupported-category-name' : 'missing-category');
  }
  function readRooms(pdb, table, resolver) {
    const records=[],counts={rooms:0,spaces:0,areas:0,unknown:0},sources={},unknownExamples=[];
    pdb.enumObjects(id => {
      const o={id,u:{}}, categories=[],levels=[];
      pdb.enumObjectProperties(id,(a,v)=>{
        const d=pdb.getAttributeDef(a),n=d.name,value=pdb.getAttrValue(a,v);
        if (n==='Category'||n==='Категория'||n==='CategoryId'||n==='BuiltInCategory') categories.push({name:n,category:d.category,value});
        if (n==='Level' && d.dataType!==11 && typeof value==='string' && value.trim() && (d.dataType===20 || isNaN(+value))) levels.push(value);
        if (n==='Name') o.name=value; if(n==='Number') o.num=value; if(n==='ElementId') o.eid=String(value);
        if (['Area','Perimeter','Unbounded Height','Base Offset'].includes(n)) o.u[n]=[value,d.dataTypeContext||null];
        if(n==='Department')o.dep=value;if(n==='Occupancy')o.occ=value;
      });
      const category=resolver(categories,table);
      if(category.canonical==='Revit Spaces'){counts.spaces++;return;}
      if(category.canonical==='Revit Areas'){counts.areas++;return;}
      if(category.canonical!=='Revit Rooms') {
        if(!category.canonical && categories.length){counts.unknown++;if(unknownExamples.length<5)unknownExamples.push({id,category});}
        return;
      }
      counts.rooms++;sources[category.source]=(sources[category.source]||0)+1;
      const names=[...new Set(levels)];o.level=names.length===1?names[0]:null;
      o.levelWarning=names.length>1?'противоречивые имена уровня':names.length?'':'имя уровня недоступно';
      o.category=category;records.push(o);
    });
    return {records,diagnostics:{counts,sources,unknownExamples}};
  }
  const workerSource = () => 'function userFunction(pdb,config){const resolve='+resolve.toString()+';return ('+readRooms.toString()+')(pdb,config,resolve);}';
  const skipHeight = new Set(['Rooms','Spaces','Areas','Level','Lines','Grids','Furniture','Mechanical Equipment','Plumbing Fixtures','Specialty Equipment','Planting','Sun Path','<Room Separation>'].map(n=>'Revit '+n));
  return { isHostSlab:c=>c==='Revit Floors'||c==='Revit Roofs', resolve:properties=>resolve(properties,config), config:()=>JSON.parse(JSON.stringify(config)), workerSource, skipHeight:c=>skipHeight.has(c) };
})();
if (typeof module !== 'undefined') module.exports = BimCategories;
