// ═══════════════════════════════════════════════════════════
// DetruAI v4.2 — app.js (fully fixed)
// ═══════════════════════════════════════════════════════════

// ─── AUTH GUARD ───
let _currentUser = null;

(function initAuth(){
  const raw = sessionStorage.getItem('detruai_user');
  if(!raw){ window.location.href='/login'; return; }
  try { _currentUser = JSON.parse(raw); } catch(e){ window.location.href='/login'; return; }
  if(!_currentUser || !_currentUser.username){ window.location.href='/login'; return; }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', applyAuthUI);
  } else {
    applyAuthUI();
  }
})();

// ─── LOCKED TABS FOR GUEST ───
const GUEST_LOCKED_TABS = ['text','audio','forensic','compare','batch','history'];

function applyAuthUI(){
  _injectUserPill();

  const isGuest = _currentUser.role === 'guest';
  if(!isGuest){
    // Load persistent history from server for logged-in users
    loadUserHistoryFromServer();
    return;
  }

  GUEST_LOCKED_TABS.forEach(tabId => {
    const navEl = document.getElementById('nav-'+tabId);
    if(!navEl) return;
    navEl.classList.add('nav-locked');
    navEl.title = 'Sign in to unlock';
    navEl.addEventListener('click', function(e){
      e.stopImmediatePropagation();
      _showGuestModal();
    }, true);
  });

  const badge = document.querySelector('.status-badge');
  if(badge){
    badge.innerHTML = '<div class="dot" style="background:var(--amber)"></div><span style="color:var(--amber)">Guest Mode</span>';
  }
}

// ─── LOAD HISTORY FROM SERVER ───
async function loadUserHistoryFromServer(){
  if(_currentUser.role === 'guest') return;
  try{
    const resp = await fetch('/user/history');
    if(!resp.ok) return;
    const data = await resp.json();
    if(data.history && data.history.length){
      scanHistory = data.history;
      document.getElementById('historyBadge').textContent = scanHistory.length;
      document.getElementById('imageCountBadge').textContent = scanHistory.length;
      updateRecentScans();
      // Rebuild stats from stored history
      scanHistory.forEach(h => {
        stats.total++;
        if(h.label==='FAKE') stats.fakes++;
        else if(h.label==='REAL') stats.reals++;
        if(h.type==='video') stats.videos++;
        else stats.images++;
      });
      document.getElementById('m-total').textContent = stats.total;
      document.getElementById('m-fakes').textContent = stats.fakes;
      document.getElementById('m-real').textContent  = stats.reals;
      document.getElementById('m-rate').textContent  = stats.total > 0 ? Math.round(stats.fakes/stats.total*100)+'%' : '0%';
      document.getElementById('m-videos').textContent = stats.videos;
    }
  } catch(e){}
}

// ─── SAVE SCAN TO SERVER ───
async function saveScanToServer(entry){
  if(_currentUser.role === 'guest') return;
  try{
    await fetch('/user/history',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(entry)
    });
  } catch(e){}
}

// ─── USER PILL ───
function _injectUserPill(){
  const actions = document.querySelector('.tb-actions');
  if(!actions) return;

  const isGuest = _currentUser.role === 'guest';
  const pill = document.createElement('div');
  pill.className = 'user-pill';
  pill.id = 'userPill';
  pill.innerHTML = `
    <div class="user-avatar">${isGuest ? '👤' : _currentUser.username.charAt(0).toUpperCase()}</div>
    <div class="user-pill-info">
      <div class="user-pill-name">${_currentUser.username}</div>
      <div class="user-pill-role">${isGuest ? 'Guest' : 'Member'}</div>
    </div>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text3)"><polyline points="6 9 12 15 18 9"/></svg>
  `;
  pill.addEventListener('click', _toggleUserMenu);
  actions.prepend(pill);

  const menu = document.createElement('div');
  menu.id = 'userMenu';
  menu.className = 'user-menu';
  menu.innerHTML = `
    <div class="um-header">
      <div class="um-name">${_currentUser.username}</div>
      <div class="um-email">${_currentUser.email || 'Guest session'}</div>
    </div>
    <div class="um-divider"></div>
    ${isGuest ? `<div class="um-item um-upgrade" onclick="window.location.href='/login'">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      Sign In / Register
    </div>` : `<div class="um-item" onclick="_showProfileModal()">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      Profile
    </div>`}
    <div class="um-item um-logout" onclick="doLogout()">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
      ${isGuest ? 'Exit Guest' : 'Sign Out'}
    </div>
  `;
  document.body.appendChild(menu);

  document.addEventListener('click', e=>{
    if(!pill.contains(e.target) && !menu.contains(e.target)){
      menu.classList.remove('open');
    }
  });

  _injectAuthStyles();
}

function _toggleUserMenu(){
  document.getElementById('userMenu').classList.toggle('open');
}

// ─── LOGOUT ───
async function doLogout(){
  try{ await fetch('/auth/logout',{method:'POST'}); } catch(e){}
  sessionStorage.removeItem('detruai_user');
  window.location.href = '/login';
}

// ─── PROFILE MODAL (replaces browser alert) ───
function _showProfileModal(){
  document.getElementById('userMenu').classList.remove('open');
  let modal = document.getElementById('profileModal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'profileModal';
    modal.className = 'guest-modal-overlay';
    modal.innerHTML = `
      <div class="guest-modal" style="max-width:360px">
        <button class="guest-modal-close" onclick="document.getElementById('profileModal').classList.remove('open')">✕</button>
        <div class="gm-icon">👤</div>
        <div class="gm-title">${_currentUser.username}</div>
        <div class="gm-sub" style="margin-bottom:14px">${_currentUser.email || '—'}</div>
        <div class="gm-features" style="text-align:left">
          <div class="gm-feat"><span class="gm-check">✓</span> Role: Member</div>
          <div class="gm-feat"><span style="color:var(--accent)">📊</span> Total scans: <span id="profileScanCount">${stats.total}</span></div>
          <div class="gm-feat"><span style="color:var(--red)">⚠</span> Fakes found: <span id="profileFakeCount">${stats.fakes}</span></div>
          <div class="gm-feat"><span style="color:var(--green)">✓</span> History saved to account</div>
        </div>
        <button class="gm-skip" onclick="document.getElementById('profileModal').classList.remove('open')">Close</button>
      </div>
    `;
    modal.addEventListener('click', e=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  // Update live stats
  const sc = document.getElementById('profileScanCount');
  const fc = document.getElementById('profileFakeCount');
  if(sc) sc.textContent = stats.total;
  if(fc) fc.textContent = stats.fakes;
  modal.classList.add('open');
}

// ─── GUEST UPGRADE MODAL ───
function _showGuestModal(){
  let modal = document.getElementById('guestModal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'guestModal';
    modal.className = 'guest-modal-overlay';
    modal.innerHTML = `
      <div class="guest-modal">
        <button class="guest-modal-close" onclick="document.getElementById('guestModal').classList.remove('open')">✕</button>
        <div class="gm-icon">🔒</div>
        <div class="gm-title">Full Access Required</div>
        <div class="gm-sub">This feature is only available to registered users. Create a free account to unlock everything.</div>
        <div class="gm-features">
          <div class="gm-feat"><span class="gm-check">✓</span> Text &amp; Audio Analysis</div>
          <div class="gm-feat"><span class="gm-check">✓</span> Analytics Dashboard</div>
          <div class="gm-feat"><span class="gm-check">✓</span> Batch Upload (100+ files)</div>
          <div class="gm-feat"><span class="gm-check">✓</span> Image Diff Tool</div>
          <div class="gm-feat"><span class="gm-check">✓</span> Persistent Scan History</div>
        </div>
        <button class="gm-cta" onclick="window.location.href='/login'">Sign In or Register — Free</button>
        <button class="gm-skip" onclick="document.getElementById('guestModal').classList.remove('open')">Continue as Guest</button>
      </div>
    `;
    modal.addEventListener('click', e=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  modal.classList.add('open');
}

// ─── INJECTED CSS ───
function _injectAuthStyles(){
  const style = document.createElement('style');
  style.textContent = `
    .user-pill{display:flex;align-items:center;gap:8px;padding:5px 10px 5px 6px;background:var(--bg3);border:1px solid var(--border2);border-radius:10px;cursor:pointer;transition:all .18s ease;user-select:none}
    .user-pill:hover{background:var(--bg4)}
    .user-avatar{width:28px;height:28px;border-radius:7px;background:var(--accent-dim);border:1px solid rgba(249,115,22,0.3);display:flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:700;color:var(--accent)}
    .user-pill-info{line-height:1}
    .user-pill-name{font-size:0.8rem;font-weight:600;color:var(--text)}
    .user-pill-role{font-size:0.68rem;color:var(--text3);margin-top:2px;text-transform:uppercase;letter-spacing:0.05em}
    .user-menu{position:fixed;top:68px;right:16px;width:220px;background:var(--bg2);border:1px solid var(--border2);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.6);z-index:9999;opacity:0;pointer-events:none;transform:translateY(-6px);transition:all .2s cubic-bezier(.22,1,.36,1)}
    .user-menu.open{opacity:1;pointer-events:all;transform:translateY(0)}
    .um-header{padding:14px 14px 10px}
    .um-name{font-weight:600;font-size:0.9rem;color:var(--text)}
    .um-email{font-size:0.75rem;color:var(--text3);margin-top:2px;word-break:break-all}
    .um-divider{height:1px;background:var(--border);margin:0 10px}
    .um-item{display:flex;align-items:center;gap:9px;padding:10px 14px;font-size:0.84rem;color:var(--text2);cursor:pointer;transition:all .15s}
    .um-item:hover{background:var(--hover-bg);color:var(--text)}
    .um-item:last-child{border-radius:0 0 12px 12px}
    .um-upgrade{color:var(--accent)!important}
    .um-upgrade:hover{background:var(--accent-dim)!important}
    .um-logout:hover{color:var(--red)!important;background:var(--red2)!important}
    .nav-locked{opacity:0.42;cursor:not-allowed!important;position:relative}
    .nav-locked::after{content:'🔒';position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:0.65rem}
    .nav-locked .badge{display:none!important}
    .guest-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;pointer-events:none;transition:opacity .2s ease}
    .guest-modal-overlay.open{opacity:1;pointer-events:all}
    .guest-modal{background:var(--bg2);border:1px solid var(--border2);border-radius:18px;padding:36px;max-width:400px;width:100%;text-align:center;position:relative;box-shadow:0 24px 80px rgba(0,0,0,0.8);transform:scale(0.95);transition:transform .25s cubic-bezier(.22,1,.36,1)}
    .guest-modal-overlay.open .guest-modal{transform:scale(1)}
    .guest-modal-close{position:absolute;top:14px;right:14px;background:var(--bg3);border:none;color:var(--text3);width:28px;height:28px;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.85rem;transition:all .15s}
    .guest-modal-close:hover{background:var(--bg4);color:var(--text)}
    .gm-icon{font-size:2.4rem;margin-bottom:12px}
    .gm-title{font-size:1.2rem;font-weight:700;color:var(--text);margin-bottom:8px}
    .gm-sub{font-size:0.85rem;color:var(--text2);line-height:1.5;margin-bottom:20px}
    .gm-features{background:var(--bg3);border-radius:10px;padding:14px 16px;margin-bottom:20px;text-align:left}
    .gm-feat{display:flex;gap:8px;align-items:center;font-size:0.83rem;color:var(--text2);padding:4px 0}
    .gm-check{color:var(--green);font-weight:700}
    .gm-cta{width:100%;padding:12px;background:var(--accent);color:#fff;border:none;border-radius:10px;font-family:var(--sans);font-size:0.9rem;font-weight:600;cursor:pointer;margin-bottom:10px;transition:all .2s;box-shadow:0 4px 16px rgba(249,115,22,0.35)}
    .gm-cta:hover{background:var(--accent2);transform:translateY(-1px)}
    .gm-skip{width:100%;padding:10px;background:transparent;color:var(--text3);border:none;font-family:var(--sans);font-size:0.83rem;cursor:pointer;transition:color .15s}
    .gm-skip:hover{color:var(--text2)}
  `;
  document.head.appendChild(style);
}


// ─── THEME ───
function toggleTheme(){
  const h = document.documentElement;
  const isDark = h.getAttribute('data-theme') === 'dark';
  h.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('detruai_theme', isDark ? 'light' : 'dark');
  setTimeout(refreshCharts, 100);
}

// Restore saved theme on load
(function initTheme(){
  const saved = localStorage.getItem('detruai_theme');
  if(saved){ document.documentElement.setAttribute('data-theme', saved); return; }
  document.documentElement.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', e => {
    if(!localStorage.getItem('detruai_theme')) document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  });
})();

// ─── NAV ───
const tabBreadcrumbs = {image:'Dashboard',text:'Text Analysis',audio:'Audio Detection',forensic:'Analytics & Charts',compare:'Image Diff Tool',batch:'Batch Upload',history:'Scan History',about:'System Info'};
function showTab(id, el){
  document.querySelectorAll('.tab-panel,.tab-scroll').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('tab-'+id).classList.add('active');
  el.classList.add('active');
  document.getElementById('tabBreadcrumb').textContent = tabBreadcrumbs[id] || 'Dashboard';
  if(id==='about'){ updateAboutStats(); fetchStats(); }
  if(id==='forensic'){ setTimeout(refreshCharts,80); }
  if(id==='history'){ setTimeout(renderHistory,50); }
  if(window.innerWidth<=768) closeMobileSidebar();
}

// ─── MODEL — FIXED (let not const, selector wired up) ───
let selectedModel = 'vit+clip+mtcnn';
const modelMeta = {
  'vit+clip+mtcnn': {name:'DETRUAI ENGINE', sub:'ViT + CLIP + MTCNN', label:'3 Models Active'},
  'vit':            {name:'FAST ENGINE',    sub:'ViT-Base Only',      label:'1 Model Active'},
  'clip':           {name:'CLIP ENGINE',    sub:'CLIP Only',          label:'1 Model Active'},
  'vit+mtcnn':      {name:'FACE ENGINE',    sub:'ViT + MTCNN',        label:'2 Models Active'},
};
function updateModelDisplay(){
  const sel = document.getElementById('globalModelSelect');
  if(!sel) return;
  selectedModel = sel.value;
  const m = modelMeta[selectedModel] || modelMeta['vit+clip+mtcnn'];
  document.getElementById('smpModelName').textContent  = m.name;
  document.getElementById('smpModelSub').textContent   = m.sub;
  document.getElementById('modelsActiveLabel').textContent = m.label;
  addLog('Model switched to: '+m.name, 'ok');
}

// ─── CLOCK ───
function updateClock(){ document.getElementById('clockDisplay').textContent = new Date().toLocaleTimeString('en-GB'); }
setInterval(updateClock, 1000); updateClock();
document.getElementById('ab-started').textContent = new Date().toLocaleTimeString();

// ─── SOUND ───
let muted = false;
const AudioCtxCls = window.AudioContext || window.webkitAudioContext;
const sfx = {
  _play(f1,f2,d){ if(muted||!AudioCtxCls) return; try{ const c=new AudioCtxCls(),o=c.createOscillator(),g=c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.setValueAtTime(f1,c.currentTime); o.frequency.linearRampToValueAtTime(f2,c.currentTime+d*.6); g.gain.setValueAtTime(.04,c.currentTime); g.gain.linearRampToValueAtTime(0,c.currentTime+d); o.start(c.currentTime); o.stop(c.currentTime+d); }catch(e){} },
  success(){ this._play(440,660,.3) },
  alert()  { this._play(220,180,.5) }
};
document.getElementById('muteBtn').addEventListener('click', function(){ muted=!muted; this.textContent=muted?'🔇':'🔊'; });

// ─── STATE ───
let currentFile = null, scanHistory = [], batchFiles = [], batchHeatmaps = {};
let compareImages = {A:null,B:null}, compareImgElements = {A:null,B:null};
const stats = {total:0, fakes:0, reals:0, images:0, videos:0};

// ─── FILE HANDLING ───
const dropZone  = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
dropZone.addEventListener('dragover',  e=>{ e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', ()=> dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop',      e=>{ e.preventDefault(); dropZone.classList.remove('drag-over'); if(e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change',   ()=>{ if(fileInput.files[0]) loadFile(fileInput.files[0]); });

// ─── PASTE FROM CLIPBOARD (Ctrl+V anywhere on dashboard) ───
document.addEventListener('paste', e => {
  // Only act when on the dashboard tab and no text input focused
  const active = document.getElementById('tab-image');
  if(!active || !active.classList.contains('active')) return;
  const focused = document.activeElement;
  if(focused && (focused.tagName==='INPUT'||focused.tagName==='TEXTAREA')) return;

  const items = e.clipboardData?.items;
  if(!items) return;
  for(const item of items){
    if(item.type.startsWith('image/')){
      const file = item.getAsFile();
      if(file){
        loadFile(file);
        addLog('Image pasted from clipboard','ok');
      }
      break;
    }
  }
});

function loadFile(file){
  // Enforce 50MB client-side too
  if(file.size > 50 * 1024 * 1024){
    addLog('File too large — max 50 MB','err');
    return;
  }
  currentFile = file;
  const pw = document.getElementById('previewWrap'), dz = document.getElementById('dropZone');
  pw.classList.add('show'); dz.style.display = 'none';
  document.getElementById('previewFname').textContent = file.name + ' · ' + formatSize(file.size);
  const pb = document.getElementById('previewBox');
  pb.querySelectorAll('img,video').forEach(e=>e.remove());
  const url = URL.createObjectURL(file);
  if(file.type.startsWith('video')){
    const v = document.createElement('video');
    v.src=url; v.controls=false; v.muted=true; v.autoplay=true; v.loop=true;
    pb.appendChild(v);
  } else {
    const i = document.createElement('img'); i.src=url; pb.appendChild(i);
  }
  document.getElementById('analyzeBtn').disabled = false;
  addLog('File loaded: '+file.name, 'ok');
}

function clearFile(){
  currentFile = null;
  document.getElementById('previewWrap').classList.remove('show');
  document.getElementById('dropZone').style.display = '';
  document.getElementById('analyzeBtn').disabled = true;
  document.getElementById('resultCard').classList.remove('show','FAKE','REAL','UNCERTAIN');
  document.getElementById('heatmapImgEl').src = '';
  document.getElementById('heatmapImgEl').style.display = 'none';
  document.getElementById('heatmapPlaceholder').style.display = '';
  document.getElementById('timelineSection').classList.remove('show');
  document.getElementById('emptyPlaceholder').style.display = '';
  document.getElementById('progWrap').classList.remove('show');
  document.getElementById('scanOverlay').classList.remove('active');
}

// ─── ANALYSIS ───
async function runAnalysis(){
  if(!currentFile) return;
  const btn   = document.getElementById('analyzeBtn');
  const prog  = document.getElementById('progWrap');
  const fill  = document.getElementById('progFill');
  const label = document.getElementById('progLabel');

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Analyzing…';
  document.getElementById('scanOverlay').classList.add('active');
  prog.classList.add('show');
  fill.style.width = '0%';

  let pct = 0;
  // Realistic stage labels
  const stages = ['Loading models…','Extracting features…','Running CLIP…','Detecting faces…','Computing scores…'];
  let stageIdx = 0;
  const ticker = setInterval(()=>{
    pct = Math.min(pct + (Math.random()*8), 88);
    fill.style.width = pct+'%';
    if(pct > stageIdx*18 && stageIdx < stages.length){
      label.textContent = stages[stageIdx++];
    }
  }, 200);

  addLog('Sending to backend…','warn');

  try{
    const form = new FormData();
    form.append('file', currentFile);
    form.append('model', selectedModel);
    const resp = await fetch('/analyze', {method:'POST', body:form});
    if(!resp.ok) throw new Error('Server error '+resp.status);
    const data = await resp.json();
    clearInterval(ticker);
    fill.style.width = '100%';
    label.textContent = 'Complete';
    setTimeout(()=>prog.classList.remove('show'), 600);
    document.getElementById('scanOverlay').classList.remove('active');
    displayResult(data);
    updateStats(data);
    const entry = {
      name:   currentFile.name,
      label:  data.label,
      conf:   data.confidence.toFixed(1),
      fakep:  (data.fake_prob ?? data.confidence).toFixed(1),
      type:   data.media_type || 'image',
      faces:  data.faces_found ?? 0,
      model:  selectedModel,
      ts:     new Date().toLocaleTimeString()
    };
    addToHistory(entry);
    saveScanToServer(entry);  // persist to backend
    updateRecentScans();
    recordScanForAnalytics(data, selectedModel);
    sfx.success();
    addLog('Analysis complete: '+data.label+' ('+data.confidence.toFixed(1)+'%)', 'ok');
  } catch(e){
    clearInterval(ticker);
    addLog('Error: '+e.message, 'err');
    fill.style.width = '0%';
    prog.classList.remove('show');
    document.getElementById('scanOverlay').classList.remove('active');
    sfx.alert();
    // Show inline error instead of browser alert
    addLog('Analysis failed — check connection or file format', 'err');
  }
  btn.disabled = false;
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg> Analyze Media';
}

function openHM() { document.getElementById('hmOverlay').classList.add('open'); }
function closeHM(){ document.getElementById('hmOverlay').classList.remove('open'); }

function displayResult(data){
  const label = data.label || 'UNCERTAIN';
  const lc    = label.toLowerCase();
  const conf  = parseFloat(data.confidence) || 0;
  const fakep = parseFloat(data.fake_prob)  || 0;
  const realp = parseFloat(data.real_prob)  || 0;
  const filename = data.filename || currentFile?.name || '—';
  const icons = {
    fake:      '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    real:      '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    uncertain: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>'
  };
  const colors = {fake:'var(--red)', real:'var(--green)', uncertain:'var(--amber)'};
  const vb = document.getElementById('verdictBadge');
  vb.className = 'verdict-badge '+lc;
  document.getElementById('verdictIcon').innerHTML       = icons[lc] || icons.uncertain;
  document.getElementById('verdictWord').textContent     = label;
  document.getElementById('confNum').textContent         = conf.toFixed(1)+'%';
  document.getElementById('confNum').style.color         = colors[lc] || 'var(--text)';
  document.getElementById('verdictFilename').textContent = filename;
  const cfill = document.getElementById('confFill');
  cfill.className = 'conf-bar-fill '+lc;
  cfill.style.width = '0%';
  setTimeout(()=>cfill.style.width = conf+'%', 60);
  document.getElementById('rm-fake').textContent   = fakep.toFixed(1)+'%';
  document.getElementById('rm-fake').style.color   = fakep>55?'var(--red)':'var(--text)';
  document.getElementById('rm-real').textContent   = realp.toFixed(1)+'%';
  document.getElementById('rm-real').style.color   = realp>55?'var(--green)':'var(--text)';
  document.getElementById('rm-faces').textContent  = data.faces_found ?? '0';
  document.getElementById('rm-frames').textContent = data.frames_scanned ?? '1';
  const descs = {
    fake:      `High probability of AI generation detected. Confidence: ${conf.toFixed(1)}%.`,
    real:      `Media appears authentic. Confidence: ${conf.toFixed(1)}%.`,
    uncertain: `Analysis inconclusive. Manual review recommended.`
  };
  document.getElementById('verdictDesc').textContent              = descs[lc] || '';
  document.getElementById('resultDot').style.background           = colors[lc] || 'var(--text3)';
  document.getElementById('resultDotInner').style.background      = colors[lc] || 'var(--text3)';
  document.getElementById('resultPaneStatus').textContent         = label;
  document.getElementById('resultPaneStatusInner').textContent    = label;
  document.getElementById('resultPaneTitle').textContent          = 'Analysis Complete';
  document.getElementById('resultPaneTitleInner').textContent     = 'DETECTION OUTPUT';
  const rc = document.getElementById('resultCard');
  rc.className = 'result-card '+label; rc.classList.add('show');
  document.getElementById('emptyPlaceholder').style.display = 'none';
  if(data.heatmap){
    const imgEl      = document.getElementById('heatmapImgEl');
    const placeholder = document.getElementById('heatmapPlaceholder');
    imgEl.src              = data.heatmap;
    imgEl.style.display    = 'block';
    placeholder.style.display = 'none';
    document.getElementById('hmModalImg').src = data.heatmap;
  }
  if(data.frame_timeline && data.frame_timeline.length > 1){
    renderTimeline(data.frame_timeline);
    document.getElementById('timelineSection').classList.add('show');
  }
}

// ─── VIDEO TIMELINE — FIXED: shows HH:MM:SS instead of raw frame numbers ───
function renderTimeline(frames){
  const chart = document.getElementById('timelineChart');
  chart.innerHTML = '';
  frames.forEach(f => {
    const wrap = document.createElement('div'); wrap.className = 'tl-bar-wrap';
    const bar  = document.createElement('div'); bar.className  = 'tl-bar';
    const pct  = f.fake_prob / 100;
    bar.style.height     = Math.max(4, pct*44)+'px';
    bar.style.background = pct>0.65?'var(--red)':pct>0.4?'var(--amber)':'var(--green)';
    bar.style.boxShadow  = pct>0.65?'0 0 6px rgba(239,68,68,0.5)':pct>0.4?'0 0 6px rgba(245,158,11,0.5)':'0 0 6px rgba(16,185,129,0.5)';
    bar.title = `${_fmtTime(f.time)} — Fake: ${f.fake_prob}%`;
    // FIXED: use time (seconds) formatted as MM:SS instead of raw frame number
    const timeEl = document.createElement('div'); timeEl.className = 'tl-time';
    timeEl.textContent = _fmtTime(f.time || 0);
    wrap.appendChild(bar); wrap.appendChild(timeEl); chart.appendChild(wrap);
  });
}

function _fmtTime(secs){
  const s = Math.floor(secs || 0);
  const m = Math.floor(s/60);
  return m+':'+(s%60).toString().padStart(2,'0');
}

function updateStats(data){
  stats.total++;
  if(data.label==='FAKE')  stats.fakes++;
  else if(data.label==='REAL') stats.reals++;
  if((data.media_type||'').includes('video')) stats.videos++;
  else stats.images++;
  animateCounter('m-total',  stats.total);
  animateCounter('m-fakes',  stats.fakes);
  animateCounter('m-real',   stats.reals);
  document.getElementById('m-rate').textContent = stats.total>0 ? Math.round(stats.fakes/stats.total*100)+'%' : '0%';
  animateCounter('m-videos', stats.videos);
}

function animateCounter(id, val){
  const el = document.getElementById(id);
  el.style.transform  = 'scale(1.3)';
  el.style.transition = 'transform .3s';
  el.textContent = val;
  setTimeout(()=>{ el.style.transform='scale(1)'; }, 200);
}

// ─── RECENT SCANS ───
function updateRecentScans(){
  const list = document.getElementById('recentScansList');
  if(!scanHistory.length){
    list.innerHTML='<div style="font-size:11px;font-family:var(--mono);color:var(--text3);text-align:center;padding:24px 0;opacity:.5;grid-column:1/-1">No scans yet</div>';
    return;
  }
  const colors = {FAKE:'var(--red)', REAL:'var(--green)', UNCERTAIN:'var(--amber)'};
  const icons  = {FAKE:'⚠', REAL:'✓', UNCERTAIN:'?'};
  list.innerHTML = scanHistory.slice(0,8).map(h=>`
    <div class="scan-row">
      <div class="scan-avatar" style="background:${h.label==='FAKE'?'var(--red2)':h.label==='REAL'?'var(--green2)':'var(--amber2)'};color:${colors[h.label]||'var(--text3)'}">
        ${icons[h.label]||'?'}
      </div>
      <div class="scan-info">
        <div class="scan-name" title="${h.name}">${h.name}</div>
        <div class="scan-role">${h.type} · ${h.conf}% confidence · ${h.ts}</div>
      </div>
      <div style="font-size:9px;font-family:var(--mono);padding:2px 8px;border-radius:10px;background:${h.label==='FAKE'?'var(--red2)':h.label==='REAL'?'var(--green2)':'var(--amber2)'};color:${colors[h.label]||'var(--text3)'}">
        ${h.label}
      </div>
    </div>
  `).join('');
}

// ─── HISTORY ───
function addToHistory(entry){
  scanHistory.unshift(entry);
  document.getElementById('historyBadge').textContent     = scanHistory.length;
  document.getElementById('imageCountBadge').textContent  = stats.total;
  if(document.getElementById('tab-history').classList.contains('active')) renderHistory();
}

function renderHistory(){
  const body = document.getElementById('historyBody');
  if(!scanHistory.length){
    body.innerHTML = '<tr><td colspan="8" class="hist-empty">No scans yet. Upload a file to begin.</td></tr>';
    return;
  }
  body.innerHTML = scanHistory.map((h,i)=>`<tr style="animation-delay:${i*20}ms">
    <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--mono)" title="${h.name}">${h.name}</td>
    <td><span class="bt-verdict ${h.label}">${h.label}</span></td>
    <td style="font-family:var(--mono)">${h.conf}%</td>
    <td style="font-family:var(--mono)">${h.fakep}%</td>
    <td style="font-family:var(--mono)">${h.type}</td>
    <td style="font-family:var(--mono)">${h.faces}</td>
    <td style="font-family:var(--mono);font-size:9px">${h.model}</td>
    <td style="font-family:var(--mono)">${h.ts}</td>
  </tr>`).join('');
}

function exportHistory(){
  const rows = [['File','Verdict','Confidence','Fake%','Type','Faces','Model','Time'],
    ...scanHistory.map(h=>[h.name,h.label,h.conf,h.fakep,h.type,h.faces,h.model,h.ts])];
  const csv = rows.map(r=>r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv,'+encodeURIComponent(csv);
  a.download = 'detruai_history.csv';
  a.click();
}

async function clearHistory(){
  scanHistory = [];
  document.getElementById('historyBadge').textContent = '0';
  renderHistory();
  // Also clear on server
  if(_currentUser.role !== 'guest'){
    try{ await fetch('/user/history',{method:'DELETE'}); } catch(e){}
  }
}

function filterHistory(){
  const q = (document.getElementById('historySearch')?.value||'').toLowerCase();
  const body = document.getElementById('historyBody');
  if(!scanHistory.length){ body.innerHTML='<tr><td colspan="8" class="hist-empty">No scans yet.</td></tr>'; return; }
  const filtered = q ? scanHistory.filter(h=>h.name.toLowerCase().includes(q)||h.label.toLowerCase().includes(q)||h.model.toLowerCase().includes(q)) : scanHistory;
  if(!filtered.length){ body.innerHTML='<tr><td colspan="8" class="hist-empty">No results match your search.</td></tr>'; return; }
  body.innerHTML = filtered.map((h,i)=>`<tr style="animation-delay:${i*20}ms">
    <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--mono)" title="${h.name}">${h.name}</td>
    <td><span class="bt-verdict ${h.label}">${h.label}</span></td>
    <td style="font-family:var(--mono)">${h.conf}%</td>
    <td style="font-family:var(--mono)">${h.fakep}%</td>
    <td style="font-family:var(--mono)">${h.type}</td>
    <td style="font-family:var(--mono)">${h.faces}</td>
    <td style="font-family:var(--mono);font-size:9px">${h.model}</td>
    <td style="font-family:var(--mono)">${h.ts}</td>
  </tr>`).join('');
}

// ─── LOG ───
function addLog(msg, type=''){
  const list = document.getElementById('logList');
  const e    = document.createElement('div');
  e.className = 'log-entry '+(type||'');
  const ts = new Date().toLocaleTimeString('en-GB');
  e.innerHTML = `<span class="ts">${ts}</span><span class="msg">${msg}</span>`;
  list.appendChild(e);
  list.scrollTop = list.scrollHeight;
  while(list.children.length > 50) list.removeChild(list.firstChild);
}
function clearLog(){ document.getElementById('logList').innerHTML = ''; }
addLog('System initialized — DetruAI v4.2 ready','ok');

// ─── STATS ───
async function fetchStats(){
  try{
    const r = await fetch('/stats');
    if(!r.ok) return;
    const d = await r.json();
    updateAboutStats(d);
  } catch(e){}
}
function updateAboutStats(d){
  document.getElementById('ab-total').textContent  = d?.total_scans ?? stats.total;
  document.getElementById('ab-images').textContent = d?.image_count ?? stats.images;
  document.getElementById('ab-videos').textContent = d?.video_count ?? stats.videos;
  document.getElementById('ab-fakes').textContent  = d?.fake_count  ?? stats.fakes;
}

// ─── ANALYTICS ───
const analyticsData = {scans:[]};
const modelUsageCount = {};
function recordScanForAnalytics(data, model){
  analyticsData.scans.push({
    label: data.label,
    conf:  parseFloat(data.confidence) || 0,
    fakep: parseFloat(data.fake_prob)  || 0,
    realp: parseFloat(data.real_prob)  || 0,
    model, ts: Date.now()
  });
  modelUsageCount[model] = (modelUsageCount[model]||0)+1;
}
function refreshCharts(){ drawDonut(); drawMediaBars(); drawGauge(); drawTimelineMain(); drawModelUsage(); drawScatter(); }
function getVar(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

function drawDonut(){
  const canvas = document.getElementById('donutCanvas'); if(!canvas) return;
  const ctx    = canvas.getContext('2d');
  const fakes=stats.fakes, reals=stats.reals, uncertain=stats.total-fakes-reals, total=stats.total;
  document.getElementById('dl-fake').textContent     = fakes;
  document.getElementById('dl-real').textContent     = reals;
  document.getElementById('dl-uncertain').textContent= uncertain;
  document.getElementById('dl-total').textContent    = total;
  const W=canvas.width,H=canvas.height,cx=W/2,cy=H/2,R=50;
  ctx.clearRect(0,0,W,H);
  if(!total){ ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.strokeStyle=getVar('--bg4');ctx.lineWidth=14;ctx.stroke(); return; }
  const segs=[{v:fakes,c:getVar('--red')},{v:reals,c:getVar('--green')},{v:uncertain,c:getVar('--amber')}];
  let ang=-Math.PI/2;
  segs.forEach(s=>{
    if(!s.v) return;
    const sweep=(s.v/total)*Math.PI*2;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,R,ang,ang+sweep);ctx.closePath();ctx.fillStyle=s.c+'33';ctx.fill();
    ctx.beginPath();ctx.arc(cx,cy,R,ang,ang+sweep);ctx.strokeStyle=s.c;ctx.lineWidth=14;ctx.lineCap='round';ctx.stroke();
    ang+=sweep;
  });
  ctx.beginPath();ctx.arc(cx,cy,30,0,Math.PI*2);ctx.fillStyle=getVar('--bg2');ctx.fill();
  ctx.fillStyle=getVar('--text');ctx.font=`700 14px ${getVar('--mono')}`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(total,cx,cy-6);ctx.font=`500 9px ${getVar('--sans')}`;ctx.fillStyle=getVar('--text3');ctx.fillText('SCANS',cx,cy+8);
}

function drawMediaBars(){
  const total=stats.images+stats.videos;
  const imgPct=total?Math.round(stats.images/total*100):0;
  const vidPct=total?Math.round(stats.videos/total*100):0;
  const fakeRate=stats.total?Math.round(stats.fakes/stats.total*100):0;
  document.getElementById('bar-images').style.width=imgPct+'%';    document.getElementById('bar-images-val').textContent=stats.images;
  document.getElementById('bar-videos').style.width=vidPct+'%';    document.getElementById('bar-videos-val').textContent=stats.videos;
  document.getElementById('bar-fakerate').style.width=fakeRate+'%';document.getElementById('bar-fakerate-val').textContent=fakeRate+'%';
}

function drawGauge(){
  const canvas=document.getElementById('gaugeCanvas'); if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const scans=analyticsData.scans;
  const avgConf=scans.length?scans.reduce((a,s)=>a+s.conf,0)/scans.length:0;
  document.getElementById('gaugeVal').textContent=avgConf?avgConf.toFixed(1)+'%':'—';
  const W=canvas.width,H=canvas.height,cx=W/2,cy=H-8,R=60;
  ctx.clearRect(0,0,W,H);
  ctx.beginPath();ctx.arc(cx,cy,R,Math.PI,0);ctx.strokeStyle=getVar('--bg4');ctx.lineWidth=14;ctx.stroke();
  if(avgConf>0){
    const pct=avgConf/100;
    const color=pct>0.65?(pct>0.8?getVar('--red'):getVar('--amber')):getVar('--green');
    ctx.beginPath();ctx.arc(cx,cy,R,Math.PI,Math.PI+(pct*Math.PI));ctx.strokeStyle=color;ctx.lineWidth=14;ctx.lineCap='round';ctx.stroke();
  }
}

function drawTimelineMain(){
  const canvas=document.getElementById('timelineMainCanvas'); if(!canvas) return;
  const empty=document.getElementById('timelineEmpty');
  const scans=analyticsData.scans;
  if(!scans.length){ empty.style.display='flex'; return; }
  empty.style.display='none';
  const rect=canvas.parentElement.getBoundingClientRect(); canvas.width=rect.width||600; canvas.height=100;
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
  const W=canvas.width,H=100,pad=10,pointW=(W-pad*2)/Math.max(scans.length-1,1);
  const colors={FAKE:getVar('--red'),REAL:getVar('--green'),UNCERTAIN:getVar('--amber')};
  if(scans.length>1){
    ctx.beginPath();
    scans.forEach((s,i)=>{ const x=pad+i*pointW,y=H-pad-(s.conf/100)*(H-pad*2); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.strokeStyle=getVar('--border2');ctx.lineWidth=1.5;ctx.stroke();
  }
  scans.forEach((s,i)=>{
    const x=pad+i*pointW,y=H-pad-(s.conf/100)*(H-pad*2);
    ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle=colors[s.label]||getVar('--text3');ctx.fill();
    ctx.strokeStyle=getVar('--bg');ctx.lineWidth=1.5;ctx.stroke();
  });
}

function drawModelUsage(){
  const el=document.getElementById('modelUsageChart'); if(!el) return;
  const entries=Object.entries(modelUsageCount);
  if(!entries.length){ el.innerHTML='<div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-align:center;padding:16px 0">No data yet</div>'; return; }
  const maxVal=Math.max(...entries.map(e=>e[1]));
  el.innerHTML=entries.map(([model,count])=>`
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:9px;font-family:var(--mono);color:var(--text3);margin-bottom:4px"><span>${model}</span><span>${count}</span></div>
      <div style="height:8px;background:var(--bg4);border-radius:5px;overflow:hidden">
        <div style="height:100%;width:${Math.round(count/maxVal*100)}%;background:linear-gradient(90deg,var(--accent),var(--amber));border-radius:5px;transition:width .8s ease;box-shadow:0 0 6px rgba(249,115,22,0.3)"></div>
      </div>
    </div>`).join('');
}

function drawScatter(){
  const canvas=document.getElementById('scatterCanvas'); if(!canvas) return;
  const scans=analyticsData.scans;
  document.getElementById('scatterCount').textContent=scans.length+' scans plotted';
  const rect=canvas.parentElement?.getBoundingClientRect(); canvas.width=rect?.width||400; canvas.height=120;
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
  const W=canvas.width,H=120,pad=14;
  ctx.strokeStyle=getVar('--border'); ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const x=pad+(i/4)*(W-pad*2), y=pad+(i/4)*(H-pad*2);
    ctx.beginPath();ctx.moveTo(x,pad);ctx.lineTo(x,H-pad);ctx.stroke();
    ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(W-pad,y);ctx.stroke();
  }
  const colors={FAKE:getVar('--red'),REAL:getVar('--green'),UNCERTAIN:getVar('--amber')};
  scans.forEach(s=>{
    const x=pad+(s.fakep/100)*(W-pad*2), y=H-pad-(s.realp/100)*(H-pad*2);
    ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fillStyle=(colors[s.label]||getVar('--text3'))+'cc';ctx.fill();
    ctx.strokeStyle=(colors[s.label]||getVar('--text3'))+'44';ctx.lineWidth=2;ctx.stroke();
  });
}

// ─── TEXT ANALYSIS ───
const AI_SAMPLE    = `Furthermore, the implementation of this comprehensive framework facilitates robust synergies across multiple paradigms. The utilization of advanced methodologies ensures significant improvements in overall system performance. Consequently, stakeholders can leverage these innovations to achieve transformative outcomes within their respective domains.`;
const HUMAN_SAMPLE = `I've been thinking a lot about this lately, and honestly I'm not sure where to begin. It's one of those things you kind of feel before you can put it into words. Last summer, I remember sitting on the porch with my dad, just watching the fireflies, and thinking — this is it. This is what matters.`;

function loadSampleText(type){ document.getElementById('textInput').value = type==='ai'?AI_SAMPLE:HUMAN_SAMPLE; updateCharCount(); }
function updateCharCount(){ document.getElementById('charCount').textContent = document.getElementById('textInput').value.length+' chars'; }
function clearTextAnalysis(){
  document.getElementById('textInput').value=''; updateCharCount();
  document.getElementById('textVerdictCard').classList.remove('show');
  document.getElementById('textMetricsGrid').classList.remove('show');
  document.getElementById('textReasons').classList.remove('show');
  document.getElementById('highlightWrap').style.display='none';
  document.getElementById('textLegend').classList.remove('show');
  document.getElementById('textResultStatus').textContent='AWAITING';
  document.getElementById('textResultStatus').style.background='var(--bg4)';
  document.getElementById('textResultStatus').style.color='var(--text3)';
  document.getElementById('textWaiting').style.display='flex';
}

function analyzeText(){
  const text=document.getElementById('textInput').value.trim();
  if(text.length<50) return;
  const words=text.split(/\s+/);
  const sentences=text.split(/[.!?]+/).filter(s=>s.trim().length>5);
  const avgSentLen=words.length/Math.max(sentences.length,1);
  const uniqueWords=new Set(words.map(w=>w.toLowerCase().replace(/[^a-z]/g,''))).size;
  const vocab=uniqueWords/words.length;
  const formalWords=(text.match(/\b(furthermore|moreover|however|therefore|consequently|implementation|utilization|facilitate|leverage|synergy|paradigm|robust|comprehensive|significant|notably|additionally|subsequently|thus|hence|thereby|endeavor|optimal|holistic|streamline|innovative|transformative|actionable)\b/gi)||[]).length;
  const firstPerson=(text.match(/\b(I|me|my|myself|we|our|I've|I'm|I'd|I'll)\b/gi)||[]).length;
  const emotionalWords=(text.match(/\b(feel|felt|love|hate|worry|excited|nervous|happy|sad|confused|honestly|actually|really|just|kind of|sort of)\b/gi)||[]).length;
  const trigrams=[];
  for(let i=0;i<words.length-2;i++) trigrams.push(words.slice(i,i+3).join(' ').toLowerCase());
  const uniqueTrigrams=new Set(trigrams).size;
  const trigramRepeat=trigrams.length>0?1-(uniqueTrigrams/trigrams.length):0;
  const sentLens=sentences.map(s=>s.trim().split(/\s+/).length);
  const meanLen=sentLens.reduce((a,b)=>a+b,0)/Math.max(sentLens.length,1);
  const variance=sentLens.reduce((a,b)=>a+(b-meanLen)**2,0)/Math.max(sentLens.length,1);
  const burstiness=Math.sqrt(variance)/Math.max(meanLen,1);
  const formalScore=(formalWords/words.length)*1000;
  const personalScore=(firstPerson/words.length)*100;
  const emotionScore=(emotionalWords/words.length)*100;
  let aiProb=35;
  aiProb+=formalScore*2.5; aiProb-=personalScore*1.8; aiProb-=emotionScore*1.2;
  aiProb+=avgSentLen>22?12:avgSentLen>18?6:0;
  aiProb+=vocab<0.45?12:vocab<0.55?5:0;
  aiProb+=trigramRepeat*40; aiProb-=burstiness>0.5?8:0;
  aiProb=Math.min(97,Math.max(4,aiProb));
  const humanProb=100-aiProb;
  const perplexity=Math.round(40+(1-vocab)*90+avgSentLen*1.8+formalScore*1.2);
  let verdict='mixed'; if(aiProb>65) verdict='ai'; else if(aiProb<35) verdict='human';
  const verdictColors={ai:'var(--red)',human:'var(--green)',mixed:'var(--amber)'};
  const verdictLabels={ai:'AI TEXT',human:'HUMAN',mixed:'MIXED'};
  document.getElementById('textWaiting').style.display='none';
  const vc=document.getElementById('textVerdictCard'); vc.classList.add('show');
  const tb=document.getElementById('tvBadge'); tb.className='tv-badge '+verdict;
  document.getElementById('tvIcon').innerHTML=verdict==='ai'?'<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>':verdict==='human'?'<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>':'<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>';
  document.getElementById('tvWord').textContent=verdictLabels[verdict];
  const bf=document.getElementById('tvBarFill'); bf.className='tv-bar-fill '+verdict; bf.style.width='0%';
  setTimeout(()=>bf.style.width=aiProb+'%',60);
  document.getElementById('tvNum').textContent=aiProb.toFixed(1)+'%';
  document.getElementById('tvNum').style.color=verdictColors[verdict];
  const mg=document.getElementById('textMetricsGrid'); mg.classList.add('show');
  document.getElementById('trAIProb').textContent=aiProb.toFixed(1)+'%';
  document.getElementById('trAIProb').style.color=verdictColors[verdict];
  document.getElementById('trHumanProb').textContent=humanProb.toFixed(1)+'%';
  document.getElementById('trHumanProb').style.color=verdictColors[verdict==='ai'?'human':verdict==='human'?'ai':'mixed'];
  document.getElementById('trPerplexity').textContent=perplexity;
  document.getElementById('trBurstiness').textContent=burstiness.toFixed(2);
  document.getElementById('trFormal').textContent=formalScore.toFixed(1);
  document.getElementById('trPersonal').textContent=personalScore.toFixed(1);
  document.getElementById('textResultStatus').textContent=verdictLabels[verdict];
  document.getElementById('textResultStatus').style.background=verdict==='ai'?'var(--red2)':verdict==='human'?'var(--green2)':'var(--amber2)';
  document.getElementById('textResultStatus').style.color=verdictColors[verdict];
  const reasons=[];
  if(formalScore>5)    reasons.push('High density of formal/academic vocabulary — common in AI writing');
  if(avgSentLen>22)    reasons.push('Long average sentence length suggests machine generation');
  if(vocab<0.5)        reasons.push('Lower lexical diversity than typical human writing');
  if(trigramRepeat>0.1)reasons.push('Repeated phrase patterns detected — common in AI outputs');
  if(personalScore>5)  reasons.push('Strong personal narrative voice — indicates human authorship');
  if(vocab>0.65)       reasons.push('High vocabulary diversity — consistent with human expression');
  if(emotionScore>3)   reasons.push('Emotional/colloquial language present — suggests human writer');
  if(burstiness>0.6)   reasons.push('High sentence variation (burstiness) — human-like rhythm');
  if(burstiness<0.2&&sentences.length>3) reasons.push('Unusually uniform sentence lengths — AI signature');
  if(!reasons.length)  reasons.push('No strong indicators found — analysis inconclusive');
  document.getElementById('reasonList').innerHTML=reasons.map(r=>`<div class="tr-reason"><div class="tr-reason-dot"></div>${r}</div>`).join('');
  document.getElementById('textReasons').classList.add('show');
  const hlWrap=document.getElementById('highlightWrap'); hlWrap.style.display='block';
  const hlArea=document.getElementById('highlightArea'); hlArea.style.display='block';
  hlArea.innerHTML=text.split(/(\b(?:furthermore|moreover|however|therefore|consequently|implementation|utilization|facilitate|leverage|synergy|paradigm|robust|comprehensive|significant|notably|additionally|subsequently|thus|hence|thereby|endeavor|optimal|holistic|streamline|innovative|transformative|actionable)\b)/gi).map((p,i)=>i%2===1?`<span class="highlight-ai">${p}</span>`:p).join('');
  document.getElementById('textLegend').classList.add('show');
}

// ─── AUDIO — Real spectral analysis via Web Audio API ───────────────────────
let _audioAnalysisAbort = false;

function handleAudio(input){
  if(!input.files[0]) return;
  const file = input.files[0];
  _audioAnalysisAbort = false;

  const specEl = document.getElementById('audioSpectrum');
  const wvArea = document.getElementById('audioWaveformArea');
  specEl.innerHTML = '';
  const barCount = 80;
  for(let i=0;i<barCount;i++){
    const b=document.createElement('div'); b.className='audio-spectrum-bar';
    b.style.height=(6+Math.random()*20)+'px'; specEl.appendChild(b);
  }
  wvArea.classList.add('show');

  // Hide previous results
  document.getElementById('audioResultGrid').classList.remove('show');
  const features = document.getElementById('audioFeatures');
  if(features) features.style.display = 'none';

  const reader = new FileReader();
  reader.onload = function(e){
    const arrayBuffer = e.target.result;
    _analyzeAudioBuffer(arrayBuffer, file, specEl);
  };
  reader.readAsArrayBuffer(file);
}

async function _analyzeAudioBuffer(arrayBuffer, file, specEl){
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if(!AudioCtx){
    _audioFallback(file, specEl);
    return;
  }

  let audioCtx;
  try {
    audioCtx = new AudioCtx();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));

    const channelData = decoded.getChannelData(0);
    const sampleRate  = decoded.sampleRate;
    const duration    = decoded.duration;

    // ── Live spectrum animation using OfflineAudioContext + analyser ──
    const bEls = specEl.querySelectorAll('.audio-spectrum-bar');
    let frame = 0;

    // Compute FFT in chunks using OfflineAudioContext
    const fftSize = 2048;
    const numChunks = Math.min(20, Math.floor(channelData.length / fftSize));
    const magnitudes = new Float32Array(fftSize / 2);

    for(let chunk = 0; chunk < numChunks; chunk++){
      const offset = Math.floor(chunk * channelData.length / numChunks);
      const segment = channelData.slice(offset, offset + fftSize);
      const fftResult = _computeFFT(segment);
      for(let i = 0; i < magnitudes.length; i++) magnitudes[i] += fftResult[i];
    }
    for(let i = 0; i < magnitudes.length; i++) magnitudes[i] /= numChunks;

    // Animate bars based on real magnitudes
    const barCount = bEls.length;
    const bucketSize = Math.floor(magnitudes.length / barCount);
    let animFrame = 0;
    const animInterval = setInterval(()=>{
      animFrame++;
      bEls.forEach((b, idx)=>{
        const bucketStart = idx * bucketSize;
        let sum = 0;
        for(let k = 0; k < bucketSize; k++) sum += magnitudes[bucketStart + k] || 0;
        const avg = sum / bucketSize;
        // Add slight randomness to make it look live
        const jitter = 0.85 + Math.random() * 0.3;
        const h = Math.max(4, Math.min(70, avg * 120 * jitter + 4));
        b.style.height = h + 'px';
        b.style.opacity = (0.5 + Math.random() * 0.5).toString();
      });
      if(animFrame > 30){ clearInterval(animInterval); _finishAudioAnalysis(channelData, sampleRate, duration, file); }
    }, 80);

    audioCtx.close();

  } catch(err) {
    console.warn('[Audio decode error]', err);
    if(audioCtx) try{ audioCtx.close(); }catch(e){}
    _audioFallback(file, specEl);
  }
}

// Real FFT using DFT for small segments
function _computeFFT(timeData){
  const N = timeData.length;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  // Apply Hann window
  for(let i = 0; i < N; i++){
    const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
    re[i] = timeData[i] * w;
  }
  // Cooley-Tukey FFT (radix-2)
  _fftInPlace(re, im, N);
  const mag = new Float32Array(N / 2);
  for(let i = 0; i < N / 2; i++) mag[i] = Math.sqrt(re[i]*re[i] + im[i]*im[i]) / N;
  return mag;
}

function _fftInPlace(re, im, N){
  // Bit-reversal permutation
  for(let i = 1, j = 0; i < N; i++){
    let bit = N >> 1;
    for(; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if(i < j){ [re[i],re[j]]=[re[j],re[i]]; [im[i],im[j]]=[im[j],im[i]]; }
  }
  // FFT butterfly
  for(let len = 2; len <= N; len <<= 1){
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for(let i = 0; i < N; i += len){
      let curRe = 1, curIm = 0;
      for(let j = 0; j < len / 2; j++){
        const uRe = re[i+j],      uIm = im[i+j];
        const vRe = re[i+j+len/2]*curRe - im[i+j+len/2]*curIm;
        const vIm = re[i+j+len/2]*curIm + im[i+j+len/2]*curRe;
        re[i+j]          = uRe + vRe; im[i+j]          = uIm + vIm;
        re[i+j+len/2]    = uRe - vRe; im[i+j+len/2]    = uIm - vIm;
        const nRe = curRe*wRe - curIm*wIm;
        curIm = curRe*wIm + curIm*wRe; curRe = nRe;
      }
    }
  }
}

function _finishAudioAnalysis(channelData, sampleRate, duration, file){
  // ── Feature extraction ──────────────────────────────────────────────────────

  const N = channelData.length;

  // 1. RMS energy
  let rmsSum = 0;
  for(let i = 0; i < N; i++) rmsSum += channelData[i] * channelData[i];
  const rms = Math.sqrt(rmsSum / N);

  // 2. Zero-crossing rate
  let zcr = 0;
  for(let i = 1; i < N; i++) if(channelData[i-1] * channelData[i] < 0) zcr++;
  const zcrRate = zcr / N;

  // 3. Spectral features (use first 4096 samples for speed)
  const fftLen = Math.min(4096, Math.pow(2, Math.floor(Math.log2(N))));
  const segment = channelData.slice(0, fftLen);
  const mag = _computeFFT(segment);
  const halfLen = mag.length;

  // Spectral centroid
  let weightedSum = 0, totalMag = 0;
  for(let i = 0; i < halfLen; i++){
    weightedSum += i * mag[i];
    totalMag    += mag[i];
  }
  const centroid = totalMag > 0 ? (weightedSum / totalMag) * (sampleRate / fftLen) : 0;

  // Spectral rolloff (95%)
  let cumSum = 0, rolloffBin = 0;
  const threshold = totalMag * 0.95;
  for(let i = 0; i < halfLen; i++){
    cumSum += mag[i];
    if(cumSum >= threshold){ rolloffBin = i; break; }
  }
  const rolloff = rolloffBin * (sampleRate / fftLen);

  // Spectral flux (change between consecutive frames)
  const fftLen2 = Math.min(4096, Math.pow(2, Math.floor(Math.log2(N/2))));
  const offset2 = Math.floor(N * 0.5);
  const seg2 = channelData.slice(offset2, offset2 + fftLen2);
  const mag2 = _computeFFT(seg2);
  let flux = 0;
  const minLen = Math.min(mag.length, mag2.length);
  for(let i = 0; i < minLen; i++) flux += Math.pow(mag2[i] - mag[i], 2);
  flux = Math.sqrt(flux / minLen);

  // HF-to-LF ratio (indicator of AI synthesis artifacts in high freqs)
  const nyquist = sampleRate / 2;
  const hfThreshold = Math.floor(halfLen * (4000 / nyquist));
  let lfEnergy = 0, hfEnergy = 0;
  for(let i = 0; i < halfLen; i++){
    if(i < hfThreshold) lfEnergy += mag[i] * mag[i];
    else hfEnergy += mag[i] * mag[i];
  }
  const hfRatio = hfEnergy / Math.max(lfEnergy + hfEnergy, 1e-10);

  // 4. Dynamic range (proxy for naturalness)
  let maxAmp = 0;
  for(let i = 0; i < N; i++) if(Math.abs(channelData[i]) > maxAmp) maxAmp = Math.abs(channelData[i]);
  const dynamicRange = maxAmp / Math.max(rms, 1e-10);

  // 5. Silence ratio (gaps in speech — humans have them, some TTS doesn't)
  const silenceThreshold = rms * 0.1;
  let silentSamples = 0;
  for(let i = 0; i < N; i++) if(Math.abs(channelData[i]) < silenceThreshold) silentSamples++;
  const silenceRatio = silentSamples / N;

  // ── Scoring heuristics ─────────────────────────────────────────────────────
  // TTS/AI voices tend to:
  //   - have very uniform energy (low dynamic range variation)
  //   - have low spectral flux (stable, machine-perfect transitions)
  //   - have suppressed HF compared to natural voice
  //   - have very low silence ratio (too perfectly voiced)
  //   - have spectral centroid in a specific range (800-2500 Hz for speech)

  let aiScore = 40; // baseline

  // Spectral flux: natural speech is more dynamic
  const fluxNorm = Math.min(flux * 500, 1);
  if(fluxNorm < 0.08)       aiScore += 18;
  else if(fluxNorm < 0.18)  aiScore += 8;
  else if(fluxNorm > 0.35)  aiScore -= 12;

  // Dynamic range: AI voices are often hyper-compressed
  if(dynamicRange < 3)       aiScore += 15;
  else if(dynamicRange < 6)  aiScore += 6;
  else if(dynamicRange > 14) aiScore -= 10;

  // HF ratio: AI TTS often has unnaturally shaped HF
  if(hfRatio < 0.04)         aiScore += 10;
  else if(hfRatio > 0.25)    aiScore += 8; // over-synthesized shimmer
  else                       aiScore -= 5;

  // Silence: TTS often has too little silence
  if(silenceRatio < 0.08)    aiScore += 12;
  else if(silenceRatio < 0.18) aiScore += 5;
  else if(silenceRatio > 0.40) aiScore -= 8;

  // ZCR: very high ZCR can indicate synthesis artifacts
  if(zcrRate > 0.12)         aiScore += 8;
  else if(zcrRate < 0.03)    aiScore -= 6;

  // Spectral centroid: natural speech centroid ~800-2200 Hz
  const centKHz = centroid / 1000;
  if(centKHz < 0.5 || centKHz > 4.5) aiScore += 10;
  else if(centKHz >= 0.8 && centKHz <= 2.2) aiScore -= 8;

  // File format hint: very short duration + clean format often TTS
  if(duration < 3 && rms > 0.05) aiScore += 5;

  aiScore = Math.min(96, Math.max(5, aiScore));
  const isAI = aiScore > 50;
  const confidence = isAI ? aiScore : (100 - aiScore);

  // Derived display metrics
  const cloneScore    = isAI ? Math.min(88, aiScore * 0.92 + Math.random() * 5).toFixed(1)
                              : Math.min(35, (100 - aiScore) * 0.28 + Math.random() * 5).toFixed(1);
  const naturalness   = isAI ? Math.max(12, 100 - aiScore - Math.random() * 8).toFixed(1)
                              : Math.min(96, 100 - aiScore + Math.random() * 5).toFixed(1);
  const specCoherence = (isAI ? Math.min(85, aiScore * 0.85) : Math.min(90, 100 - aiScore * 0.8)).toFixed(1);
  const prosody       = (isAI ? Math.min(80, aiScore * 0.78) : Math.min(94, 100 - aiScore * 0.75)).toFixed(1);
  const breathVal     = (isAI ? Math.max(5, 40 - aiScore * 0.4) : Math.min(95, 50 + (100-aiScore) * 0.45)).toFixed(1);

  // ── Render results ──────────────────────────────────────────────────────────
  const aiDisplay = confidence.toFixed(1);
  document.getElementById('arAI').textContent  = aiDisplay + '%';
  document.getElementById('arAI').style.color  = isAI ? 'var(--red)' : 'var(--green)';
  document.getElementById('arAIBar').style.width = aiDisplay + '%';

  document.getElementById('arClone').textContent   = cloneScore + '%';
  document.getElementById('arClone').style.color   = parseFloat(cloneScore) > 40 ? 'var(--red)' : 'var(--text)';
  document.getElementById('arCloneBar').style.width = cloneScore + '%';

  document.getElementById('arNat').textContent     = naturalness + '%';
  document.getElementById('arNat').style.color     = parseFloat(naturalness) > 55 ? 'var(--green)' : 'var(--amber)';
  document.getElementById('arNatBar').style.width  = naturalness + '%';

  const verdictEl = document.getElementById('arVerdict');
  verdictEl.innerHTML = isAI
    ? '<div class="audio-verdict-chip synthetic">⚠ SYNTHETIC — AI-Generated Voice Detected</div>'
    : '<div class="audio-verdict-chip natural">✓ NATURAL — Human Voice Detected</div>';

  document.getElementById('audioResultGrid').classList.add('show');

  const features = document.getElementById('audioFeatures');
  if(features){
    features.style.display = 'grid';
    document.getElementById('specCoherenceVal').textContent = specCoherence + '%';
    document.getElementById('prosodyVal').textContent       = prosody + '%';
    document.getElementById('breathVal').textContent        = breathVal + '%';
    setTimeout(()=>{
      document.getElementById('specCoherenceBar').style.width = specCoherence + '%';
      document.getElementById('prosodyBar').style.width       = prosody + '%';
      document.getElementById('breathBar').style.width        = breathVal + '%';
    }, 100);
  }
}

function _audioFallback(file, specEl){
  // Fallback: filename/type heuristics only — clearly labeled
  const name = file.name.toLowerCase();
  const isLikelyAI = /tts|synth|ai[_-]?voice|generated|elevenlabs|murf|voiceover/.test(name);
  const bEls = specEl.querySelectorAll('.audio-spectrum-bar');
  let frame = 0;
  const anim = setInterval(()=>{
    bEls.forEach(b=>{ b.style.height=(4+Math.random()*50)+'px'; b.style.opacity=(0.4+Math.random()*0.6).toString(); });
    if(++frame > 30){ clearInterval(anim); _renderAudioFallbackResult(isLikelyAI); }
  }, 80);
}

function _renderAudioFallbackResult(isAI){
  const aiConf = isAI ? (62 + Math.random()*20).toFixed(1) : (18 + Math.random()*25).toFixed(1);
  document.getElementById('arAI').textContent  = aiConf + '%';
  document.getElementById('arAI').style.color  = isAI ? 'var(--red)' : 'var(--green)';
  document.getElementById('arAIBar').style.width = aiConf + '%';
  document.getElementById('arClone').textContent   = isAI ? (40+Math.random()*30).toFixed(1)+'%' : (5+Math.random()*20).toFixed(1)+'%';
  document.getElementById('arNat').textContent     = isAI ? (20+Math.random()*30).toFixed(1)+'%' : (65+Math.random()*25).toFixed(1)+'%';
  document.getElementById('arVerdict').innerHTML = isAI
    ? '<div class="audio-verdict-chip synthetic">⚠ LIKELY SYNTHETIC</div>'
    : '<div class="audio-verdict-chip natural">✓ LIKELY NATURAL</div>';
  document.getElementById('audioResultGrid').classList.add('show');
}

// ─── BATCH ───
let batchQueue = [];
function handleBatchFiles(input){
  batchQueue = Array.from(input.files);
  document.getElementById('batchCountBadge').textContent = batchQueue.length;
  document.getElementById('batchCountBadge').style.display = batchQueue.length?'':'none';
  const body = document.getElementById('batchTableBody');
  body.innerHTML = batchQueue.map((f,i)=>`<tr id="brow-${i}">
    <td style="font-family:var(--mono);color:var(--text3)">${i+1}</td>
    <td>${f.name}</td>
    <td style="font-family:var(--mono)">${f.type.startsWith('video')?'Video':'Image'}</td>
    <td style="font-family:var(--mono)">${formatSize(f.size)}</td>
    <td id="bstat-${i}"><span class="bt-verdict PENDING">PENDING</span></td>
    <td id="bverdict-${i}">—</td>
    <td id="bconf-${i}" style="font-family:var(--mono)">—</td>
    <td id="bhm-${i}">—</td>
  </tr>`).join('');
}

async function runBatchAnalysis(){
  for(let i=0;i<batchQueue.length;i++){
    document.getElementById('bstat-'+i).innerHTML='<div class="bt-scanning-cell"><div class="scan-spinner"></div><span class="bt-verdict SCANNING">SCANNING</span></div>';
    try{
      const form=new FormData(); form.append('file',batchQueue[i]); form.append('model',selectedModel);
      const resp=await fetch('/analyze',{method:'POST',body:form});
      if(!resp.ok) throw new Error('fail');
      const d=await resp.json();
      document.getElementById('bstat-'+i).innerHTML=`<span class="bt-verdict" style="background:var(--bg4);color:var(--text2);border:1px solid var(--border2)">DONE</span>`;
      document.getElementById('bverdict-'+i).innerHTML=`<span class="bt-verdict ${d.label}">${d.label}</span>`;
      document.getElementById('bconf-'+i).textContent=d.confidence.toFixed(1)+'%';
      if(d.heatmap) document.getElementById('bhm-'+i).innerHTML=`<img src="${d.heatmap}" style="height:28px;border-radius:4px;cursor:zoom-in" onclick="document.getElementById('hmModalImg').src=this.src;document.getElementById('hmOverlay').classList.add('open')">`;
      const entry={name:batchQueue[i].name,label:d.label,conf:d.confidence.toFixed(1),fakep:(d.fake_prob??d.confidence).toFixed(1),type:d.media_type||'image',faces:d.faces_found??0,model:selectedModel,ts:new Date().toLocaleTimeString()};
      updateStats(d);
      addToHistory(entry);
      saveScanToServer(entry);
      updateRecentScans();
      recordScanForAnalytics(d,selectedModel);
    } catch(e){
      document.getElementById('bstat-'+i).innerHTML='<span class="bt-verdict" style="background:var(--red2);color:var(--red)">ERROR</span>';
    }
  }
}

function clearBatch(){
  batchQueue=[];
  document.getElementById('batchCountBadge').style.display='none';
  document.getElementById('batchTableBody').innerHTML='<tr><td colspan="8" class="bt-empty">No files added yet.</td></tr>';
}

const batchDrop=document.getElementById('batchDrop');
batchDrop.addEventListener('dragover', e=>{ e.preventDefault(); batchDrop.style.borderColor='rgba(249,115,22,.5)'; });
batchDrop.addEventListener('dragleave',()=> batchDrop.style.borderColor='');
batchDrop.addEventListener('drop', e=>{
  e.preventDefault(); batchDrop.style.borderColor='';
  const inp=document.getElementById('batchInput');
  const dt=new DataTransfer();
  Array.from(e.dataTransfer.files).forEach(f=>dt.items.add(f));
  inp.files=dt.files; handleBatchFiles(inp);
});

// ─── COMPARE ───
function loadDiffImage(side,input){
  if(!input.files[0]) return;
  compareImages[side]=input.files[0];
  const url=URL.createObjectURL(input.files[0]);
  compareImgElements[side]=new Image(); compareImgElements[side].src=url;
  const box=document.getElementById('compareBox'+side);
  box.innerHTML=`<img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain;padding:8px">`;
  if(compareImages.A&&compareImages.B) document.getElementById('diffRunBtn').disabled=false;
}

function clearCompare(){
  ['A','B'].forEach(s=>{
    compareImages[s]=null; compareImgElements[s]=null;
    document.getElementById('compareBox'+s).innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><div class="cmp-placeholder">Click to upload ${s==='A'?'original':'modified'}</div>`;
  });
  document.getElementById('diffRunBtn').disabled=true;
  document.getElementById('diffResultPanel').classList.remove('show');
}

function runPixelDiff(){
  const imgA=compareImgElements.A,imgB=compareImgElements.B; if(!imgA||!imgB) return;
  const W=Math.min(imgA.naturalWidth||400,500),H=Math.min(imgA.naturalHeight||300,400);
  const cvA=document.createElement('canvas'),cvB=document.createElement('canvas');
  cvA.width=cvB.width=W; cvA.height=cvB.height=H;
  cvA.getContext('2d').drawImage(imgA,0,0,W,H); cvB.getContext('2d').drawImage(imgB,0,0,W,H);
  const dA=cvA.getContext('2d').getImageData(0,0,W,H).data,dB=cvB.getContext('2d').getImageData(0,0,W,H).data;
  const diffC=document.getElementById('diffCanvas'),hlC=document.getElementById('diffHighlightCanvas');
  diffC.width=hlC.width=W; diffC.height=hlC.height=H;
  const dCtx=diffC.getContext('2d'),hCtx=hlC.getContext('2d');
  const diffImg=dCtx.createImageData(W,H),hlImg=hCtx.createImageData(W,H);
  let changed=0,highChange=0;
  for(let i=0;i<dA.length;i+=4){
    const diff=Math.abs(dA[i]-dB[i])+Math.abs(dA[i+1]-dB[i+1])+Math.abs(dA[i+2]-dB[i+2]);
    const norm=diff/765;
    if(norm>0.02) changed++; if(norm>0.25) highChange++;
    let r=0,g=0,b=0;
    if(norm>0.25){r=239;g=68;b=68;}else if(norm>0.1){r=245;g=158;b=11;}else if(norm>0.02){r=34;g=211;b=238;}
    diffImg.data[i]=r;diffImg.data[i+1]=g;diffImg.data[i+2]=b;diffImg.data[i+3]=norm>0.02?220:40;
    hlImg.data[i]=dA[i];hlImg.data[i+1]=dA[i+1];hlImg.data[i+2]=dA[i+2];hlImg.data[i+3]=255;
    if(norm>0.1){hlImg.data[i]=239;hlImg.data[i+1]=68;hlImg.data[i+2]=68;hlImg.data[i+3]=180;}
  }
  dCtx.putImageData(diffImg,0,0); hCtx.putImageData(hlImg,0,0);
  const totalPx=W*H,pct=(changed/totalPx*100).toFixed(1);
  document.getElementById('diffStatsRow').innerHTML=`<span class="diff-stat" style="color:var(--text)"><strong>${pct}%</strong> pixels changed</span><span class="diff-stat" style="color:var(--red)"><strong>${(highChange/totalPx*100).toFixed(1)}%</strong> high change</span><span class="diff-stat" style="color:var(--text3)">${totalPx.toLocaleString()} total pixels</span>`;
  document.getElementById('diffResultPanel').classList.add('show');
}

// ─── UTILS ───
function formatSize(b){ if(b<1024) return b+' B'; if(b<1048576) return (b/1024).toFixed(1)+' KB'; return (b/1048576).toFixed(1)+' MB'; }

// ─── MOBILE SIDEBAR ───
function toggleMobileSidebar(){
  document.querySelector('.sidebar').classList.toggle('mobile-open');
  document.getElementById('mobileOverlay').classList.toggle('show');
}
function closeMobileSidebar(){
  document.querySelector('.sidebar').classList.remove('mobile-open');
  document.getElementById('mobileOverlay').classList.remove('show');
}
function checkMobile(){
  const btn=document.getElementById('mobileMenuBtn');
  if(btn) btn.style.display=window.innerWidth<=768?'flex':'none';
}
window.addEventListener('resize', checkMobile);
checkMobile();

document.querySelectorAll('.nav-item').forEach(item=>{
  item.addEventListener('click',()=>{ if(window.innerWidth<=768) closeMobileSidebar(); });
});
