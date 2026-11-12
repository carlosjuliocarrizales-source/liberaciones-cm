/* Control de Liberaciones · Cuadrilla Mecánica · M&B
   App 100% offline: datos y fotos en IndexedDB del teléfono. */
'use strict';

// ---------- Catálogos (tabla UNIDAD de la matriz M&B) ----------
const AREAS = {5:'OFFSITES',10:'CRUDO Y VACÍO',20:'COKER',30:'AZUFRE',40:'AGUAS DE DESECHO',50:'HIDROPROCESOS',60:'HIDRÓGENO',70:'UTILITIES',80:'EDIFICIOS / TALLER CENTRAL',90:'TANK FARM'};
const UNIDADES = {
  51:[5,'ACEITE DE FLUSHING Y SELLO'],52:[5,'GENERACIÓN ELÉCTRICA DE EMERGENCIA'],57:[5,'SISTEMA DE ALIVIO (FLARE)'],
  69:[5,'SISTEMA DE CONTROL DISTRIBUIDO (DCS)'],70:[5,'TUBERÍAS'],71:[5,'INFRAESTRUCTURA'],72:[5,'DISTRIBUCIÓN ELÉCTRICA'],
  80:[5,'UPGRADER WST AREA'],90:[5,'MEDICIÓN'],63:[5,'SLOP OIL / ACEITE DE DESECHO'],
  10:[10,'CRUDO'],
  12:[20,'COQUIFICACIÓN RETARDADA'],18:[20,'PLANTA DE GAS'],45:[20,'GAS COMBUSTIBLE'],68:[20,'MANEJO DE COKER'],
  24:[30,'REGENERACIÓN DE AMINAS'],26:[30,'DESPOJAMIENTO DE AGUAS AGRIAS'],28:[30,'RECUPERACIÓN DE AZUFRE'],
  30:[30,'TRATAMIENTO DE GAS DE COLA'],32:[30,'PASTILLADORA DE AZUFRE'],64:[30,'MANEJO DE AZUFRE'],
  44:[40,'AGUA POTABLE Y DE SERVICIO'],65:[40,'TRATAMIENTO DE AGUA DE DESECHO'],66:[40,'TRATAMIENTO DE AGUAS SERVIDAS'],67:[40,'SISTEMA CONTRA INCENDIO'],
  14:[50,'HIDROTRATADOR DE ACEITE LIVIANO'],15:[50,'SOPORTE DE HIDROPROCESOS'],16:[50,'HIDROCRAQUEADOR'],62:[50,'PLANTA DE TRATAMIENTO'],
  22:[60,'PLANTA DE HIDRÓGENO'],
  41:[70,'GENERACIÓN DE VAPOR'],42:[70,'ÓSMOSIS INVERSA'],43:[70,'BFW Y RECUP. DE CONDENSADO'],46:[70,'AIRE DE PLANTA E INSTRUMENTOS'],47:[70,'AGUA DE ENFRIAMIENTO'],48:[70,'GAS INERTE (N2)'],
  58:[80,'TALLER CENTRAL'],
  61:[90,'TANK FARM']
};
const SUPERVISORES = ['DANY','FLAMES','HECTOR','REBOLLEDO','PEREZ','HERMAN','SOTO','CORDOVA'];
const FIRMAS = [['cal','Calidad','M&B · Inspector'],['sup','Supervisor','M&B'],['conf','Confiabilidad','Petropiar'],['mant','Mantenimiento','Petropiar']];
const ESTADOS = {
  completa:'100% firmada', pendiente:'Corrección pendiente', corregida:'Corregida',
  inspector:'Firmada por Calidad', sinfirma:'Sin firma de Calidad'
};
const CARPETA = {completa:'1 - 100% firmadas', pendiente:'2 - Correccion pendiente', corregida:'3 - Corregidas', inspector:'4 - Faltan firmas', sinfirma:'4 - Faltan firmas'};

// ---------- Utilidades ----------
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const hoy = () => isoDate(new Date());
function isoDate(d){ const z = n => String(n).padStart(2,'0'); return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate()); }
function dmy(iso){ if(!iso) return ''; const [y,m,d] = iso.split('-'); return d+'/'+m+'/'+y; }
function dias(desde, hasta){ if(!desde) return ''; const a = new Date(desde+'T00:00'), b = new Date((hasta||hoy())+'T00:00'); return Math.max(0, Math.round((b-a)/864e5)); }
const norm = s => (s||'').toString().trim().toUpperCase().replace(/\s+/g,' ');
const esc = s => (s??'').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg, ms=2600){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'), ms); }

function unidadDe(tag, sup){
  if (norm(sup).startsWith('HECTOR')) return 58;               // regla matriz: HECTOR = Taller Central
  const m = norm(tag).match(/^(\d{2})/); return m ? parseInt(m[1],10) : '';
}
function areaDe(unidad){ const u = UNIDADES[unidad]; return u ? u[0] : ''; }
function nFirmas(l){ return FIRMAS.filter(([k]) => l.firmas && l.firmas[k]).length; }
function estado(l){
  const c = l.corr || {}, n = nFirmas(l);
  if (c.req && !c.ok) return 'pendiente';
  if (n === 4) return 'completa';
  if (c.req && c.ok) return 'corregida';
  if (l.firmas && l.firmas.cal) return 'inspector';
  return 'sinfirma';
}
const porCompletar = l => !norm(l.tag) || !l.fecha;

// ---------- IndexedDB ----------
let DB;
function abrirDB(){
  return new Promise((res, rej) => {
    const r = indexedDB.open('liberaciones-cm', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('libs', {keyPath:'id'});
      const f = d.createObjectStore('fotos', {keyPath:'id'});
      f.createIndex('libId', 'libId');
    };
    r.onsuccess = () => { DB = r.result; res(DB); };
    r.onerror = () => rej(r.error);
  });
}
function tx(store, mode, fn){
  return new Promise((res, rej) => {
    const t = DB.transaction(store, mode); let out;
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    out = fn(t.objectStore(store));
  });
}
const getAll = store => new Promise((res, rej) => { const r = DB.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const getOne = (store, id) => new Promise((res, rej) => { const r = DB.transaction(store).objectStore(store).get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const putOne = (store, v) => tx(store, 'readwrite', s => { s.put(v); });
const delOne = (store, id) => tx(store, 'readwrite', s => { s.delete(id); });

// ---------- Fotos ----------
async function cargarBitmap(file){
  try { return await createImageBitmap(file, {imageOrientation:'from-image'}); }
  catch(e){
    const url = URL.createObjectURL(file);
    try { const img = new Image(); img.src = url; await img.decode(); return img; }
    finally { URL.revokeObjectURL(url); }
  }
}
function escalar(bmp, max, q){
  const w = bmp.width, h = bmp.height, k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w*k); c.height = Math.round(h*k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', q));
}
async function procesarFoto(file, tipo, libId){
  const bmp = await cargarBitmap(file);
  const blob = await escalar(bmp, 2000, 0.82);
  const thumb = await escalar(bmp, 260, 0.7);
  if (bmp.close) bmp.close();
  return {id: uid(), libId, tipo, creado: Date.now(), tomada: file.lastModified || Date.now(), blob, thumb};
}
const thumbURL = new Map();
async function urlThumb(id, foto){
  if (thumbURL.has(id)) return thumbURL.get(id);
  const f = foto || await getOne('fotos', id); if (!f) return '';
  const u = URL.createObjectURL(f.thumb || f.blob); thumbURL.set(id, u); return u;
}

// ---------- Estado de la app ----------
let LIBS = [];
const filtro = {estado:'todas', q:'', area:''};

async function recargar(){ LIBS = await getAll('libs'); render(); }

function render(){
  // Estadísticas
  const cnt = {completa:0,pendiente:0,corregida:0,faltan:0,completar:0};
  LIBS.forEach(l => { const e = estado(l); if (e==='inspector'||e==='sinfirma') cnt.faltan++; else cnt[e]++; if (porCompletar(l)) cnt.completar++; });
  const stat = (k, cls, n, txt) => `<button class="stat ${cls} ${filtro.estado===k?'on':''}" data-f="${k}"><b>${n}</b><span>${txt}</span></button>`;
  $('#stats').innerHTML =
    stat('completa','ok',cnt.completa,'100% firmadas') +
    stat('pendiente','bad',cnt.pendiente,'Corrección pendiente') +
    stat('corregida','fix',cnt.corregida,'Corregidas') +
    stat('faltan','warn',cnt.faltan,'Faltan firmas');

  const chips = [['todas',`Todas (${LIBS.length})`],['completa','100% firmadas'],['pendiente','Pendientes'],['corregida','Corregidas'],['faltan','Faltan firmas']];
  if (cnt.completar) chips.push(['completar',`Por completar (${cnt.completar})`]);
  $('#chips').innerHTML = chips.map(([k,t]) => `<button class="chip ${filtro.estado===k?'on':''}" data-f="${k}">${t}</button>`).join('');

  // Áreas presentes
  const areas = [...new Set(LIBS.map(l => l.area).filter(Boolean))].sort((a,b)=>a-b);
  $('#fArea').innerHTML = '<option value="">Todas las áreas</option>' + areas.map(a => `<option value="${a}" ${String(filtro.area)===String(a)?'selected':''}>Área ${a} · ${AREAS[a]||''}</option>`).join('');

  // Lista
  const q = norm(filtro.q);
  const lista = LIBS.filter(l => {
    const e = estado(l);
    if (filtro.estado==='faltan' && !(e==='inspector'||e==='sinfirma')) return false;
    if (filtro.estado==='completar' && !porCompletar(l)) return false;
    if (!['todas','faltan','completar'].includes(filtro.estado) && e!==filtro.estado) return false;
    if (filtro.area && String(l.area)!==String(filtro.area)) return false;
    if (q){ const hay = norm([l.tag,l.sup,l.control,dmy(l.fecha),l.corr&&l.corr.nota,l.obs,ESTADOS[e],'AREA '+l.area].join(' ')); if (!hay.includes(q)) return false; }
    return true;
  }).sort((a,b) => (b.fecha||'').localeCompare(a.fecha||'') || b.actualizado - a.actualizado);

  if (!lista.length){
    $('#list').innerHTML = `<div class="empty">${LIBS.length ? 'No hay liberaciones con este filtro.' : 'Aún no hay liberaciones.<br>Toca <b>Nueva liberación</b> para fotografiar la primera hoja, o <b>Galería</b> para cargar fotos que ya tomaste.'}</div>`;
    return;
  }
  $('#list').innerHTML = lista.map(l => {
    const e = estado(l), c = l.corr || {};
    let extra = '';
    if (e==='pendiente') extra = ` · ${dias(c.fecha)} día(s) desde ${dmy(c.fecha)}`;
    else if (c.req && c.ok) extra = ` · corregida ${dmy(c.fechaOk)}`;
    const dots = FIRMAS.map(([k,t]) => `<span class="dot ${l.firmas&&l.firmas[k]?'y':''}" title="${t}">${t[0]}${k==='conf'?'f':''}</span>`).join('');
    return `<div class="item" data-id="${l.id}">
      <div class="thumb" data-thumb="${l.fotos&&l.fotos[l.fotos.length-1]||''}">${l.fotos&&l.fotos.length?'':'sin foto'}</div>
      <div class="body">
        <div class="tag">${esc(l.tag) || '<span style="color:var(--bad)">TAG por completar</span>'}</div>
        <div class="meta">${dmy(l.fecha)||'sin fecha'} · ${esc(l.sup)||'—'} · ${l.turno==='NOCTURNO'?'Noct.':'Diur.'}${l.area?` · Área ${l.area}`:''}${l.unidad?` · Und ${l.unidad}`:''}</div>
        <div class="row"><span class="badge b-${e}">${ESTADOS[e]}</span><span class="meta">${extra}</span><span class="dots">${dots}</span></div>
      </div></div>`;
  }).join('');
  document.querySelectorAll('.thumb[data-thumb]').forEach(async el => {
    const id = el.dataset.thumb; if (!id) return;
    const u = await urlThumb(id); if (u) el.style.backgroundImage = `url("${u}")`;
  });
}

// ---------- Editor ----------
let ed = null; // {lib, nuevas: Map, borrar: Set, esNueva}
const vacia = () => ({id: uid(), creado: Date.now(), actualizado: Date.now(), fecha: hoy(), turno:'DIURNO', tag:'', sup:'', cuad:'1', unidad:'', area:'', control:'', firmas:{cal:false,sup:false,conf:false,mant:false}, corr:{req:false,fecha:'',nota:'',ok:false,fechaOk:''}, obs:'', fotos:[]});

function abrirEditor(lib, fotosNuevas=[]){
  const l = lib ? structuredClone(lib) : vacia();
  ed = {lib: l, nuevas: new Map(), borrar: new Set(), esNueva: !lib};
  fotosNuevas.forEach(f => { f.libId = l.id; ed.nuevas.set(f.id, f); l.fotos.push(f.id); });
  $('#edTitle').textContent = ed.esNueva ? 'Nueva liberación' : (l.tag || 'Liberación');
  $('#fFecha').value = l.fecha; $('#fTurno').value = l.turno; $('#fTag').value = l.tag; $('#fSup').value = l.sup;
  $('#fCuad').value = l.cuad || '1'; $('#fUnidad').value = l.unidad; $('#fControl').value = l.control; $('#fObs').value = l.obs;
  $('#fArea2').innerHTML = '<option value="">—</option>' + Object.entries(AREAS).map(([k,v]) => `<option value="${k}">${k} · ${v}</option>`).join('');
  $('#fArea2').value = l.area;
  $('#cReq').checked = l.corr.req; $('#cFecha').value = l.corr.fecha; $('#cNota').value = l.corr.nota;
  $('#cOk').checked = l.corr.ok; $('#cFechaOk').value = l.corr.fechaOk;
  $('#btnDel').classList.toggle('hidden', ed.esNueva);
  pintarFirmas(); pintarFotos(); actualizarEditor();
  $('#sheet').classList.add('open'); $('#sheet').scrollTop = 0;
  ed.token = capa('ed');
}
// Cada pantalla superpuesta (editor, visor, menú) agrega una entrada al historial
// para que el botón "atrás" de Android la cierre en vez de salir de la app.
function capa(tipo){ const t = uid(); history.pushState({capa:tipo, t}, ''); return t; }
// Cierre desde un botón: se cierra al instante y se neutraliza la entrada (sin history.back, que es asíncrono).
function salirCapa(tipo){ cerrarCapa(tipo); if (history.state && history.state.capa === tipo) history.replaceState({}, ''); }
function cerrarCapa(tipo){ if (tipo==='v') cerrarVisor(); else if (tipo==='m') $('#menu').classList.remove('open'); else cerrarEditor(); }
function cerrarEditor(){ ed = null; $('#sheet').classList.remove('open'); }

function pintarFirmas(){
  $('#sig').innerHTML = FIRMAS.map(([k,t,s]) => `<button type="button" class="sigbtn ${ed.lib.firmas[k]?'y':''}" data-k="${k}"><span class="ck">${ed.lib.firmas[k]?'✓':''}</span><span>${t}<small>${s}</small></span></button>`).join('');
}
async function pintarFotos(){
  const l = ed.lib;
  const tiles = await Promise.all(l.fotos.map(async id => {
    const nueva = ed.nuevas.get(id); const f = nueva || await getOne('fotos', id); if (!f) return '';
    const u = await urlThumb(id, f);
    return `<div class="ph" data-foto="${id}" style="background-image:url('${u}')"><span>${f.tipo==='corregida'?'Corregida':'Original'}</span></div>`;
  }));
  $('#edPhotos').innerHTML = tiles.join('') + `<div class="ph add" id="phAdd">＋<br>Agregar foto</div>`;
}
function leerCampos(){
  const l = ed.lib;
  l.fecha = $('#fFecha').value; l.turno = $('#fTurno').value; l.tag = norm($('#fTag').value); l.sup = norm($('#fSup').value);
  l.cuad = $('#fCuad').value; l.unidad = $('#fUnidad').value ? parseInt($('#fUnidad').value,10) : ''; l.area = $('#fArea2').value ? parseInt($('#fArea2').value,10) : '';
  l.control = norm($('#fControl').value); l.obs = $('#fObs').value.trim();
  l.corr.req = $('#cReq').checked; l.corr.fecha = $('#cFecha').value; l.corr.nota = $('#cNota').value.trim();
  l.corr.ok = l.corr.req && $('#cOk').checked; l.corr.fechaOk = $('#cFechaOk').value;
}
function actualizarEditor(){
  if (!ed) return;
  leerCampos(); const l = ed.lib, e = estado(l);
  $('#edEstado').className = 'badge b-' + e; $('#edEstado').textContent = ESTADOS[e];
  $('#edEstadoTxt').textContent = `${nFirmas(l)}/4 firmas`;
  $('#cBox').classList.toggle('hidden', !l.corr.req);
  $('#cOkBox').classList.toggle('hidden', !l.corr.ok);
  $('#cDias').value = l.corr.req && l.corr.fecha ? dias(l.corr.fecha, l.corr.ok ? l.corr.fechaOk : '') : '';
  const u = UNIDADES[l.unidad];
  $('#fUnidadNom').textContent = l.unidad ? (u ? `Unidad ${l.unidad}: ${u[1]}${l.unidad===63?' (unidad 63 existe en Área 5 y 90: verifica el área)':''}` : `Unidad ${l.unidad} no está en la tabla UNIDAD: elige el área a mano.`) : '';
  const dup = l.tag && LIBS.find(x => x.id!==l.id && x.fecha===l.fecha && norm(x.tag)===l.tag && (x.turno||'DIURNO')===l.turno);
  $('#dupWarn').classList.toggle('hidden', !dup);
  if (dup) $('#dupWarn').textContent = `Ya existe una liberación de ${l.tag} el ${dmy(l.fecha)} (${l.turno.toLowerCase()}). Si es la hoja corregida, ábrela y agrega la foto ahí.`;
}
function autoUnidad(){
  const u = unidadDe($('#fTag').value, $('#fSup').value);
  $('#fUnidad').value = u; $('#fArea2').value = areaDe(u);
}

async function guardar(){
  if (!ed) return;
  leerCampos(); const l = ed.lib;
  if (l.corr.req && !l.corr.fecha){ toast('Indica la fecha en que se mandó a corregir'); $('#cFecha').focus(); return; }
  if (l.corr.ok && !l.firmas.cal){ toast('Marca la firma de Calidad en la hoja corregida'); return; }
  l.actualizado = Date.now();
  for (const f of ed.nuevas.values()) if (l.fotos.includes(f.id)) await putOne('fotos', f);
  for (const id of ed.borrar){ await delOne('fotos', id); thumbURL.delete(id); }
  await putOne('libs', l);
  pedirPersistencia();
  const e = estado(l);
  salirCapa('ed');
  await recargar(); toast(`Guardada · ${ESTADOS[e]}`);
}
async function eliminar(){
  if (!confirm('¿Eliminar esta liberación y sus fotos? No se puede deshacer.')) return;
  const l = ed.lib;
  for (const id of l.fotos.concat([...ed.borrar])){ await delOne('fotos', id); thumbURL.delete(id); }
  await delOne('libs', l.id);
  salirCapa('ed');
  await recargar(); toast('Liberación eliminada');
}

// ---------- Visor ----------
let visorId = null;
async function abrirVisor(id){
  const f = (ed && ed.nuevas.get(id)) || await getOne('fotos', id); if (!f) return;
  visorId = id; const img = $('#vImg');
  if (img.src) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(f.blob);
  $('#viewer').classList.remove('zoom'); $('#viewer').classList.add('open');
  $('#vDel').classList.toggle('hidden', !ed);
  capa('v');
}
function cerrarVisor(){ $('#viewer').classList.remove('open'); visorId = null; }

// ---------- Captura ----------
let fotoTipo = 'original';
async function tomarFotos(files, tipo){
  const out = [];
  for (const file of files){ try { out.push(await procesarFoto(file, tipo)); } catch(e){ toast('No se pudo leer una imagen'); } }
  return out;
}

// ---------- ZIP (sin librerías) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n=0;n<256;n++){ let c=n; for (let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; t[n]=c>>>0; } return t; })();
function crc32(u8){ let c = 0xFFFFFFFF; for (let i=0;i<u8.length;i++) c = CRC[(c^u8[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
const enc = new TextEncoder();
function crearZip(files){ // [{name, data: Uint8Array}]
  const partes = [], central = []; let off = 0; const d = new Date();
  const dt = ((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1)) & 0xFFFF;
  const dd = (((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()) & 0xFFFF;
  for (const f of files){
    const nm = enc.encode(f.name), data = f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint16(8,0,true);
    h.setUint16(10,dt,true); h.setUint16(12,dd,true); h.setUint32(14,crc,true); h.setUint32(18,data.length,true); h.setUint32(22,data.length,true);
    h.setUint16(26,nm.length,true); h.setUint16(28,0,true);
    partes.push(new Uint8Array(h.buffer), nm, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x0800,true); c.setUint16(10,0,true);
    c.setUint16(12,dt,true); c.setUint16(14,dd,true); c.setUint32(16,crc,true); c.setUint32(20,data.length,true); c.setUint32(24,data.length,true);
    c.setUint16(28,nm.length,true); c.setUint32(42,off,true);
    central.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((s,p)=>s+p.length,0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true); e.setUint32(12,cdSize,true); e.setUint32(16,off,true);
  return new Blob([...partes, ...central, new Uint8Array(e.buffer)], {type:'application/zip'});
}
async function leerZip(buf){
  const v = new DataView(buf), u8 = new Uint8Array(buf); let p = buf.byteLength - 22;
  while (p >= 0 && v.getUint32(p,true) !== 0x06054b50) p--;
  if (p < 0) throw new Error('No es un ZIP válido');
  const n = v.getUint16(p+10,true); let c = v.getUint32(p+16,true); const out = {};
  const dec = new TextDecoder();
  for (let i=0;i<n;i++){
    const met = v.getUint16(c+10,true), cs = v.getUint32(c+20,true), nl = v.getUint16(c+28,true), xl = v.getUint16(c+30,true), cl = v.getUint16(c+32,true), lo = v.getUint32(c+42,true);
    const name = dec.decode(u8.subarray(c+46, c+46+nl));
    const ds = lo + 30 + v.getUint16(lo+26,true) + v.getUint16(lo+28,true);
    let data = u8.slice(ds, ds+cs);
    if (met === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else if (met !== 0) throw new Error('Compresión ZIP no soportada');
    out[name] = data; c += 46 + nl + xl + cl;
  }
  return out;
}

// ---------- Excel (.xlsx) ----------
const xe = s => String(s??'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
function col(i){ let s=''; i++; while(i){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; }
function hojaXML(filas, anchos){
  const rows = filas.map((r,ri) => `<row r="${ri+1}">` + r.map((v,ci) => {
    const ref = col(ci)+(ri+1), st = ri===0 ? ' s="1"' : '';
    if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
    if (v===''||v==null) return ri===0 ? `<c r="${ref}"${st}/>` : '';
    return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
  }).join('') + '</row>').join('');
  const cols = '<cols>' + anchos.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
  const last = col(filas[0].length-1) + filas.length;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
}
function crearXlsx(hojas){ // [{nombre, filas, anchos}]
  const f = (name, s) => ({name, data: enc.encode(s)});
  const wbSheets = hojas.map((h,i)=>`<sheet name="${xe(h.nombre)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('');
  const rels = hojas.map((h,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('') + `<Relationship Id="rId${hojas.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  const ct = hojas.map((h,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const files = [
    f('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${ct}</Types>`),
    f('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    f('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${wbSheets}</sheets></workbook>`),
    f('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`),
    f('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`),
    ...hojas.map((h,i) => f(`xl/worksheets/sheet${i+1}.xml`, hojaXML(h.filas, h.anchos)))
  ];
  return new Blob([crearZip(files)], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function ordenadas(){ return [...LIBS].sort((a,b) => (a.fecha||'').localeCompare(b.fecha||'') || a.creado - b.creado); }
function excelControl(){
  const sino = b => b ? 'SI' : 'NO';
  const det = [['N°','FECHA','TURNO','TAG DEL EQUIPO','SUPERVISOR','CUAD/DIA','UNIDAD','NOM. UNIDAD','AREA','NOM. AREA','N° CONTROL','FIRMA CALIDAD','FIRMA SUPERVISOR','FIRMA CONFIABILIDAD','FIRMA MANTENIMIENTO','FIRMAS','ESTATUS','REQUIERE CORRECCION','FECHA ENVIO CORRECCION','QUE CORREGIR','FECHA CORREGIDA','DIAS EN CORRECCION','N° FOTOS','OBSERVACIONES']];
  ordenadas().forEach((l,i) => {
    const c = l.corr||{}, u = UNIDADES[l.unidad];
    det.push([i+1, dmy(l.fecha), l.turno, l.tag, l.sup, Number(l.cuad)||'', l.unidad===''?'':Number(l.unidad), u?u[1]:'', l.area===''?'':Number(l.area), AREAS[l.area]||'', l.control,
      sino(l.firmas.cal), sino(l.firmas.sup), sino(l.firmas.conf), sino(l.firmas.mant), `${nFirmas(l)}/4`, ESTADOS[estado(l)].toUpperCase(),
      sino(c.req), dmy(c.fecha), c.nota||'', c.ok?dmy(c.fechaOk):'', c.req&&c.fecha ? dias(c.fecha, c.ok?c.fechaOk:'') : '', (l.fotos||[]).length, l.obs||'']);
  });
  // Resumen por estatus y área
  const ests = ['completa','pendiente','corregida','inspector','sinfirma'];
  const areas = [...new Set(LIBS.map(l=>l.area).filter(a=>a!==''))].sort((a,b)=>a-b);
  const res = [['ESTATUS', ...areas.map(a=>`AREA ${a}`), 'SIN AREA', 'TOTAL']];
  ests.forEach(e => {
    const fila = [ESTADOS[e].toUpperCase()];
    areas.forEach(a => fila.push(LIBS.filter(l=>estado(l)===e && l.area===a).length));
    fila.push(LIBS.filter(l=>estado(l)===e && l.area==='').length);
    fila.push(LIBS.filter(l=>estado(l)===e).length); res.push(fila);
  });
  const tot = ['TOTAL']; for (let k=1;k<res[0].length;k++) tot.push(res.slice(1).reduce((s,r)=>s+r[k],0)); res.push(tot);
  return crearXlsx([
    {nombre:'CONTROL LIBERACIONES CM', filas:det, anchos:[5,11,10,22,13,8,8,26,6,20,20,9,9,9,9,7,22,9,12,30,12,9,7,30]},
    {nombre:'RESUMEN', filas:res, anchos:[24, ...areas.map(()=>10), 10, 9]}
  ]);
}
function nombreArchivo(s){ return s.replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim(); }
function descargar(blob, nombre){
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 30000);
}
async function compartirODescargar(blob, nombre){
  const file = new File([blob], nombre, {type: blob.type});
  if (navigator.canShare && navigator.canShare({files:[file]})){
    try { await navigator.share({files:[file], title:nombre}); return; } catch(e){ if (e.name==='AbortError') return; }
  }
  descargar(blob, nombre);
}
const sello = () => { const d = new Date(), z = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())} ${z(d.getHours())}${z(d.getMinutes())}`; };

async function exportarExcel(){
  if (!LIBS.length) return toast('No hay liberaciones para exportar');
  await compartirODescargar(excelControl(), `Control Liberaciones CM ${sello()}.xlsx`);
}
async function exportarZip(){
  if (!LIBS.length) return toast('No hay liberaciones para exportar');
  toast('Preparando ZIP…', 8000);
  const fotos = await getAll('fotos'), porId = new Map(fotos.map(f=>[f.id,f]));
  const files = [], meta = [], usados = new Set();
  for (const l of ordenadas()){
    const e = estado(l);
    (l.fotos||[]).forEach((id, k) => {
      const f = porId.get(id); if (!f) return;
      let base = nombreArchivo(`${l.fecha||'sin-fecha'} - ${l.tag||'SIN TAG'} - ${l.sup||'SIN SUP'} - ${f.tipo==='corregida'?'CORREGIDA':'ORIGINAL'}`);
      let name = `fotos/${CARPETA[e]}/${base}.jpg`, n = 2;
      while (usados.has(name)) name = `fotos/${CARPETA[e]}/${base} (${n++}).jpg`;
      usados.add(name); meta.push({id, libId:l.id, tipo:f.tipo, creado:f.creado, tomada:f.tomada, path:name});
    });
  }
  for (const m of meta) files.push({name:m.path, data:new Uint8Array(await porId.get(m.id).blob.arrayBuffer())});
  files.unshift({name:'Control Liberaciones CM.xlsx', data:new Uint8Array(await excelControl().arrayBuffer())});
  files.unshift({name:'respaldo-datos.json', data:enc.encode(JSON.stringify({app:'liberaciones-cm', version:1, exportado:new Date().toISOString(), libs:LIBS, fotos:meta}))});
  descargar(crearZip(files), `Liberaciones CM ${sello()}.zip`);
  localStorage.setItem('ultimoRespaldo', Date.now());
  toast('ZIP descargado: fotos ordenadas por estatus + Excel + respaldo');
}
async function importarZip(file){
  try {
    const z = await leerZip(await file.arrayBuffer());
    const j = z['respaldo-datos.json']; if (!j) throw new Error('El ZIP no contiene respaldo-datos.json');
    const data = JSON.parse(new TextDecoder().decode(j));
    if (data.app !== 'liberaciones-cm') throw new Error('Respaldo no reconocido');
    const existentes = new Map(LIBS.map(l=>[l.id,l]));
    let nuevas = 0, act = 0;
    for (const m of data.fotos){
      if (!z[m.path] || await getOne('fotos', m.id)) continue;
      const blob = new Blob([z[m.path]], {type:'image/jpeg'});
      let thumb = blob; try { const b = await cargarBitmap(blob); thumb = await escalar(b, 260, 0.7); } catch(e){}
      await putOne('fotos', {id:m.id, libId:m.libId, tipo:m.tipo, creado:m.creado, tomada:m.tomada, blob, thumb});
    }
    for (const l of data.libs){
      const ex = existentes.get(l.id);
      if (!ex){ await putOne('libs', l); nuevas++; }
      else if ((l.actualizado||0) > (ex.actualizado||0)){ await putOne('libs', l); act++; }
    }
    await recargar(); toast(`Respaldo restaurado: ${nuevas} nuevas, ${act} actualizadas`, 4000);
  } catch(e){ toast('No se pudo restaurar: ' + e.message, 5000); }
}

async function pedirPersistencia(){ try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch(e){} }
async function infoMenu(){
  let txt = `${LIBS.length} liberaciones guardadas en este teléfono.`;
  try { if (navigator.storage && navigator.storage.estimate){ const e = await navigator.storage.estimate(); txt += ` Espacio usado: ${(e.usage/1048576).toFixed(1)} MB.`; }
        if (navigator.storage && navigator.storage.persisted) txt += (await navigator.storage.persisted()) ? ' Almacenamiento protegido ✓.' : ' Almacenamiento NO protegido: exporta el ZIP seguido.'; } catch(e){}
  const u = +localStorage.getItem('ultimoRespaldo');
  txt += u ? ` Último ZIP: ${new Date(u).toLocaleDateString('es')}.` : ' Aún no has exportado un respaldo.';
  $('#mInfo').textContent = txt;
}

// ---------- Eventos ----------
function conectar(){
  document.addEventListener('click', e => {
    const f = e.target.closest('[data-f]');
    if (f && !e.target.closest('#sheet')){ filtro.estado = (filtro.estado===f.dataset.f && f.classList.contains('stat')) ? 'todas' : f.dataset.f; render(); return; }
    const it = e.target.closest('.item');
    if (it){ const l = LIBS.find(x=>x.id===it.dataset.id); if (l) abrirEditor(l); return; }
    const sb = e.target.closest('.sigbtn');
    if (sb && ed){ const k = sb.dataset.k; ed.lib.firmas[k] = !ed.lib.firmas[k]; pintarFirmas(); actualizarEditor(); return; }
    const ph = e.target.closest('.ph[data-foto]'); if (ph){ abrirVisor(ph.dataset.foto); return; }
    if (e.target.closest('#phAdd')){ fotoTipo = (ed && ed.lib.corr.req) ? 'corregida' : 'original'; $('#inPhoto').click(); }
  });
  $('#q').addEventListener('input', e => { filtro.q = e.target.value; render(); });
  $('#fArea').addEventListener('change', e => { filtro.area = e.target.value; render(); });
  $('#btnNueva').onclick = () => $('#inCam').click();
  $('#btnGaleria').onclick = () => $('#inGal').click();
  $('#inCam').onchange = async e => {
    const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return;
    abrirEditor(null, await tomarFotos(fs, 'original'));
  };
  $('#inGal').onchange = async e => {
    const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return;
    if (fs.length === 1){ const fotos = await tomarFotos(fs,'original'); abrirEditor(null, fotos); if (fotos[0]) { $('#fFecha').value = isoDate(new Date(fotos[0].tomada)); actualizarEditor(); toast('Fecha tomada de la foto: verifícala con la hoja'); } return; }
    toast(`Procesando ${fs.length} fotos…`, 10000);
    for (const file of fs){
      const [f] = await tomarFotos([file],'original'); if (!f) continue;
      const l = vacia(); l.fecha = isoDate(new Date(f.tomada)); f.libId = l.id; l.fotos = [f.id];
      await putOne('fotos', f); await putOne('libs', l);
    }
    pedirPersistencia(); filtro.estado = 'completar'; await recargar();
    toast(`${fs.length} liberaciones creadas. Ábrelas para completar TAG y firmas.`, 4500);
  };
  $('#inPhoto').onchange = async e => {
    const fs = [...e.target.files]; e.target.value = ''; if (!fs.length || !ed) return;
    const fotos = await tomarFotos(fs, fotoTipo);
    fotos.forEach(f => { f.libId = ed.lib.id; ed.nuevas.set(f.id, f); ed.lib.fotos.push(f.id); });
    if (fotoTipo === 'corregida'){
      $('#cOk').checked = true; if (!$('#cFechaOk').value) $('#cFechaOk').value = hoy();
      ed.lib.firmas.cal = true; pintarFirmas(); toast('Foto corregida agregada. Confirma las firmas de la hoja nueva.');
    }
    pintarFotos(); actualizarEditor();
  };
  ['fFecha','fTurno','fCuad','fUnidad','fArea2','fControl','fObs','cFecha','cNota','cFechaOk'].forEach(id => $('#'+id).addEventListener('input', actualizarEditor));
  ['fTag','fSup'].forEach(id => $('#'+id).addEventListener('input', () => { autoUnidad(); actualizarEditor(); }));
  $('#fUnidad').addEventListener('change', () => { const a = areaDe(parseInt($('#fUnidad').value,10)); if (a) $('#fArea2').value = a; actualizarEditor(); });
  $('#cReq').onchange = () => { if ($('#cReq').checked && !$('#cFecha').value) $('#cFecha').value = hoy(); if (!$('#cReq').checked) $('#cOk').checked = false; actualizarEditor(); };
  $('#cOk').onchange = () => { if (!ed) return; if ($('#cOk').checked){ if (!$('#cFechaOk').value) $('#cFechaOk').value = hoy(); ed.lib.firmas.cal = true; pintarFirmas(); } actualizarEditor(); };
  $('#cAddFoto').onclick = () => { fotoTipo = 'corregida'; $('#inPhoto').click(); };
  $('#sigSoloCal').onclick = () => { if (!ed) return; ed.lib.firmas = {cal:true,sup:false,conf:false,mant:false}; pintarFirmas(); actualizarEditor(); };
  $('#sigTodas').onclick = () => { if (!ed) return; ed.lib.firmas = {cal:true,sup:true,conf:true,mant:true}; pintarFirmas(); actualizarEditor(); };
  $('#btnSave').onclick = guardar;
  $('#btnDel').onclick = eliminar;
  const salirEditor = () => salirCapa('ed');
  $('#btnClose').onclick = salirEditor; $('#btnCancel').onclick = salirEditor;
  $('#vClose').onclick = () => salirCapa('v');
  $('#vZoom').onclick = () => $('#viewer').classList.toggle('zoom');
  $('#vImg').onclick = () => $('#viewer').classList.toggle('zoom');
  $('#vDel').onclick = () => {
    if (!ed || !visorId || !confirm('¿Quitar esta foto de la liberación?')) return;
    ed.lib.fotos = ed.lib.fotos.filter(x => x!==visorId);
    if (ed.nuevas.has(visorId)) ed.nuevas.delete(visorId); else ed.borrar.add(visorId);
    salirCapa('v'); pintarFotos(); actualizarEditor();
  };
  // Botón "atrás" de Android: cierra la capa superior según el estado al que se volvió
  window.addEventListener('popstate', () => {
    const s = history.state || {};
    if ($('#viewer').classList.contains('open') && s.capa !== 'v') cerrarVisor();
    if ($('#menu').classList.contains('open') && s.capa !== 'm') $('#menu').classList.remove('open');
    if (ed && !$('#viewer').classList.contains('open') && s.t !== ed.token) cerrarEditor();
  });
  $('#btnMenu').onclick = () => { infoMenu(); $('#menu').classList.add('open'); capa('m'); };
  const cerrarMenu = () => salirCapa('m');
  $('#mClose').onclick = cerrarMenu;
  $('#menu').onclick = e => { if (e.target.id==='menu') cerrarMenu(); };
  $('#mExcel').onclick = () => { cerrarMenu(); exportarExcel(); };
  $('#mFotos').onclick = () => { cerrarMenu(); exportarZip(); };
  $('#mImport').onclick = () => { cerrarMenu(); $('#inBackup').click(); };
  $('#inBackup').onchange = e => { const f = e.target.files[0]; e.target.value=''; if (f) importarZip(f); };
  $('#dlSup').innerHTML = SUPERVISORES.map(s=>`<option value="${s}">`).join('');
}

(async function init(){
  conectar();
  try { await abrirDB(); await recargar(); }
  catch(e){ $('#list').innerHTML = `<div class="empty">No se pudo abrir el almacenamiento del teléfono: ${esc(e.message)}</div>`; }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
