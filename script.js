/* AutoPaperEval - app.js (New flow)
   - First screen: Register (full page)
   - Then Login
   - Then Dashboard
   - Uses only HTML/CSS/JS, stores minimal data in localStorage for demo.
   - Key parsing (CSV/JSON/TXT) and simple OMR/handwritten handling included.
   - Placeholder function `openRouterOCR` provided — paste your OpenRouter API key via Settings button.

   IMPORTANT: This frontend demo stores accounts in browser localStorage. Do NOT use this for real authentication in production.
*/
(function(){
  'use strict';

  /* ---------- Helpers ---------- */
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  const LS = {
    get(k, d=null){ try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch(e){ return d; } },
    set(k,v){ localStorage.setItem(k, JSON.stringify(v)); },
    del(k){ localStorage.removeItem(k); }
  };

  function uid(prefix='id_'){ return prefix + Math.random().toString(36).slice(2,9); }
  function hashPw(p){ let h=5381; for(let i=0;i<p.length;i++){ h=(h*33) ^ p.charCodeAt(i); } return (h>>>0).toString(16); }
  function toast(msg, ms=2200){ const el = document.createElement('div'); el.textContent=msg; Object.assign(el.style,{position:'fixed',right:'18px',bottom:'18px',background:'#0f1724',color:'#e6eef8',padding:'10px 14px',borderRadius:'10px',zIndex:9999,boxShadow:'0 8px 30px rgba(0,0,0,0.5)'}); document.body.appendChild(el); setTimeout(()=> el.style.opacity=0, ms-300); setTimeout(()=> el.remove(), ms); }

  /* ---------- App State ---------- */
  const State = {
    currentUser: LS.get('ape_currentUser', null),
    accounts: LS.get('ape_accounts', {}), // email -> {name,email,passwordHash}
    evaluations: LS.get('ape_evaluations', []),
    results: LS.get('ape_results', {}),
    settings: LS.get('ape_settings', {openrouterKey: ''})
  };

  /* ---------- Page routing ---------- */
  function showPage(id){ // id: 'register' | 'login' | 'dashboard'
    ['#page-register','#page-login','#page-dashboard'].forEach(p=> $(p).classList.remove('active'));
    $(`#page-${id}`).classList.add('active');
  }

  /* ---------- Auth ---------- */
  function saveAccounts(){ LS.set('ape_accounts', State.accounts); }
  function saveCurrentUser(){ LS.set('ape_currentUser', State.currentUser); }
  function saveEvals(){ LS.set('ape_evaluations', State.evaluations); }
  function saveResults(){ LS.set('ape_results', State.results); }
  function saveSettings(){ LS.set('ape_settings', State.settings); }

  function register(name,email,password){
    if (!name||!email||!password) throw new Error('All fields required');
    if (State.accounts[email]) throw new Error('Account exists with this email');
    State.accounts[email] = {name, email, passwordHash: hashPw(password)};
    saveAccounts();
  }
  function login(email,password){
    const acc = State.accounts[email]; if (!acc) throw new Error('No account found');
    if (acc.passwordHash !== hashPw(password)) throw new Error('Invalid credentials');
    State.currentUser = email; saveCurrentUser(); return acc;
  }
  function logout(){ State.currentUser = null; saveCurrentUser(); showPage('login'); toast('Logged out'); }

  /* ---------- UI wiring ---------- */
  function initUI(){
    // switch links
    $('#goto-login').addEventListener('click', ()=> showPage('login'));
    $('#goto-register').addEventListener('click', ()=> showPage('register'));

    // register form
    $('#form-register').addEventListener('submit', (ev)=>{
      ev.preventDefault(); try{
        const name = $('#reg-name').value.trim(); const email = $('#reg-email').value.trim().toLowerCase();
        const pw = $('#reg-password').value; const pw2 = $('#reg-password2').value;
        if (pw !== pw2) { toast('Passwords do not match'); return; }
        register(name,email,pw); toast('Account created — please login');
        $('#form-register').reset(); showPage('login');
      }catch(e){ toast(e.message); }
    });

    // login form
    $('#form-login').addEventListener('submit', (ev)=>{
      ev.preventDefault(); try{
        const email = $('#login-email').value.trim().toLowerCase(); const pw = $('#login-password').value;
        const acc = login(email,pw);
        toast('Welcome '+acc.name);
        prepareDashboard(); showPage('dashboard');
      }catch(e){ toast(e.message); }
    });

    // topbar nav
    $('#logout').addEventListener('click', ()=> logout());
    $('#nav-settings').addEventListener('click', ()=> openSettings());

    // forms on dashboard
    $('#form-qp-key').addEventListener('submit', handleQPKey);
    $('#form-answers').addEventListener('submit', handleAnswersUpload);

    // initialize pages based on state
    if (!State.currentUser){ showPage('register'); } else { prepareDashboard(); showPage('dashboard'); }
  }

  /* ---------- Settings ---------- */
  function openSettings(){
    const cur = State.settings.openrouterKey || '';
    const k = prompt('Paste your OpenRouter API key (stored locally in browser). Leave blank to clear.', cur);
    if (k === null) return; // cancelled
    State.settings.openrouterKey = k.trim(); saveSettings(); toast('Settings saved');
  }

  function getOpenRouterKey(){ return State.settings.openrouterKey || ''; }

  /* ---------- Key parsing ---------- */
  function readFileAsText(file){ return new Promise((res,rej)=>{ const fr = new FileReader(); fr.onload = ()=> res(fr.result); fr.onerror = rej; fr.readAsText(file); }); }

  async function parseKeyFile(file, hint){
    const txt = await readFileAsText(file);
    const name = (file.name||'').toLowerCase();
    // CSV parse
    if (hint === 'omr-csv' || name.endsWith('.csv')){
      const rows = txt.split(/\r?\n/).map(r=>r.trim()).filter(Boolean);
      const map = {};
      for (const r of rows){ const parts = r.split(/[;,\t]/).map(p=>p.trim()); if (parts.length>=2){ const q = parts[0].replace(/[^0-9]/g,''); map[q||(Object.keys(map).length+1)] = String(parts[1]).toUpperCase(); } }
      if (Object.keys(map).length) return {format:'omr-csv', map};
    }
    // JSON
    try{ const j = JSON.parse(txt); if (j && typeof j === 'object'){ const map={}; if (Array.isArray(j)){ j.forEach((v,i)=> map[i+1]=String(v)); } else { Object.keys(j).forEach(k=>map[k]=String(j[k])); } return {format:'mcq-json', map}; } }catch(e){}
    // TXT simple lines
    const lines = txt.split(/\r?\n/).map(r=>r.trim()).filter(Boolean);
    const map = {};
    for (const l of lines){ const m = l.match(/(\d+)\s*[:\-\)]?\s*([A-Za-z0-9])/); if (m) map[m[1]] = m[2].toUpperCase(); }
    if (Object.keys(map).length) return {format:'custom-txt', map};
    throw new Error('Unable to parse key file');
  }

  /* ---------- Sheet detection & extraction (simple) ---------- */
  // Heuristics - for demo only
  function detectSheetTypeFromName(file){ const n = (file.name||'').toLowerCase(); if (n.includes('omr')||n.includes('mcq')||n.includes('bubble')) return 'omr'; if (n.endsWith('.pdf')) return 'handwritten'; return 'handwritten'; }

  // Simulated OMR extraction (demo) — returns map of answers biased to key
  async function simulateOMRExtract(file, keyMap){ await new Promise(r=>setTimeout(r, 300 + Math.random()*600)); const out = {}; for (const q of Object.keys(keyMap)){ if (Math.random()<0.06){ out[q]=''; continue;} if (Math.random()<0.78) out[q] = keyMap[q]; else { const opts = ['A','B','C','D','E'].filter(x=>x!==keyMap[q]); out[q]=opts[Math.floor(Math.random()*opts.length)]; } } return out; }

  // OpenRouter OCR placeholder — adjust per your endpoint if you have it
  async function openRouterOCR(file){
    const key = getOpenRouterKey(); if (!key) throw new Error('OpenRouter key not set in Settings');
    // NOTE: This demo simply rejects because we cannot call external APIs here.
    // Replace this block with a real fetch() to your OCR/LLM endpoint when integrating.
    throw new Error('OpenRouter OCR not implemented in demo. Add real integration in app.js');
  }

  /* ---------- Scoring ---------- */
  function scoreAnswers(keyMap, studentMap){ const total = Object.keys(keyMap).length; let correct=0, wrong=0, unattempt=0; for (const q of Object.keys(keyMap)){ const k = String(keyMap[q]).toUpperCase(); const s = (studentMap[q]||'').toUpperCase(); if (!s) unattempt++; else if (s===k) correct++; else wrong++; } const score = Math.round((correct/total)*100); return {score,total,correct,wrong,unattempt}; }

  /* ---------- Handlers ---------- */
  async function handleQPKey(ev){ ev.preventDefault(); const qp = $('#qp-file').files[0]; const kf = $('#key-file').files[0]; const hint = $('#key-format').value; if (!qp||!kf){ toast('Please choose both question paper and key file'); return; }
    try{
      const parsed = await parseKeyFile(kf, hint);
      const evalObj = {id: uid('eval_'), qpName: qp.name, keyName: kf.name, createdAt: new Date().toISOString(), keyFormat: parsed.format, keyMap: parsed.map};
      State.evaluations.push(evalObj); saveEvals(); State.results[evalObj.id] = State.results[evalObj.id] || []; saveResults(); toast('Evaluation created'); renderDashboardSummary();
    }catch(e){ toast('Key parse failed: '+e.message); }
  }

  async function handleAnswersUpload(ev){ ev.preventDefault(); const files = Array.from($('#answer-files').files || []); if (!files.length){ toast('Choose student answer files'); return; }
    // pick latest evaluation
    if (!State.evaluations.length){ toast('No evaluation found. Upload QP & Key first'); return; }
    const evalObj = State.evaluations[State.evaluations.length-1]; const keyMap = evalObj.keyMap;

    for (let i=0;i<files.length;i++){
      const f = files[i]; try{
        const type = detectSheetTypeFromName(f);
        let answers = {};
        if (type === 'omr'){
          answers = await simulateOMRExtract(f, keyMap);
        } else {
          // attempt OpenRouter OCR if available — otherwise fallback to empty
          try{ answers = await openRouterOCR(f); } catch(err){ console.warn('OCR fallback', err.message); answers = {}; }
        }
        const sc = scoreAnswers(keyMap, answers);
        const row = {id: uid('r_'), fileName: f.name, studentId: f.name.split('.')[0], detection: type, raw: answers, ...sc};
        State.results[evalObj.id].push(row); saveResults(); appendResultRow(row);
      }catch(err){ console.error(err); toast('Failed file: '+f.name); }
    }
    renderDashboardSummary();
  }

  /* ---------- Rendering ---------- */
  function prepareDashboard(){ // set greeting and render data
    const acc = State.accounts[State.currentUser]; const name = acc?acc.name:'Staff';
    // inject greeting into topbar h2
    const h = $('#page-dashboard .topbar h2'); h.textContent = `AutoPaperEval – Dashboard • ${name}`;
    renderDashboardSummary(); renderResultsTable();
  }

  function renderDashboardSummary(){
    $('#total-evals').textContent = State.evaluations.length;
    // count pending sheets for latest eval
    const latest = State.evaluations[State.evaluations.length-1]; let pending = 0; let avg='–';
    if (latest){ const res = State.results[latest.id]||[]; pending = Math.max(0, 0); // we don't track pending separately in demo
      if (res.length){ const avgScore = Math.round(res.reduce((s,r)=>s+(r.score||0),0)/res.length); avg = avgScore+'%'; }
    }
    $('#pending-sheets').textContent = pending;
    $('#avg-score').textContent = avg;
  }

  function appendResultRow(r){ const tbody = $('#results-table tbody'); const tr = document.createElement('tr'); tr.innerHTML = `<td>${escapeHtml(r.studentId)}</td><td>${r.score}%</td><td>${r.correct}</td><td>${r.wrong}</td>`; tbody.appendChild(tr); }

  function renderResultsTable(){ const tbody = $('#results-table tbody'); tbody.innerHTML = ''; if (!State.evaluations.length) return; const latest = State.evaluations[State.evaluations.length-1]; const rows = State.results[latest.id] || []; rows.forEach(r=> appendResultRow(r)); }

  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', ()=> initUI());

})();
