// ============================================================
// STOCKPRO — FRONTEND app.js (Supabase version)
// Ganti app.js lama dengan file ini
// ============================================================

// ============================================================
// CONFIG — ganti dengan nilai dari .env atau hardcode sementara
// ============================================================
const SUPABASE_URL  = 'https://wqajinhjrzeidbbqcrvu.supabase.co';
const SUPABASE_ANON = 'sb_publishable_atBWZqpQrXJJNpRwFziESQ_8WtuufaP';
const API_URL       = ''; // Tidak dipakai di mode langsung Supabase

// Load Supabase client dari CDN (tambahkan di index.html)
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ============================================================
// STATE
// ============================================================
let SESSION = null;
let DB = { barang:[], supplier:[], satuan:[], masuk:[], keluar:[], pindah:[], transfer:[], opname:{} };
const PAG = { barang:{p:1,pp:15}, masuk:{p:1,pp:15}, keluar:{p:1,pp:15} };

// ============================================================
// SUPABASE DIRECT — tidak butuh backend Railway
// ============================================================
async function sbGet(table, filters={}) {
  let q = sb.from(table).select('*');
  if (filters.order) q = q.order(filters.order, { ascending: filters.asc ?? true });
  if (filters.eq) Object.entries(filters.eq).forEach(([k,v]) => q = q.eq(k,v));
  if (filters.ilike) q = q.ilike(filters.ilike[0], `%${filters.ilike[1]}%`);
  if (filters.gte) q = q.gte(filters.gte[0], filters.gte[1]);
  if (filters.lte) q = q.lte(filters.lte[0], filters.lte[1]);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}
async function sbInsert(table, row) {
  const { data, error } = await sb.from(table).insert([row]).select().single();
  if (error) throw new Error(error.message);
  return data;
}
async function sbDelete(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ============================================================
// AUTH
// ============================================================
async function login(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  SESSION = data.session;
  return data;
}

async function logout() {
  await sb.auth.signOut();
  SESSION = null;
  showLoginPage();
}

// Cek session saat halaman dibuka
async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    SESSION = session;
    await loadAllData();
    showApp();
  } else {
    showLoginPage();
  }
}

// ============================================================
// LOAD ALL DATA
// ============================================================
async function loadAllData() {
  showLoading(true);
  try {
    const [barang, supplier, satuan, masuk, keluar, pindah, transfer] = await Promise.all([
      sbGet('stok_realtime', { order: 'id' }),
      sbGet('supplier', { order: 'id' }),
      sbGet('satuan', { order: 'nama' }),
      sbGet('barang_masuk', { order: 'created_at', asc: false }),
      sbGet('barang_keluar', { order: 'created_at', asc: false }),
      sbGet('barang_pindah', { order: 'created_at', asc: false }),
      sbGet('transfer_part', { order: 'created_at', asc: false }),
    ]);
    DB.barang   = barang;
    DB.supplier = supplier;
    DB.satuan   = satuan;
    DB.masuk    = masuk;
    DB.keluar   = keluar;
    DB.pindah   = pindah;
    DB.transfer = transfer;
  } catch(e) {
    toast('Gagal memuat data: ' + e.message, 'err');
  } finally {
    showLoading(false);
  }
}

// Realtime subscription — update otomatis saat ada perubahan
function subscribeRealtime() {
  sb.channel('stockpro-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'barang_masuk' }, () => loadAllData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'barang_keluar' }, () => loadAllData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'barang' }, () => loadAllData())
    .subscribe();
}

// ============================================================
// HELPERS
// ============================================================
const fmt = n => Number(n||0).toLocaleString('id-ID');
const fmtRp = n => 'Rp '+Number(n||0).toLocaleString('id-ID');
const today = () => new Date().toISOString().split('T')[0];
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const genID = (pre,arr) => {
  const d=new Date(),s=String(d.getFullYear()).slice(-2)+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  return `${pre}-${s}-${String(arr.length+1).padStart(3,'0')}`;
};

// Stok dari view realtime (data sudah dihitung di Supabase)
function getStok(bid) {
  const b = DB.barang.find(x=>x.id===bid);
  if (!b) return {gudang:0,storing:0};
  return { gudang: b.stok_gudang||0, storing: b.stok_storing||0 };
}

// ============================================================
// LOADING STATE
// ============================================================
function showLoading(show) {
  let el = document.getElementById('global-loading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'global-loading';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,50,30,0.6);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:white;font-family:var(--font);font-weight:700;font-size:14px;';
    el.innerHTML = '<div style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite"></div><span>Memuat data...</span>';
    const style = document.createElement('style');
    style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
    document.body.appendChild(el);
  }
  el.style.display = show ? 'flex' : 'none';
}

// ============================================================
// SHOW/HIDE LOGIN & APP
// ============================================================
function showLoginPage() {
  document.getElementById('app-wrapper').style.display = 'none';
  let lp = document.getElementById('login-page');
  if (!lp) {
    lp = document.createElement('div');
    lp.id = 'login-page';
    lp.style.cssText = 'min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#004F35,#00704A,#1E8C5A);';
    lp.innerHTML = `
      <div style="background:white;border-radius:24px;padding:40px;width:380px;box-shadow:0 24px 80px rgba(0,50,30,0.4);">
        <div style="text-align:center;margin-bottom:28px;">
          <div style="font-size:40px;margin-bottom:8px;">⚙️</div>
          <div style="font-family:'Lora',serif;font-size:22px;font-weight:700;color:#004F35">StockPro</div>
          <div style="font-size:13px;color:#7A9A8A;margin-top:4px;">Sistem Manajemen Gudang</div>
        </div>
        <div style="margin-bottom:14px;">
          <label style="font-size:11px;font-weight:800;color:#7A9A8A;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:5px">Email</label>
          <input id="login-email" type="email" placeholder="admin@gudang.com" style="width:100%;padding:11px 14px;border:1.5px solid #DDE8E3;border-radius:10px;font-size:14px;outline:none;font-family:inherit;" onfocus="this.style.borderColor='#00704A'" onblur="this.style.borderColor='#DDE8E3'">
        </div>
        <div style="margin-bottom:22px;">
          <label style="font-size:11px;font-weight:800;color:#7A9A8A;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:5px">Password</label>
          <input id="login-pass" type="password" placeholder="••••••••" style="width:100%;padding:11px 14px;border:1.5px solid #DDE8E3;border-radius:10px;font-size:14px;outline:none;font-family:inherit;" onfocus="this.style.borderColor='#00704A'" onblur="this.style.borderColor='#DDE8E3'" onkeydown="if(event.key==='Enter')doLogin()">
        </div>
        <button onclick="doLogin()" style="width:100%;padding:12px;background:linear-gradient(135deg,#1E8C5A,#00704A);color:white;border:none;border-radius:50px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">🔐 Masuk</button>
        <div id="login-err" style="margin-top:12px;color:#C0392B;font-size:13px;text-align:center;display:none;"></div>
      </div>`;
    document.body.appendChild(lp);
  }
  lp.style.display = 'flex';
}

async function doLogin() {
  const email = document.getElementById('login-email').value;
  const pass  = document.getElementById('login-pass').value;
  const err   = document.getElementById('login-err');
  err.style.display = 'none';
  try {
    await login(email, pass);
    document.getElementById('login-page').style.display = 'none';
    await loadAllData();
    subscribeRealtime();
    showApp();
    toast('Selamat datang! 👋');
  } catch(e) {
    err.textContent = '❌ ' + e.message;
    err.style.display = 'block';
  }
}

function showApp() {
  document.getElementById('app-wrapper').style.display = '';
  renderDashboard();
}

// ============================================================
// DARK MODE
// ============================================================
function toggleDark() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('dm-btn').textContent = isDark ? '🌙' : '☀️';
  localStorage.setItem('stockpro_theme', isDark ? 'light' : 'dark');
  rebuildCharts();
}
function loadTheme() {
  const t = localStorage.getItem('stockpro_theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('dm-btn').textContent = t === 'dark' ? '☀️' : '🌙';
}

// ============================================================
// TOAST
// ============================================================
function toast(msg, type='ok', undoFn=null) {
  const w = document.getElementById('toast-wrap');
  const t = document.createElement('div');
  t.className = `toast toast-slide ${type}`;
  const icons = { ok:'✅', err:'❌', warn:'⚠️', info:'ℹ️' };
  t.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span style="flex:1">${msg}</span>`;
  if (undoFn) {
    const u = document.createElement('span');
    u.className = 'toast-undo'; u.textContent = 'Batalkan';
    u.onclick = () => { undoFn(); t.remove(); toast('Berhasil dibatalkan','info'); };
    t.appendChild(u);
  }
  w.appendChild(t);
  setTimeout(() => { t.style.cssText='opacity:0;transform:translateX(110%);transition:all 0.3s'; setTimeout(()=>t.remove(),300); }, 3500);
}

// ============================================================
// CONFIRM
// ============================================================
let confirmCb = null;
function showConfirm(title, msg, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  confirmCb = cb;
  document.getElementById('confirm-overlay').classList.add('open');
  document.getElementById('confirm-ok-btn').onclick = () => { closeConfirm(); if(confirmCb) confirmCb(); };
}
function closeConfirm() { document.getElementById('confirm-overlay').classList.remove('open'); }

// ============================================================
// COUNT-UP
// ============================================================
function countUp(el, target, duration=600) {
  if (!el) return;
  const start = parseInt(el.textContent.replace(/\./g,'')) || 0;
  const diff = target - start; if (diff === 0) return;
  const step = diff / (duration / 16); let cur = start;
  const timer = setInterval(() => {
    cur += step;
    if ((step > 0 && cur >= target) || (step < 0 && cur <= target)) { el.textContent = fmt(target); clearInterval(timer); }
    else { el.textContent = fmt(Math.round(cur)); }
  }, 16);
}

// ============================================================
// NAVIGATION
// ============================================================
const META = {
  'dashboard':{bc:'Dashboard',group:null},
  'master-barang':{bc:'Data Master › Data Barang',group:'master'},
  'master-supplier':{bc:'Data Master › Data Supplier',group:'master'},
  'master-satuan':{bc:'Data Master › Data Satuan',group:'master'},
  'inp-masuk':{bc:'Input Data › Barang Masuk',group:'input'},
  'inp-keluar':{bc:'Input Data › Barang Keluar',group:'input'},
  'inp-pindah':{bc:'Input Data › Barang Pindah',group:'input'},
  'inp-transfer':{bc:'Input Data › Transfer Part List',group:'input'},
  'inp-opname':{bc:'Input Data › Stock Opname',group:'input'},
  'lap-rekap':{bc:'Laporan › Rekapitulasi',group:'laporan'},
  'lap-opname':{bc:'Laporan › Stock Opname',group:'laporan'},
};
function goPage(name) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
  document.querySelectorAll('.dd-item').forEach(d=>d.classList.remove('active'));
  document.querySelectorAll('.nav-menu>li').forEach(l=>l.classList.remove('open'));
  document.getElementById('page-'+name)?.classList.add('active');
  const m = META[name];
  if (m) {
    document.getElementById('bc-cur').textContent = m.bc;
    if (name==='dashboard') document.getElementById('nl-dashboard')?.classList.add('active');
    if (m.group) document.getElementById('nl-'+m.group)?.classList.add('active');
    document.getElementById('ddi-'+name)?.classList.add('active');
  }
  const R = {
    dashboard:renderDashboard,'master-barang':renderMasterBarang,'master-supplier':renderSupplier,
    'master-satuan':renderSatuan,'inp-masuk':renderMasuk,'inp-keluar':renderKeluar,
    'inp-pindah':renderPindah,'inp-transfer':renderTransfer,'inp-opname':renderOpname,
    'lap-rekap':renderRekap,'lap-opname':renderLapOpname
  };
  if (R[name]) R[name]();
  closeGSearch();
}
function toggleGroup(grp) {
  const li=document.getElementById('grp-'+grp),was=li.classList.contains('open');
  document.querySelectorAll('.nav-menu>li').forEach(l=>l.classList.remove('open'));
  if(!was) li.classList.add('open');
}
document.addEventListener('click',e=>{ if(!e.target.closest('.nav-menu>li')) document.querySelectorAll('.nav-menu>li').forEach(l=>l.classList.remove('open')); });

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', e => {
  if ((e.ctrlKey||e.metaKey) && e.key==='k') { e.preventDefault(); openGSearch(); }
  if (e.key==='Escape') { closeGSearch(); closeConfirm(); document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open')); }
  if ((e.ctrlKey||e.metaKey) && e.key==='1') { e.preventDefault(); goPage('dashboard'); }
  if ((e.ctrlKey||e.metaKey) && e.key==='2') { e.preventDefault(); goPage('master-barang'); }
  if ((e.ctrlKey||e.metaKey) && e.key==='3') { e.preventDefault(); goPage('inp-masuk'); }
  if ((e.ctrlKey||e.metaKey) && e.key==='4') { e.preventDefault(); goPage('inp-keluar'); }
  if ((e.ctrlKey||e.metaKey) && e.key==='5') { e.preventDefault(); goPage('lap-rekap'); }
});

// ============================================================
// GLOBAL SEARCH
// ============================================================
function openGSearch() { document.getElementById('gsearch-overlay').classList.add('open'); setTimeout(()=>document.getElementById('gsearch-input').focus(),50); }
function closeGSearch(e) {
  if (e && e.target!==document.getElementById('gsearch-overlay')) return;
  document.getElementById('gsearch-overlay').classList.remove('open');
  document.getElementById('gsearch-input').value='';
  document.getElementById('gsearch-results').innerHTML='<div class="gs-empty">Ketik untuk mencari...</div>';
}
function runGSearch() {
  const q=document.getElementById('gsearch-input').value.toLowerCase().trim();
  const res=document.getElementById('gsearch-results');
  if(!q){res.innerHTML='<div class="gs-empty">Ketik untuk mencari...</div>';return;}
  let html='';
  const barang=DB.barang.filter(b=>b.nama.toLowerCase().includes(q)||b.id.toLowerCase().includes(q)||b.part_number.toLowerCase().includes(q)).slice(0,5);
  if(barang.length){html+='<div class="gs-section">📦 Barang</div>';barang.forEach(b=>{const s=getStok(b.id);html+=`<div class="gs-item" onclick="goPage('master-barang')"><div class="gs-item-ico">📦</div><div><div class="gs-item-name">${esc(b.nama)}</div><div class="gs-item-sub">${esc(b.part_number)} · ${esc(b.model||'-')}</div></div><span class="gs-item-tag">${fmt(s.gudang+s.storing)} unit</span></div>`; });}
  const sup=DB.supplier.filter(s=>s.nama.toLowerCase().includes(q)||s.id.toLowerCase().includes(q)).slice(0,3);
  if(sup.length){html+='<div class="gs-section">🏭 Supplier</div>';sup.forEach(s=>{html+=`<div class="gs-item" onclick="goPage('master-supplier')"><div class="gs-item-ico" style="background:var(--blue-bg)">🏭</div><div><div class="gs-item-name">${esc(s.nama)}</div><div class="gs-item-sub">${esc(s.telp||'-')}</div></div><span class="gs-item-tag" style="background:var(--blue-bg);color:var(--blue)">${s.status}</span></div>`; });}
  if(!html) html=`<div class="gs-empty">😕 Tidak ada hasil untuk "<strong>${esc(q)}</strong>"</div>`;
  res.innerHTML=html;
}

// ============================================================
// MODAL
// ============================================================
function openModal(id) {
  const n=today();
  if(id==='m-masuk'){document.getElementById('mk-id').value=genID('BM',DB.masuk);document.getElementById('mk-tgl').value=n;fillSel('mk-satuan','satuan');fillSel('mk-supplier','supplier');fillSel('mk-barang','barang');}
  if(id==='m-keluar'){document.getElementById('kl-id').value=genID('BK',DB.keluar);document.getElementById('kl-tgl').value=n;fillSel('kl-satuan','satuan');fillSel('kl-barang','barang');}
  if(id==='m-pindah'){document.getElementById('pd-id').value=genID('BP',DB.pindah);document.getElementById('pd-tgl').value=n;fillSel('pd-satuan','satuan');fillSel('pd-barang','barang');}
  if(id==='m-transfer'){document.getElementById('tf-id').value=genID('TF',DB.transfer);document.getElementById('tf-tgl').value=n;fillSel('tf-satuan','satuan');fillSel('tf-barang','barang');}
  if(id==='m-barang'){document.getElementById('foto-preview-img').style.display='none';document.getElementById('foto-input').value='';}
  document.getElementById(id).classList.add('open');
}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)closeModal(o.id);}));

function fillSel(selId,type) {
  const s=document.getElementById(selId); if(!s)return;
  if(type==='barang'){s.innerHTML='<option value="">-- Pilih Barang --</option>';DB.barang.forEach(b=>s.innerHTML+=`<option value="${b.id}">${esc(b.nama)} (${esc(b.part_number)})</option>`);}
  else if(type==='satuan'){s.innerHTML='<option value="">-- Satuan --</option>';DB.satuan.forEach(x=>s.innerHTML+=`<option value="${x.nama}">${x.nama}</option>`);}
  else if(type==='supplier'){s.innerHTML='<option value="">-- Pilih Supplier --</option>';DB.supplier.filter(x=>x.status==='Aktif').forEach(x=>s.innerHTML+=`<option value="${x.id}">${esc(x.nama)}</option>`);}
}
function fillBarang(prefix){const bid=document.getElementById(prefix+'-barang')?.value,b=DB.barang.find(x=>x.id===bid),el=document.getElementById(prefix+'-part');if(el&&b)el.value=b.part_number;}

// ============================================================
// FOTO & QR
// ============================================================
let fotoBase64=null;
function previewFoto(e) {
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader(); r.onload=ev=>{fotoBase64=ev.target.result;const img=document.getElementById('foto-preview-img');img.src=fotoBase64;img.style.display='block';}; r.readAsDataURL(f);
}
function showQR(b) {
  document.getElementById('qr-nama-title').textContent=b.nama;
  document.getElementById('qr-label').textContent=`${b.id} · ${b.part_number||b.part}`;
  const cont=document.getElementById('qr-container'); cont.innerHTML='';
  new QRCode(cont,{text:`StockPro|${b.id}|${b.nama}|${b.part_number||b.part}`,width:180,height:180,colorDark:'#004F35',colorLight:'#ffffff'});
  openModal('m-qr');
}
function downloadQR() {
  const canvas=document.querySelector('#qr-container canvas'); if(!canvas)return;
  const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`QR-${document.getElementById('qr-label').textContent}.png`;a.click();
  toast('QR Code diunduh');
}

// ============================================================
// PAGINATION
// ============================================================
function paginate(data,pKey){const p=PAG[pKey];if(!p)return data;const total=data.length,pages=Math.ceil(total/p.pp);p.p=Math.min(p.p,Math.max(1,pages));return data.slice((p.p-1)*p.pp,p.p*p.pp);}
function changePage(pKey,pg){const p=PAG[pKey];if(!p)return;p.p=pg;const R={barang:renderMasterBarang,masuk:renderMasuk,keluar:renderKeluar};if(R[pKey])R[pKey]();}
function renderPag(containerId,data,pKey){
  const cont=document.getElementById(containerId);if(!cont)return;
  const p=PAG[pKey];if(!p){cont.innerHTML='';return;}
  const total=data.length,pages=Math.ceil(total/p.pp)||1;
  if(total<=p.pp){cont.innerHTML='';return;}
  const start=(p.p-1)*p.pp+1,end=Math.min(p.p*p.pp,total);
  let btns='';for(let i=1;i<=pages;i++){btns+=`<div class="pag-btn${i===p.p?' active':''}" onclick="changePage('${pKey}',${i})">${i}</div>`;}
  cont.innerHTML=`<div class="pag-info">Menampilkan ${start}–${end} dari ${total}</div><div class="pag-btns"><div class="pag-btn" onclick="changePage('${pKey}',${p.p-1})" ${p.p<=1?'style="opacity:.4;pointer-events:none"':''}>‹</div>${btns}<div class="pag-btn" onclick="changePage('${pKey}',${p.p+1})" ${p.p>=pages?'style="opacity:.4;pointer-events:none"':''}>›</div></div>`;
}

// ============================================================
// CHARTS
// ============================================================
let chartTrend=null,chartDonut=null;
function getChartColors(){const dark=document.documentElement.getAttribute('data-theme')==='dark';return{grid:dark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)',text:dark?'#7A9E8C':'#6B8C7C',green:'#00A86B',greenA:'rgba(0,168,107,0.15)',red:'#E05C4C',redA:'rgba(224,92,76,0.15)'};}
function buildTrendChart(){
  const ctx=document.getElementById('chart-trend');if(!ctx)return;
  const C=getChartColors(),days=[],masukD=[],keluarD=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const s=d.toISOString().split('T')[0];days.push(d.toLocaleDateString('id-ID',{weekday:'short',day:'numeric'}));masukD.push(DB.masuk.filter(m=>m.tanggal===s).reduce((a,c)=>a+c.qty,0));keluarD.push(DB.keluar.filter(k=>k.tanggal===s).reduce((a,c)=>a+c.qty,0));}
  if(chartTrend)chartTrend.destroy();
  chartTrend=new Chart(ctx,{type:'line',data:{labels:days,datasets:[{label:'Masuk',data:masukD,borderColor:C.green,backgroundColor:C.greenA,borderWidth:2.5,fill:true,tension:0.4,pointBackgroundColor:C.green,pointRadius:4},{label:'Keluar',data:keluarD,borderColor:C.red,backgroundColor:C.redA,borderWidth:2.5,fill:true,tension:0.4,pointBackgroundColor:C.red,pointRadius:4}]},options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{labels:{color:C.text,font:{size:11,weight:'700'},boxWidth:12}},tooltip:{backgroundColor:'rgba(20,40,30,0.9)',titleColor:'#fff',bodyColor:'rgba(255,255,255,0.8)',padding:10}},scales:{x:{grid:{color:C.grid},ticks:{color:C.text,font:{size:10}}},y:{grid:{color:C.grid},ticks:{color:C.text,font:{size:10}},beginAtZero:true}}}});
}
function buildDonutChart(){
  const ctx=document.getElementById('chart-donut');if(!ctx)return;
  const C=getChartColors();let g=0,s=0;DB.barang.forEach(b=>{const st=getStok(b.id);g+=st.gudang;s+=st.storing;});
  if(chartDonut)chartDonut.destroy();
  chartDonut=new Chart(ctx,{type:'doughnut',data:{labels:['Gudang','Storing'],datasets:[{data:[g||1,s||0],backgroundColor:['#00A86B','#1B6CB0'],borderColor:['#fff','#fff'],borderWidth:3,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:true,cutout:'70%',plugins:{legend:{position:'bottom',labels:{color:C.text,font:{size:11,weight:'700'},boxWidth:10,padding:12}},tooltip:{backgroundColor:'rgba(20,40,30,0.9)',callbacks:{label:ctx=>`${ctx.label}: ${fmt(ctx.raw)} unit`}}}}});
}
function rebuildCharts(){setTimeout(()=>{buildTrendChart();buildDonutChart();},100);}

// ============================================================
// SAVES — semua CRUD lewat API
// ============================================================
async function saveBarang() {
  const id=document.getElementById('b-id').value.trim(),nama=document.getElementById('b-nama').value.trim(),part_number=document.getElementById('b-part').value.trim();
  if(!id||!nama||!part_number){toast('ID, Nama & Part Number wajib','err');return;}
  try{
    await sbInsert('barang',{id,nama,part_number,model:document.getElementById('b-model').value,stok_gudang:parseInt(document.getElementById('b-stok-g').value)||0,stok_storing:parseInt(document.getElementById('b-stok-s').value)||0});
    closeModal('m-barang');['b-id','b-nama','b-part','b-model'].forEach(x=>document.getElementById(x).value='');
    fotoBase64=null;await loadAllData();renderMasterBarang();toast(`Barang "${nama}" ditambahkan`);
  }catch(e){toast(e.message,'err');}
}
async function saveSupplier() {
  const id=document.getElementById('s-id').value.trim(),nama=document.getElementById('s-nama').value.trim();
  if(!id||!nama){toast('ID & Nama wajib','err');return;}
  try{await sbInsert('supplier',{id,nama,alamat:document.getElementById('s-alamat').value,telp:document.getElementById('s-telp').value,status:document.getElementById('s-status').value,keterangan:document.getElementById('s-ket').value});closeModal('m-supplier');await loadAllData();renderSupplier();toast(`Supplier "${nama}" ditambahkan`);}catch(e){toast(e.message,'err');}
}
async function saveSatuan() {
  const nama=document.getElementById('sat-nama').value.trim();
  if(!nama){toast('Nama satuan wajib','err');return;}
  try{await sbInsert('satuan',{nama,keterangan:document.getElementById('sat-ket').value});closeModal('m-satuan');await loadAllData();renderSatuan();toast(`Satuan "${nama}" ditambahkan`);}catch(e){toast(e.message,'err');}
}
async function saveMasuk() {
  const bid=document.getElementById('mk-barang').value,qty=parseInt(document.getElementById('mk-qty').value),satuan=document.getElementById('mk-satuan').value;
  if(!bid||!qty||qty<1||!satuan){toast('Barang, QTY & Satuan wajib','err');return;}
  const b=DB.barang.find(x=>x.id===bid);
  try{
    await sbInsert('barang_masuk',{id:document.getElementById('mk-id').value,tanggal:document.getElementById('mk-tgl').value,barang_id:bid,nama_barang:b.nama,qty,satuan,harga:parseInt(document.getElementById('mk-harga').value)||0,supplier_id:document.getElementById('mk-supplier').value||null,penerima:document.getElementById('mk-penerima').value,keterangan:document.getElementById('mk-ket').value,lokasi:'Gudang',created_by:SESSION?.user?.id});
    closeModal('m-masuk');await loadAllData();renderMasuk();renderDashboard();toast(`Masuk: ${b.nama} +${fmt(qty)} ${satuan}`);
  }catch(e){toast(e.message,'err');}
}
async function saveKeluar() {
  const bid=document.getElementById('kl-barang').value,qty=parseInt(document.getElementById('kl-qty').value),satuan=document.getElementById('kl-satuan').value,lokasi_stok=document.getElementById('kl-stok').value;
  if(!bid||!qty||qty<1||!satuan){toast('Barang, QTY & Satuan wajib','err');return;}
  const b=DB.barang.find(x=>x.id===bid);
  const tersedia=lokasi_stok==='Gudang'?b.stok_gudang:b.stok_storing;
  if(qty>tersedia){toast(`Stok ${lokasi_stok} tidak cukup! Tersedia: ${fmt(tersedia)}`,'err');return;}
  try{
    await sbInsert('barang_keluar',{id:document.getElementById('kl-id').value,tanggal:document.getElementById('kl-tgl').value,no_lambung:document.getElementById('kl-lamb').value,kilometer:parseInt(document.getElementById('kl-km').value)||null,barang_id:bid,nama_barang:b.nama,qty,satuan,lokasi_stok,mekanik:document.getElementById('kl-mekanik').value,penggunaan:document.getElementById('kl-guna').value,keterangan:document.getElementById('kl-ket').value,created_by:SESSION?.user?.id});
    closeModal('m-keluar');await loadAllData();renderKeluar();renderDashboard();toast(`Keluar: ${b.nama} -${fmt(qty)} ${satuan}`);
  }catch(e){toast(e.message,'err');}
}
async function savePindah() {
  const bid=document.getElementById('pd-barang').value,qty=parseInt(document.getElementById('pd-qty').value),dari=document.getElementById('pd-dari').value,ke=document.getElementById('pd-ke').value;
  if(!bid||!qty||qty<1){toast('Barang & QTY wajib','err');return;}
  if(dari===ke){toast('Lokasi asal & tujuan tidak boleh sama','err');return;}
  const b=DB.barang.find(x=>x.id===bid);
  try{
    await sbInsert('barang_pindah',{id:document.getElementById('pd-id').value,tanggal:document.getElementById('pd-tgl').value,barang_id:bid,nama_barang:b.nama,qty,satuan:document.getElementById('pd-satuan').value,dari,ke,created_by:SESSION?.user?.id});
    closeModal('m-pindah');await loadAllData();renderPindah();renderDashboard();toast(`Pindah: ${b.nama} ${dari}→${ke}`);
  }catch(e){toast(e.message,'err');}
}
async function saveTransfer() {
  const bid=document.getElementById('tf-barang').value,qty=parseInt(document.getElementById('tf-qty').value);
  if(!bid||!qty||qty<1){toast('Barang & QTY wajib','err');return;}
  const b=DB.barang.find(x=>x.id===bid);
  try{
    await sbInsert('transfer_part',{id:document.getElementById('tf-id').value,tanggal:document.getElementById('tf-tgl').value,barang_id:bid,nama_barang:b.nama,qty,satuan:document.getElementById('tf-satuan').value,vendor:document.getElementById('tf-vendor').value,penerima:document.getElementById('tf-penerima').value,keterangan:document.getElementById('tf-ket').value,created_by:SESSION?.user?.id});
    closeModal('m-transfer');await loadAllData();renderTransfer();toast('Transfer dicatat');
  }catch(e){toast(e.message,'err');}
}
async function saveOpname() {
  const inputs=document.querySelectorAll('.opname-input');const items=[];
  inputs.forEach(inp=>{const bid=inp.dataset.id,val=parseInt(inp.value);if(!isNaN(val)&&val>=0){const s=getStok(bid);items.push({barang_id:bid,stok_fisik:val,stok_sistem:s.gudang+s.storing,tanggal:today(),created_by:SESSION?.user?.id});}});
  if(!items.length){toast('Belum ada data opname','warn');return;}
  const{error}=await sb.from('stock_opname').upsert(items,{onConflict:'barang_id,tanggal'});
  if(error){toast(error.message,'err');return;}
  toast(`Opname ${items.length} barang disimpan`);
}

// ============================================================
// DELETE — langsung Supabase
// ============================================================
function deleteItem(col,id,name) {
  const tables={barang:'barang',supplier:'supplier',masuk:'barang_masuk',keluar:'barang_keluar',pindah:'barang_pindah',transfer:'transfer_part'};
  showConfirm(`Hapus data?`,`"${name}" akan dihapus permanen.`,async()=>{
    try{
      await sbDelete(tables[col],id);
      await loadAllData();
      const R={barang:renderMasterBarang,supplier:renderSupplier,masuk:renderMasuk,keluar:renderKeluar,pindah:renderPindah,transfer:renderTransfer};
      if(R[col])R[col]();
      toast(`"${name}" dihapus`,'warn');
    }catch(e){toast(e.message,'err');}
  });
}

// ============================================================
// RENDERS (sama seperti sebelumnya — menggunakan DB yang sudah diload)
// ============================================================
function updateBadges(){document.getElementById('nb-masuk').textContent=DB.masuk.length;document.getElementById('nb-keluar').textContent=DB.keluar.length;}

function renderDashboard() {
  updateBadges();
  const totalMasuk=DB.masuk.reduce((a,c)=>a+c.qty,0),totalKeluar=DB.keluar.reduce((a,c)=>a+c.qty,0);
  const totalSisa=DB.barang.reduce((a,b)=>{const s=getStok(b.id);return a+s.gudang+s.storing;},0);
  const todayTrx=[...DB.masuk,...DB.keluar,...DB.pindah].filter(x=>x.tanggal===today()).length;
  countUp(document.getElementById('d-barang'),DB.barang.length);
  countUp(document.getElementById('d-masuk'),totalMasuk);
  countUp(document.getElementById('d-keluar'),totalKeluar);
  countUp(document.getElementById('d-sisa'),totalSisa);
  document.getElementById('hb-barang').textContent=`📦 ${DB.barang.length} Barang`;
  document.getElementById('hb-supplier').textContent=`🏭 ${DB.supplier.filter(s=>s.status==='Aktif').length} Supplier Aktif`;
  document.getElementById('hb-trx').textContent=`📝 ${todayTrx} Transaksi Hari Ini`;
  const kritis=DB.barang.filter(b=>{const s=getStok(b.id);return(s.gudang+s.storing)<5;});
  const ap=document.getElementById('alert-panel');
  if(kritis.length){ap.classList.add('show');document.getElementById('alert-items').innerHTML=kritis.slice(0,5).map(b=>{const s=getStok(b.id),t=s.gudang+s.storing;return`<div class="alert-item"><span class="alert-item-name">📦 ${esc(b.nama)}</span><div style="display:flex;align-items:center;gap:8px"><span class="alert-item-stock ${t===0?'zero':'low'}">${fmt(t)} unit</span>${t===0?'<span class="badge bg-red">Habis</span>':'<span class="badge bg-amber">Kritis</span>'}<button class="btn btn-primary btn-sm" onclick="openModal('m-masuk')">+ Restock</button></div></div>`;}).join('');}
  else{ap.classList.remove('show');}
  const all=[...DB.masuk.map(x=>({...x,jenis:'masuk'})),...DB.keluar.map(x=>({...x,jenis:'keluar'})),...DB.pindah.map(x=>({...x,jenis:'pindah'}))].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')).slice(0,10);
  const tw=document.getElementById('timeline-wrap');
  tw.innerHTML=all.length===0?'<div class="empty"><span class="empty-ico">📭</span><p>Belum ada transaksi</p></div>':all.map(x=>{const cfg={masuk:{dot:'g',ico:'📥',label:'Masuk',detail:`+${fmt(x.qty)} ${x.satuan}`},keluar:{dot:'r',ico:'📤',label:'Keluar',detail:`-${fmt(x.qty)} ${x.satuan}`},pindah:{dot:'b',ico:'🔄',label:'Pindah',detail:`${x.dari}→${x.ke}`}};const c=cfg[x.jenis]||cfg.masuk;return`<div class="tl-item"><div class="tl-dot ${c.dot}">${c.ico}</div><div class="tl-content"><div class="tl-title">${esc(x.nama_barang||x.namaBrg)}</div><div class="tl-desc">${c.label} · <strong>${c.detail}</strong></div><div class="tl-time">🕐 ${x.tanggal}</div></div></div>`;}).join('');
  document.getElementById('d-kritis').innerHTML=kritis.length===0?`<tr><td colspan="3"><div class="empty"><span class="empty-ico">✅</span><p>Semua stok aman</p></div></td></tr>`:kritis.map(b=>{const s=getStok(b.id),t=s.gudang+s.storing;return`<tr><td><strong>${esc(b.nama)}</strong></td><td style="font-family:var(--mono);font-weight:800">${fmt(t)}</td><td>${t===0?'<span class="badge bg-red">Habis</span>':'<span class="badge bg-amber">Kritis</span>'}</td></tr>`;}).join('');
  buildTrendChart();buildDonutChart();
}

function renderMasterBarang() {
  const q=(document.getElementById('q-barang')?.value||'').toLowerCase();
  let f=DB.barang.filter(b=>b.nama.toLowerCase().includes(q)||b.id.toLowerCase().includes(q)||(b.part_number||'').toLowerCase().includes(q));
  document.getElementById('cnt-barang').textContent=`${f.length} barang terdaftar`;
  const paged=paginate(f,'barang');
  document.getElementById('tb-barang').innerHTML=paged.length===0?`<tr><td colspan="10"><div class="empty"><span class="empty-ico">📭</span><p>Belum ada barang</p></div></td></tr>`:paged.map((b,i)=>{const s=getStok(b.id),t=s.gudang+s.storing,st=t===0?'bg-red':t<5?'bg-amber':'bg-green';const foto=b.foto_url?`<img src="${b.foto_url}" class="foto-box">`:`<div class="foto-placeholder">📷</div>`;return`<tr><td style="color:var(--muted)">${(PAG.barang.p-1)*PAG.barang.pp+i+1}</td><td style="font-family:var(--mono);font-size:11px;font-weight:700">${esc(b.id)}</td><td>${foto}</td><td><strong>${esc(b.nama)}</strong></td><td style="font-family:var(--mono);color:var(--muted);font-size:12px">${esc(b.part_number)}</td><td style="color:var(--muted)">${esc(b.model||'—')}</td><td style="font-family:var(--mono);font-weight:700;color:var(--green)">${fmt(s.gudang)}</td><td style="font-family:var(--mono);font-weight:700;color:var(--blue)">${fmt(s.storing)}</td><td><span class="badge ${st}">${t===0?'Habis':t<5?'Kritis':'Aman'}</span></td><td><div class="td-act"><button class="btn btn-ghost btn-sm btn-icon" onclick="showQR(${JSON.stringify({id:b.id,nama:b.nama,part_number:b.part_number,model:b.model||''})})">📷</button><button class="btn btn-red btn-sm btn-icon" onclick="deleteItem('barang','${b.id}','${esc(b.nama)}')">🗑️</button></div></td></tr>`;}).join('');
  renderPag('pag-barang',f,'barang');
}
function renderSupplier(){const q=(document.getElementById('q-supplier')?.value||'').toLowerCase();const f=DB.supplier.filter(s=>s.nama.toLowerCase().includes(q)||s.id.toLowerCase().includes(q));document.getElementById('cnt-supplier').textContent=`${f.length} supplier`;document.getElementById('tb-supplier').innerHTML=f.length===0?`<tr><td colspan="8"><div class="empty"><span class="empty-ico">📭</span><p>Belum ada supplier</p></div></td></tr>`:f.map((s,i)=>`<tr><td style="color:var(--muted)">${i+1}</td><td style="font-family:var(--mono);font-size:11px;font-weight:700">${esc(s.id)}</td><td><strong>${esc(s.nama)}</strong></td><td style="color:var(--muted)">${esc(s.alamat||'—')}</td><td style="font-family:var(--mono)">${esc(s.telp||'—')}</td><td><span class="badge ${s.status==='Aktif'?'bg-green':'bg-red'}"><span class="dot ${s.status==='Aktif'?'dot-g':'dot-r'}"></span>${s.status}</span></td><td style="color:var(--muted)">${esc(s.keterangan||'—')}</td><td><button class="btn btn-red btn-sm btn-icon" onclick="deleteItem('supplier','${s.id}','${esc(s.nama)}')">🗑️</button></td></tr>`).join('');}
function renderSatuan(){const q=(document.getElementById('q-satuan')?.value||'').toLowerCase();const f=DB.satuan.filter(s=>s.nama.toLowerCase().includes(q));document.getElementById('cnt-satuan').textContent=`${f.length} satuan`;document.getElementById('tb-satuan').innerHTML=f.length===0?`<tr><td colspan="4"><div class="empty"><span class="empty-ico">📭</span><p>Belum ada satuan</p></div></td></tr>`:f.map((s,i)=>`<tr><td style="color:var(--muted)">${i+1}</td><td><strong>${esc(s.nama)}</strong></td><td style="color:var(--muted)">${esc(s.keterangan||'—')}</td><td><button class="btn btn-red btn-sm btn-icon" onclick="deleteItem('satuan','${s.id}','${esc(s.nama)}')">🗑️</button></td></tr>`).join('');}

function filterByDate(data,fromId,toId,key='tanggal'){const from=document.getElementById(fromId)?.value,to=document.getElementById(toId)?.value;return data.filter(x=>(!from||x[key]>=from)&&(!to||x[key]<=to));}

function renderMasuk(){const q=(document.getElementById('q-masuk')?.value||'').toLowerCase();let f=filterByDate(DB.masuk,'df-masuk-from','df-masuk-to').filter(m=>(m.nama_barang||m.namaBrg||'').toLowerCase().includes(q)||m.id.toLowerCase().includes(q)).sort((a,b)=>b.id.localeCompare(a.id));document.getElementById('cnt-masuk').textContent=`${f.length} transaksi`;const paged=paginate(f,'masuk');document.getElementById('tb-masuk').innerHTML=paged.length===0?`<tr><td colspan="11"><div class="empty"><span class="empty-ico">📭</span><p>Belum ada barang masuk</p></div></td></tr>`:paged.map((m,i)=>`<tr><td style="color:var(--muted)">${(PAG.masuk.p-1)*PAG.masuk.pp+i+1}</td><td style="font-family:var(--mono);font-size:11px">${esc(m.id)}</td><td style="color:var(--muted)">${m.tanggal||m.tgl}</td><td><strong>${esc(m.nama_barang||m.namaBrg)}</strong></td><td style="font-family:var(--mono);font-weight:800;color:var(--green)">+${fmt(m.qty)}</td><td style="color:var(--muted)">${esc(m.satuan)}</td><td style="font-family:var(--mono)">${fmtRp(m.harga)}</td><td>${esc(m.supplier_id||m.supplier||'—')}</td><td>${esc(m.penerima||'—')}</td><td style="color:var(--muted)">${esc(m.keterangan||m.ket||'—')}</td><td><button class="btn btn-red btn-sm btn-icon" onclick="deleteItem('masuk','${m.id}','${esc(m.nama_barang||m.namaBrg)}')">🗑️</button></td></tr>`).join('');renderPag('pag-masuk',f,'masuk');updateBadges();}
function renderKeluar(){const q=(document.getElementById('q-keluar')?.value||'').toLowerCase();let f=filterByDate(DB.keluar,'df-keluar-from','df-keluar-to').filter(k=>(k.nama_barang||k.namaBrg||'').toLowerCase().includes(q)||k.id.toLowerCase().includes(q)).sort((a,b)=>b.id.localeCompare(a.id));document.getElementById('cnt-keluar').textContent=`${f.length} transaksi`;const paged=paginate(f,'keluar');document.getElementById('tb-keluar').innerHTML=paged.length===0?`<tr><td colspan="13"><div class="empty"><span class="empty-ico">📭</span><p>Belum ada barang keluar</p></div></td></tr>`:paged.map((k,i)=>`<tr><td style="color:var(--muted)">${(PAG.keluar.p-1)*PAG.keluar.pp+i+1}</td><td style="font-family:var(--mono);font-size:11px">${esc(k.id)}</td><td style="color:var(--muted)">${k.tanggal||k.tgl}</td><td>${esc(k.no_lambung||k.lamb||'—')}</td><td style="font-family:var(--mono)">${k.kilometer||k.km?fmt(k.kilometer||k.km)+' km':'—'}</td><td><strong>${esc(k.nama_barang||k.namaBrg)}</strong></td><td style="font-family:var(--mono);font-weight:800;color:var(--red)">-${fmt(k.qty)}</td><td style="color:var(--muted)">${esc(k.satuan)}</td><td>${esc(k.mekanik||'—')}</td><td><span class="badge bg-blue">${k.lokasi_stok||k.stok}</span></td><td><span class="badge bg-gray" style="font-size:10px">${esc(k.penggunaan||k.guna)}</span></td><td style="color:var(--muted)">${esc(k.keterangan||k.ket||'—')}</td><td><button class="btn btn-red btn-sm btn-icon" onclick="deleteItem('keluar','${k.id}','${esc(k.nama_barang||k.namaBrg)}')">🗑️</button></td></tr>`).join('');renderPag('pag-keluar',f,'keluar');updateBadges();}
function renderPindah(){const q=(document.getElementById('q-pindah')?.value||'').toLowerCase();const f=DB.pindah.filter(p=>(p.nama_barang||p.namaBrg||'').toLowerCase().includes(q)||p.id.toLowerCase().includes(q)).sort((a,b)=>b.id.localeCompare(a.id));document.getElementById('cnt-pindah').textContent=`${f.length} transaksi`;document.getElementById('tb-pindah').innerHTML=f.length===0?`<tr><td colspan="9"><div class="empty"><span class="empty-ico">📭</span><p>Belum ada pindah</p></div></td></tr>`:f.map((p,i)=>`<tr><td style="color:var(--muted)">${i+1}</td><td style="font-family:var(--mono);font-size:11px">${esc(p.id)}</td><td style="color:var(--muted)">${p.tanggal||p.tgl}</td><td><strong>${esc(p.nama_barang||p.namaBrg)}</strong></td><td style="font-family:var(--mono)">${fmt(p.qty)}</td><td style="color:var(--muted)">${esc(p.satuan)}</td><td><span class="badge bg-red">${p.dari}</span></td><td><span class="badge bg-green">${p.ke}</span></td><td><button class="btn btn-red btn-sm btn-icon" onclick="deleteItem('pindah','${p.id}','${esc(p.nama_barang||p.namaBrg)}')">🗑️</button></td></tr>`).join('');}
function renderTransfer(){const q=(document.getElementById('q-transfer')?.value||'').toLowerCase();const f=DB.transfer.filter(t=>(t.nama_barang||t.namaBrg||'').toLowerCase().includes(q)||t.id.toLowerCase().includes(q)).sort((a,b)=>b.id.localeCompare(a.id));document.getElementById('cnt-transfer').textContent=`${f.length} transaksi`;document.getElementById('tb-transfer').innerHTML=f.length===0?`<tr><td colspan="10"><div class="empty"><span class="empty-ico">📭</span><p>Belum ada transfer</p></div></td></tr>`:f.map((t,i)=>`<tr><td style="color:var(--muted)">${i+1}</td><td style="font-family:var(--mono);font-size:11px">${esc(t.id)}</td><td style="color:var(--muted)">${t.tanggal||t.tgl}</td><td><strong>${esc(t.nama_barang||t.namaBrg)}</strong></td><td style="font-family:var(--mono)">${fmt(t.qty)}</td><td style="color:var(--muted)">${esc(t.satuan)}</td><td>${esc(t.vendor||'—')}</td><td>${esc(t.penerima||'—')}</td><td style="color:var(--muted)">${esc(t.keterangan||t.ket||'—')}</td><td><button class="btn btn-red btn-sm btn-icon" onclick="deleteItem('transfer','${t.id}','${esc(t.nama_barang||t.namaBrg)}')">🗑️</button></td></tr>`).join('');}
function renderOpname(){const q=(document.getElementById('q-opname')?.value||'').toLowerCase();const f=DB.barang.filter(b=>b.nama.toLowerCase().includes(q)||b.id.toLowerCase().includes(q));document.getElementById('tb-opname').innerHTML=f.length===0?`<tr><td colspan="8"><div class="empty"><span class="empty-ico">📭</span><p>Tambah barang terlebih dahulu</p></div></td></tr>`:f.map((b,i)=>{const s=getStok(b.id),sistem=s.gudang+s.storing,fisik=DB.opname[b.id]!==undefined?DB.opname[b.id]:'',selisih=fisik!==''?fisik-sistem:'',st=selisih===''?'<span class="badge bg-gray">Belum</span>':selisih===0?'<span class="badge bg-green">Sesuai</span>':selisih>0?'<span class="badge bg-blue">Lebih</span>':'<span class="badge bg-red">Kurang</span>';return`<tr><td style="color:var(--muted)">${i+1}</td><td style="font-family:var(--mono);font-size:11px">${esc(b.id)}</td><td><strong>${esc(b.nama)}</strong></td><td style="font-family:var(--mono);color:var(--muted);font-size:12px">${esc(b.part_number)}</td><td style="font-family:var(--mono);font-weight:700">${fmt(sistem)}</td><td><input class="opname-input" type="number" min="0" data-id="${b.id}" value="${fisik}" placeholder="0" oninput="liveSelisih(this,${sistem})"></td><td id="sel-${b.id}" style="font-family:var(--mono);font-weight:800">${selisih!==''?(selisih>=0?'+':'')+fmt(selisih):'—'}</td><td>${st}</td></tr>`;}).join('');}
function liveSelisih(inp,sistem){const bid=inp.dataset.id,fisik=parseInt(inp.value),el=document.getElementById('sel-'+bid);if(isNaN(fisik)||!el)return;const diff=fisik-sistem;el.textContent=(diff>=0?'+':'')+fmt(diff);el.style.color=diff<0?'var(--red)':diff>0?'var(--blue)':'var(--green)';}

let rekapLok='Semua';
function setLokasi(lok,el){rekapLok=lok;document.querySelectorAll('#chip-lokasi .chip').forEach(c=>c.classList.remove('active'));el.classList.add('active');renderRekap();}
function renderRekap(){document.getElementById('r-loksub').textContent=rekapLok==='Semua'?'Semua lokasi':'Lokasi: '+rekapLok;let tA=0,tM=0,tK=0,tS=0;const rows=DB.barang.map((b,i)=>{const stok=getStok(b.id),stokAwal=(rekapLok==='Gudang'?b.stok_gudang:rekapLok==='Storing'?b.stok_storing:(b.stok_gudang||0)+(b.stok_storing||0))||0,masuk=DB.masuk.filter(m=>m.barang_id===b.id&&(rekapLok==='Semua'||m.lokasi===rekapLok)).reduce((a,c)=>a+c.qty,0),keluar=DB.keluar.filter(k=>k.barang_id===b.id&&(rekapLok==='Semua'||k.lokasi_stok===rekapLok)).reduce((a,c)=>a+c.qty,0),sisa=rekapLok==='Gudang'?stok.gudang:rekapLok==='Storing'?stok.storing:stok.gudang+stok.storing,st=sisa===0?'bg-red':sisa<5?'bg-amber':'bg-green';tA+=stokAwal;tM+=masuk;tK+=keluar;tS+=sisa;return`<tr><td style="color:var(--muted)">${i+1}</td><td style="font-family:var(--mono);font-size:11px">${esc(b.id)}</td><td><strong>${esc(b.nama)}</strong></td><td style="font-family:var(--mono);color:var(--muted);font-size:12px">${esc(b.part_number)}</td><td style="color:var(--muted)">${esc(b.model||'—')}</td><td style="color:var(--muted)">—</td><td style="font-family:var(--mono)">${fmt(stokAwal)}</td><td style="font-family:var(--mono);font-weight:800;color:var(--green)">+${fmt(masuk)}</td><td style="font-family:var(--mono);font-weight:800;color:var(--red)">-${fmt(keluar)}</td><td style="font-family:var(--mono);font-size:15px;font-weight:800">${fmt(sisa)}</td><td><span class="badge ${st}">${sisa===0?'Habis':sisa<5?'Kritis':'Aman'}</span></td></tr>`;});countUp(document.getElementById('r-awal'),tA);countUp(document.getElementById('r-masuk'),tM);countUp(document.getElementById('r-keluar'),tK);countUp(document.getElementById('r-sisa'),tS);document.getElementById('tb-rekap').innerHTML=rows.length===0?`<tr><td colspan="11"><div class="empty"><span class="empty-ico">📋</span><p>Belum ada data</p></div></td></tr>`:rows.join('');}
function renderLapOpname(){const rows=DB.barang.map((b,i)=>{const s=getStok(b.id),sistem=s.gudang+s.storing,fisik=DB.opname[b.id]!==undefined?DB.opname[b.id]:null,selisih=fisik!==null?fisik-sistem:null,st=fisik===null?'<span class="badge bg-gray">Belum</span>':selisih===0?'<span class="badge bg-green">Sesuai</span>':selisih>0?'<span class="badge bg-blue">Lebih</span>':'<span class="badge bg-red">Kurang</span>';return`<tr><td style="color:var(--muted)">${i+1}</td><td style="font-family:var(--mono);font-size:11px">${esc(b.id)}</td><td><strong>${esc(b.nama)}</strong></td><td style="font-family:var(--mono);color:var(--muted);font-size:12px">${esc(b.part_number)}</td><td style="font-family:var(--mono)">${fmt(sistem)}</td><td style="font-family:var(--mono)">${fisik!==null?fmt(fisik):'—'}</td><td style="font-family:var(--mono);font-weight:800;color:${selisih<0?'var(--red)':selisih>0?'var(--blue)':'var(--green)'}">${selisih!==null?(selisih>=0?'+':'')+fmt(selisih):'—'}</td><td style="color:var(--muted);font-size:12px">${selisih!==null&&selisih!==0?(selisih>0?'Kelebihan':'Kekurangan'):''}</td><td>${st}</td></tr>`;});document.getElementById('tb-lap-opname').innerHTML=rows.length===0?`<tr><td colspan="9"><div class="empty"><span class="empty-ico">📑</span><p>Lakukan opname terlebih dahulu</p></div></td></tr>`:rows.join('');}

// Export tetap sama
function exportCSV(){if(!DB.barang.length){toast('Tidak ada data','err');return;}let csv='No,ID Barang,Nama Barang,Part Number,Model,Stok Gudang,Stok Storing,Total\n';DB.barang.forEach((b,i)=>{const s=getStok(b.id);csv+=`${i+1},"${b.id}","${b.nama}","${b.part_number}","${b.model||''}",${s.gudang},${s.storing},${s.gudang+s.storing}\n`;});const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download=`laporan-rekap-${today()}.csv`;a.click();toast('CSV diekspor');}
function exportPDF(){const{jsPDF}=window.jspdf;const doc=new jsPDF({orientation:'landscape'});doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(0,79,53);doc.text('LAPORAN REKAPITULASI STOK — StockPro',14,18);doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(100);doc.text(`Tanggal: ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}`,14,26);const rows=DB.barang.map((b,i)=>{const s=getStok(b.id);return[i+1,b.id,b.nama,b.part_number,b.model||'-',s.gudang,s.storing,s.gudang+s.storing,s.gudang+s.storing===0?'Habis':s.gudang+s.storing<5?'Kritis':'Aman'];});doc.autoTable({startY:32,head:[['#','ID','Nama Barang','Part No','Model','Gudang','Storing','Total','Status']],body:rows,styles:{fontSize:9,cellPadding:3},headStyles:{fillColor:[0,79,53],textColor:255,fontStyle:'bold'},alternateRowStyles:{fillColor:[240,250,245]}});doc.save(`laporan-rekap-${today()}.pdf`);toast('PDF diunduh 📄');}
function exportOpnameCSV(){let csv='No,ID,Nama,Part No,Stok Sistem,Stok Fisik,Selisih,Status\n';DB.barang.forEach((b,i)=>{const s=getStok(b.id),sistem=s.gudang+s.storing,fisik=DB.opname[b.id]!==undefined?DB.opname[b.id]:'',selisih=fisik!==''?fisik-sistem:'',status=fisik===''?'Belum':selisih===0?'Sesuai':selisih>0?'Lebih':'Kurang';csv+=`${i+1},"${b.id}","${b.nama}","${b.part_number}",${sistem},${fisik},${selisih},"${status}"\n`;});const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download=`laporan-opname-${today()}.csv`;a.click();toast('CSV Opname diekspor');}
function exportOpnamePDF(){const{jsPDF}=window.jspdf;const doc=new jsPDF();doc.setFont('helvetica','bold');doc.setFontSize(14);doc.setTextColor(0,79,53);doc.text('LAPORAN STOCK OPNAME — StockPro',14,18);const rows=DB.barang.map((b,i)=>{const s=getStok(b.id),sistem=s.gudang+s.storing,fisik=DB.opname[b.id]!==undefined?DB.opname[b.id]:'-',selisih=fisik!=='-'?fisik-sistem:'-',status=fisik==='-'?'Belum':selisih===0?'Sesuai':selisih>0?'Lebih':'Kurang';return[i+1,b.id,b.nama,b.part_number,sistem,fisik,selisih!=='-'?(selisih>=0?'+':'')+selisih:'-',status];});doc.autoTable({startY:28,head:[['#','ID','Nama Barang','Part No','Sistem','Fisik','Selisih','Status']],body:rows,styles:{fontSize:9},headStyles:{fillColor:[90,62,0],textColor:255,fontStyle:'bold'}});doc.save(`laporan-opname-${today()}.pdf`);toast('PDF Opname diunduh 📄');}

// ============================================================
// INIT
// ============================================================
(function init() {
  loadTheme();
  const d = new Date();
  document.getElementById('nav-date').textContent = d.toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short'});
  // Wrap existing content agar bisa disembunyikan saat login
  const content = document.querySelector('.navbar');
  if (content && !document.getElementById('app-wrapper')) {
    const wrapper = document.createElement('div');
    wrapper.id = 'app-wrapper';
    document.body.insertBefore(wrapper, document.body.firstChild);
    Array.from(document.body.children).forEach(el => { if(el.id !== 'app-wrapper') wrapper.appendChild(el); });
  }
  checkSession();
})();

// ============================================================
// IMPORT EXCEL — semua modul
// ============================================================

// Config kolom per tipe import
const IMPORT_CONFIG = {
  barang: {
    title: 'Import Data Barang',
    sub: 'Format: ID Barang, Nama Barang, Part Number, Model, Stok Gudang, Stok Storing',
    ico: '📦',
    headers: ['ID Barang','Nama Barang','Part Number','Model Kendaraan','Stok Gudang','Stok Storing'],
    keys:    ['id','nama','part_number','model','stok_gudang','stok_storing'],
    required: ['id','nama','part_number'],
    template: [
      ['ID Barang','Nama Barang','Part Number','Model Kendaraan','Stok Gudang','Stok Storing'],
      ['BRG-007','Filter Udara','FU-1122-A','Toyota Kijang','20','10'],
      ['BRG-008','Kampas Kopling','KK-3344-B','Mitsubishi Fuso','15','5'],
    ]
  },
  supplier: {
    title: 'Import Data Supplier',
    sub: 'Format: ID, Nama, Alamat, No. Telp, Status, Keterangan',
    ico: '🏭',
    headers: ['ID Supplier','Nama Supplier','Alamat','No. Telp','Status','Keterangan'],
    keys:    ['id','nama','alamat','telp','status','keterangan'],
    required: ['id','nama'],
    template: [
      ['ID Supplier','Nama Supplier','Alamat','No. Telp','Status','Keterangan'],
      ['SUP-004','PT. Abadi Jaya','Jl. Raya No.10, Surabaya','031-1234567','Aktif','Supplier baru'],
    ]
  },
  satuan: {
    title: 'Import Data Satuan',
    sub: 'Format: Nama Satuan, Keterangan',
    ico: '📏',
    headers: ['Nama Satuan','Keterangan'],
    keys:    ['nama','keterangan'],
    required: ['nama'],
    template: [
      ['Nama Satuan','Keterangan'],
      ['Botol','Satuan per botol'],
      ['Kaleng','Satuan per kaleng'],
    ]
  },
  masuk: {
    title: 'Import Barang Masuk',
    sub: 'Format: ID Transaksi, Tanggal, ID Barang, QTY, Satuan, Harga, ID Supplier, Penerima, Keterangan',
    ico: '📥',
    headers: ['ID Transaksi','Tanggal','ID Barang','QTY','Satuan','Harga','ID Supplier','Penerima','Keterangan'],
    keys:    ['id','tanggal','barang_id','qty','satuan','harga','supplier_id','penerima','keterangan'],
    required: ['tanggal','barang_id','qty','satuan'],
    template: [
      ['ID Transaksi','Tanggal','ID Barang','QTY','Satuan','Harga','ID Supplier','Penerima','Keterangan'],
      ['BM-001','2025-02-23','BRG-001','10','Pcs','45000','SUP-001','Budi','PO Februari'],
    ]
  },
  keluar: {
    title: 'Import Barang Keluar',
    sub: 'Format: ID, Tanggal, No.Lambung, KM, ID Barang, QTY, Satuan, Lokasi, Mekanik, Penggunaan, Keterangan',
    ico: '📤',
    headers: ['ID','Tanggal','No.Lambung','KM','ID Barang','QTY','Satuan','Lokasi Stok','Mekanik','Penggunaan','Keterangan'],
    keys:    ['id','tanggal','no_lambung','kilometer','barang_id','qty','satuan','lokasi_stok','mekanik','penggunaan','keterangan'],
    required: ['tanggal','barang_id','qty','satuan'],
    template: [
      ['ID','Tanggal','No.Lambung','KM','ID Barang','QTY','Satuan','Lokasi Stok','Mekanik','Penggunaan','Keterangan'],
      ['BK-001','2025-02-23','B 1234 AB','45000','BRG-001','2','Pcs','Gudang','Mekanik 1 - Budi','Breakdown',''],
    ]
  },
  pindah: {
    title: 'Import Barang Pindah',
    sub: 'Format: ID, Tanggal, ID Barang, QTY, Satuan, Dari, Ke',
    ico: '🔄',
    headers: ['ID','Tanggal','ID Barang','QTY','Satuan','Dari','Ke'],
    keys:    ['id','tanggal','barang_id','qty','satuan','dari','ke'],
    required: ['tanggal','barang_id','qty','dari','ke'],
    template: [
      ['ID','Tanggal','ID Barang','QTY','Satuan','Dari','Ke'],
      ['BP-001','2025-02-23','BRG-001','5','Pcs','Gudang','Storing'],
    ]
  },
  transfer: {
    title: 'Import Transfer Part List',
    sub: 'Format: ID, Tanggal, ID Barang, QTY, Satuan, Vendor, Penerima, Keterangan',
    ico: '📋',
    headers: ['ID','Tanggal','ID Barang','QTY','Satuan','Vendor','Penerima','Keterangan'],
    keys:    ['id','tanggal','barang_id','qty','satuan','vendor','penerima','keterangan'],
    required: ['tanggal','barang_id','qty'],
    template: [
      ['ID','Tanggal','ID Barang','QTY','Satuan','Vendor','Penerima','Keterangan'],
      ['TF-001','2025-02-23','BRG-001','3','Pcs','Bengkel Maju','Anton','Transfer rutin'],
    ]
  }
};

let currentImportType = null;
let importRows = [];
let importValidRows = [];

// ---- BUKA MODAL IMPORT ----
function openImport(type) {
  currentImportType = type;
  importRows = [];
  importValidRows = [];
  const cfg = IMPORT_CONFIG[type];
  document.getElementById('import-title').textContent = cfg.title;
  document.getElementById('import-sub').textContent = cfg.sub;
  document.getElementById('import-ico').textContent = cfg.ico;
  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('import-submit-btn').style.display = 'none';
  document.getElementById('import-file').value = '';
  document.getElementById('import-dropzone').style.display = 'flex';
  openModal('m-import');
}

// ---- DOWNLOAD TEMPLATE ----
function downloadTemplate(type) {
  const cfg = IMPORT_CONFIG[type];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(cfg.template);
  // Style header row width
  ws['!cols'] = cfg.headers.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, `template-${type}.xlsx`);
  toast(`Template ${cfg.title} diunduh 📋`);
}

// ---- HANDLE FILE DROP ----
function handleImportDrop(e) {
  e.preventDefault();
  document.getElementById('import-dropzone').style.borderColor = 'var(--green-light)';
  const file = e.dataTransfer.files[0];
  if (file) processImportFile(file);
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (file) processImportFile(file);
}

// ---- PROSES FILE EXCEL ----
function processImportFile(file) {
  if (!file.name.match(/\.(xlsx|xls)$/i)) {
    toast('File harus berformat .xlsx atau .xls', 'err');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast('Ukuran file maksimal 5MB', 'err');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      parseImportRows(rows);
    } catch(err) {
      toast('Gagal membaca file: ' + err.message, 'err');
    }
  };
  reader.readAsArrayBuffer(file);
}

// ---- PARSE & VALIDASI BARIS ----
function parseImportRows(rows) {
  const cfg = IMPORT_CONFIG[currentImportType];
  if (rows.length < 2) { toast('File kosong atau hanya ada header', 'warn'); return; }

  // Skip baris pertama (header)
  const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''));
  importRows = [];
  importValidRows = [];
  const errors = [];

  dataRows.forEach((row, i) => {
    const obj = {};
    cfg.keys.forEach((key, ki) => {
      let val = row[ki] !== undefined ? String(row[ki]).trim() : '';
      // Format tanggal
      if (key === 'tanggal' && val) {
        if (val.includes('/')) val = val.split('/').reverse().join('-'); // dd/mm/yyyy → yyyy-mm-dd
        else if (val.match(/^\d{2}-\d{2}-\d{4}$/)) val = val.split('-').reverse().join('-');
        else if (val instanceof Date) val = val.toISOString().split('T')[0];
      }
      // Konversi angka
      if (['qty','stok_gudang','stok_storing','harga','kilometer'].includes(key)) {
        val = parseInt(val) || 0;
      }
      obj[key] = val;
    });

    // Generate ID jika kosong
    if (!obj.id && cfg.keys.includes('id')) {
      const prefix = {barang:'BRG',supplier:'SUP',masuk:'BM',keluar:'BK',pindah:'BP',transfer:'TF'}[currentImportType]||'ID';
      obj.id = `${prefix}-IMP-${String(i+1).padStart(3,'0')}`;
    }

    // Validasi required
    const missing = cfg.required.filter(k => !obj[k] || obj[k] === '0' && k !== 'qty');
    if (missing.length) {
      errors.push(`Baris ${i+2}: kolom "${missing.join(', ')}" wajib diisi`);
      obj._error = true;
    }

    // Validasi barang_id exists
    if (obj.barang_id && !DB.barang.find(b => b.id === obj.barang_id)) {
      errors.push(`Baris ${i+2}: ID Barang "${obj.barang_id}" tidak ditemukan`);
      obj._error = true;
    }

    importRows.push(obj);
    if (!obj._error) importValidRows.push(obj);
  });

  renderImportPreview(errors);
}

// ---- RENDER PREVIEW TABEL ----
function renderImportPreview(errors) {
  const cfg = IMPORT_CONFIG[currentImportType];
  document.getElementById('import-preview').style.display = 'block';
  document.getElementById('import-dropzone').style.display = 'none';
  document.getElementById('import-preview-title').textContent = `Preview: ${importRows.length} baris ditemukan`;
  document.getElementById('import-ok-count').textContent = `${importValidRows.length} valid`;

  const errEl = document.getElementById('import-err-count');
  const errNum = importRows.length - importValidRows.length;
  if (errNum > 0) {
    errEl.textContent = `${errNum} error`; errEl.style.display = '';
    document.getElementById('import-errors').style.display = 'block';
    document.getElementById('import-error-list').innerHTML = errors.map(e => `<div>⚠️ ${esc(e)}</div>`).join('');
  } else {
    errEl.style.display = 'none';
    document.getElementById('import-errors').style.display = 'none';
  }

  // Header
  document.getElementById('import-thead').innerHTML = `<th style="color:var(--muted);font-size:11px">#</th>` +
    cfg.headers.map(h => `<th style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;padding:8px 10px">${h}</th>`).join('') +
    `<th style="font-size:11px">Status</th>`;

  // Body
  document.getElementById('import-tbody').innerHTML = importRows.slice(0,50).map((row, i) => {
    const cells = cfg.keys.map(k => `<td style="font-size:12px;padding:7px 10px">${esc(String(row[k]||'—'))}</td>`).join('');
    const status = row._error
      ? `<td><span class="badge bg-red">Error</span></td>`
      : `<td><span class="badge bg-green">✓ Valid</span></td>`;
    return `<tr style="${row._error ? 'background:var(--red-bg);opacity:0.8' : ''}">${`<td style="color:var(--muted);font-size:11px;padding:7px 10px">${i+1}</td>`}${cells}${status}</tr>`;
  }).join('');

  if (importValidRows.length > 0) {
    document.getElementById('import-submit-btn').style.display = '';
    document.getElementById('import-submit-btn').textContent = `📥 Import ${importValidRows.length} Data`;
  } else {
    document.getElementById('import-submit-btn').style.display = 'none';
    toast('Tidak ada data valid untuk diimport', 'warn');
  }
}

// ---- SUBMIT IMPORT KE SUPABASE ----
async function submitImport() {
  if (!importValidRows.length) return;
  const btn = document.getElementById('import-submit-btn');
  btn.textContent = '⏳ Mengimport...';
  btn.disabled = true;

  const tableMap = {
    barang:'barang', supplier:'supplier', satuan:'satuan',
    masuk:'barang_masuk', keluar:'barang_keluar',
    pindah:'barang_pindah', transfer:'transfer_part'
  };
  const table = tableMap[currentImportType];

  // Tambahkan created_by
  const rows = importValidRows.map(r => {
    const clean = {...r};
    delete clean._error;
    if (table !== 'barang' && table !== 'supplier' && table !== 'satuan') {
      clean.created_by = SESSION?.user?.id || null;
      // Isi nama_barang otomatis
      if (clean.barang_id) {
        const b = DB.barang.find(x => x.id === clean.barang_id);
        if (b) clean.nama_barang = b.nama;
      }
    }
    return clean;
  });

  try {
    // Upsert dengan batch 50 baris
    const batchSize = 50;
    let imported = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await sb.from(table).upsert(batch, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      imported += batch.length;
    }
    closeModal('m-import');
    await loadAllData();
    // Refresh halaman yang sedang aktif
    const R = {
      barang:renderMasterBarang, supplier:renderSupplier, satuan:renderSatuan,
      masuk:renderMasuk, keluar:renderKeluar, pindah:renderPindah, transfer:renderTransfer
    };
    if (R[currentImportType]) R[currentImportType]();
    renderDashboard();
    toast(`✅ Berhasil import ${imported} data ${currentImportType}`);
  } catch(e) {
    toast('Import gagal: ' + e.message, 'err');
    btn.textContent = `📥 Import ${importValidRows.length} Data`;
    btn.disabled = false;
  }
}
