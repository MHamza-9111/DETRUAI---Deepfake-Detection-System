// ═══════════════════════════════════════════════════════════
// AUTH GUARD — DetruAI v4.1
// Paste this entire block at the TOP of app.js (before all other code)
// ═══════════════════════════════════════════════════════════

// ─── SESSION ───
let _currentUser = null;

(function initAuth(){
  const raw = sessionStorage.getItem('detruai_user');
  if(!raw){ window.location.href='/login'; return; }
  try { _currentUser = JSON.parse(raw); } catch(e){ window.location.href='/login'; return; }
  if(!_currentUser || !_currentUser.username){ window.location.href='/login'; return; }

  // Apply guest restrictions once DOM ready
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', applyAuthUI);
  } else {
    applyAuthUI();
  }
})();

// ─── LOCKED TABS FOR GUEST ───
const GUEST_LOCKED_TABS = ['text','audio','forensic','compare','batch','history'];

function applyAuthUI(){
  const isGuest = _currentUser.role === 'guest';

  // Inject user pill into topbar
  _injectUserPill();

  if(!isGuest) return;  // full access — nothing to lock

  // Lock nav items
  GUEST_LOCKED_TABS.forEach(tabId => {
    const navEl = document.getElementById('nav-'+tabId);
    if(!navEl) return;
    navEl.classList.add('nav-locked');
    navEl.title = 'Sign in to unlock';
    // Override click — show upgrade modal instead
    navEl.addEventListener('click', function(e){
      e.stopImmediatePropagation();
      _showGuestModal();
    }, true);
  });

  // Show guest banner in topbar
  const badge = document.querySelector('.status-badge');
  if(badge){
    badge.innerHTML = '<div class="dot" style="background:var(--amber)"></div><span style="color:var(--amber)">Guest Mode</span>';
  }
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

  // User dropdown menu
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
    </div>` : `<div class="um-item" onclick="_showProfileInfo()">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      Profile
    </div>`}
    <div class="um-item um-logout" onclick="doLogout()">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
      ${isGuest ? 'Exit Guest' : 'Sign Out'}
    </div>
  `;
  document.body.appendChild(menu);

  // Close on outside click
  document.addEventListener('click', e=>{
    if(!pill.contains(e.target) && !menu.contains(e.target)){
      menu.classList.remove('open');
    }
  });

  // Inject styles
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

// ─── PROFILE INFO ───
function _showProfileInfo(){
  document.getElementById('userMenu').classList.remove('open');
  alert(`Account: ${_currentUser.username}\nEmail: ${_currentUser.email}\nRole: ${_currentUser.role}`);
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
          <div class="gm-feat"><span class="gm-check">✓</span> Scan History</div>
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
    /* ── USER PILL ── */
    .user-pill{
      display:flex;align-items:center;gap:8px;padding:5px 10px 5px 6px;
      background:var(--bg3);border:1px solid var(--border2);border-radius:10px;
      cursor:pointer;transition:all .18s ease;user-select:none;
    }
    .user-pill:hover{background:var(--bg4)}
    .user-avatar{
      width:28px;height:28px;border-radius:7px;background:var(--accent-dim);
      border:1px solid rgba(249,115,22,0.3);display:flex;align-items:center;justify-content:center;
      font-size:0.78rem;font-weight:700;color:var(--accent);
    }
    .user-pill-info{line-height:1}
    .user-pill-name{font-size:0.8rem;font-weight:600;color:var(--text)}
    .user-pill-role{font-size:0.68rem;color:var(--text3);margin-top:2px;text-transform:uppercase;letter-spacing:0.05em}

    /* ── USER MENU ── */
    .user-menu{
      position:fixed;top:68px;right:16px;width:220px;background:var(--bg2);
      border:1px solid var(--border2);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.6);
      z-index:9999;opacity:0;pointer-events:none;transform:translateY(-6px);
      transition:all .2s cubic-bezier(.22,1,.36,1);
    }
    .user-menu.open{opacity:1;pointer-events:all;transform:translateY(0)}
    .um-header{padding:14px 14px 10px}
    .um-name{font-weight:600;font-size:0.9rem;color:var(--text)}
    .um-email{font-size:0.75rem;color:var(--text3);margin-top:2px;word-break:break-all}
    .um-divider{height:1px;background:var(--border);margin:0 10px}
    .um-item{
      display:flex;align-items:center;gap:9px;padding:10px 14px;
      font-size:0.84rem;color:var(--text2);cursor:pointer;transition:all .15s;
    }
    .um-item:hover{background:var(--hover-bg);color:var(--text)}
    .um-item:last-child{border-radius:0 0 12px 12px}
    .um-upgrade{color:var(--accent)!important}
    .um-upgrade:hover{background:var(--accent-dim)!important}
    .um-logout:hover{color:var(--red)!important;background:var(--red2)!important}

    /* ── NAV LOCKED ── */
    .nav-locked{opacity:0.42;cursor:not-allowed!important;position:relative}
    .nav-locked::after{
      content:'🔒';position:absolute;right:10px;top:50%;transform:translateY(-50%);
      font-size:0.65rem;
    }
    .nav-locked .badge{display:none!important}

    /* ── GUEST MODAL ── */
    .guest-modal-overlay{
      position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:10000;
      display:flex;align-items:center;justify-content:center;padding:24px;
      opacity:0;pointer-events:none;transition:opacity .2s ease;
    }
    .guest-modal-overlay.open{opacity:1;pointer-events:all}
    .guest-modal{
      background:var(--bg2);border:1px solid var(--border2);border-radius:18px;
      padding:36px;max-width:400px;width:100%;text-align:center;position:relative;
      box-shadow:0 24px 80px rgba(0,0,0,0.8);
      transform:scale(0.95);transition:transform .25s cubic-bezier(.22,1,.36,1);
    }
    .guest-modal-overlay.open .guest-modal{transform:scale(1)}
    .guest-modal-close{
      position:absolute;top:14px;right:14px;background:var(--bg3);border:none;
      color:var(--text3);width:28px;height:28px;border-radius:7px;cursor:pointer;
      display:flex;align-items:center;justify-content:center;font-size:0.85rem;
      transition:all .15s;
    }
    .guest-modal-close:hover{background:var(--bg4);color:var(--text)}
    .gm-icon{font-size:2.4rem;margin-bottom:12px}
    .gm-title{font-size:1.2rem;font-weight:700;color:var(--text);margin-bottom:8px}
    .gm-sub{font-size:0.85rem;color:var(--text2);line-height:1.5;margin-bottom:20px}
    .gm-features{background:var(--bg3);border-radius:10px;padding:14px 16px;margin-bottom:20px;text-align:left}
    .gm-feat{display:flex;gap:8px;align-items:center;font-size:0.83rem;color:var(--text2);padding:4px 0}
    .gm-check{color:var(--green);font-weight:700}
    .gm-cta{
      width:100%;padding:12px;background:var(--accent);color:#fff;border:none;
      border-radius:10px;font-family:var(--sans);font-size:0.9rem;font-weight:600;
      cursor:pointer;margin-bottom:10px;transition:all .2s;
      box-shadow:0 4px 16px rgba(249,115,22,0.35);
    }
    .gm-cta:hover{background:var(--accent2);transform:translateY(-1px)}
    .gm-skip{
      width:100%;padding:10px;background:transparent;color:var(--text3);border:none;
      font-family:var(--sans);font-size:0.83rem;cursor:pointer;transition:color .15s;
    }
    .gm-skip:hover{color:var(--text2)}
  `;
  document.head.appendChild(style);
}
