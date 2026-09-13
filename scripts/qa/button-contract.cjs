const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../../app/frontend');
const ts=require(path.join(root,'node_modules/typescript'));
const assert=require('node:assert/strict');

const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
let controls=[],targets=[];
for(const f of [...walk(root+'/app'),...walk(root+'/src')].filter(f=>/\.tsx?$/.test(f))){const text=fs.readFileSync(f,'utf8'),sf=ts.createSourceFile(f,text,99,true,ts.ScriptKind.TSX);
const line=n=>sf.getLineAndCharacterOfPosition(n.getStart()).line+1;
function visit(n){
if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){
 const tag=n.tagName.getText(sf),attrs=n.attributes.properties;
 if(/^(Pressable|PressableScale|TouchableOpacity|TouchableHighlight|Button|Switch|button)$/.test(tag)){
 const props=Object.fromEntries(attrs.filter(ts.isJsxAttribute).map(a=>[a.name.getText(sf),a.initializer?.getText(sf)]));
 controls.push({file:f.slice(root.length+1),line:line(n),tag,handler:props.onPress||props.onLongPress||props.onClick||props.onValueChange||null,label:props.accessibilityLabel||props.testID||null,spread:attrs.some(ts.isJsxSpreadAttribute)});
 }
}
if(ts.isStringLiteralLike(n)&&n.text.startsWith('/')&&!n.text.startsWith('//')) targets.push({file:f.slice(root.length+1),line:line(n),value:n.text});
ts.forEachChild(n,visit);
}visit(sf);}
const routes=walk(root+'/app').filter(f=>/\.tsx$/.test(f)&&!/[+_]\w+\.tsx$/.test(f)).map(f=>'/'+f.slice((root+'/app/').length,-4));
const norm=s=>s.replace(/\([^/]+\)\/?/g,'').replace(/\/index$/,'').replace(/\/$/,'')||'/';
const patterns=routes.map(r=>new RegExp('^'+norm(r).replace(/\[\.\.\.[^\]]+\]/g,'.+').replace(/\[[^\]]+\]/g,'[^/]+')+'$'));
const routeTargets=targets.filter(t=>!t.file.startsWith('src/api/')&&/(router\.(push|replace)|pathname:|route:|path:|go\(|nav\()/s.test(fs.readFileSync(root+'/'+t.file,'utf8').split('\n')[t.line-1]||''));
const missing=routeTargets.filter(t=>!t.value.includes('${')&&!patterns.some(p=>p.test(norm(t.value.split('?')[0]))));
if(process.env.QA_INVENTORY_PATH)fs.writeFileSync(process.env.QA_INVENTORY_PATH,JSON.stringify({controls,routeTargets,routes,missing},null,2));
assert.equal(missing.length,0,'Navigation targets must correspond to Expo routes');
assert.equal(controls.filter(c=>!c.handler&&!c.spread).length,0,'Interactive controls need handlers');
console.log(JSON.stringify({controls:controls.length,files:new Set(controls.map(c=>c.file)).size,missingHandlers:controls.filter(c=>!c.handler&&!c.spread),missingRoutes:missing},null,2));

for(const f of [...walk(root+'/app'),...walk(root+'/src')].filter(f=>/\.tsx?$/.test(f))){
 const sf=ts.createSourceFile(f,fs.readFileSync(f,'utf8'),99,true,ts.ScriptKind.TSX);
 for(const n of sf.statements){if(ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='react-native'){
  const imports=n.importClause?.namedBindings;
  if(imports&&ts.isNamedImports(imports))assert(!imports.elements.some(e=>e.name.text==='Alert'),'Use the cross-platform alert adapter: '+f);
 }}
}
