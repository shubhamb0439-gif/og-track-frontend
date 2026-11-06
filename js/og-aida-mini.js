/* ============================================================================
   AIDA mini chat panel — shared UI for index.html and masteradmin.html
   ----------------------------------------------------------------------------
   Pure UI. Each page registers an adapter that talks to its OWN existing AIDA
   chat endpoint and shares its existing `aidaMessages` transcript, so the
   mini panel, the full Chats screen and the talking AIDA overlay all show the
   same conversation:

     AidaMini.init({
       subtitle, welcome:{title,text}, suggestions:[...],
       getMessages()            -> [{role:'user'|'assistant', content}]
       ensureHistory()          -> Promise (loads saved history once)
       send(text, {retry})      -> Promise (pushes into the shared transcript;
                                   throws Error(message) on failure)
       openFull(), openVoice()  -> open the existing full chat / talking UI
     })
   ============================================================================ */
(function(){
  'use strict';
  var A=null, el=null, scrim=null, state={busy:false, error:null, loading:false, historyAsked:false};
  var LOGO='/images/aida-logo.svg';
  var ICON={
    expand:'<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>',
    voice:'<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>',
    close:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    send:'<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    alert:'<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>'
  };
  function svg(n){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+ICON[n]+'</svg>'; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function launcher(){ return document.getElementById('aida-launcher-btn'); }
  function isOpen(){ return !!(el&&el.classList.contains('open')); }

  // Light, safe formatting for replies: escaped first, then **bold**,
  // `code`, simple "- " lists and line breaks. Chart blocks are only drawn
  // in the full chat, so they're replaced with a pointer to it.
  function format(text){
    var hasChart=false;
    var t=String(text||'').replace(/```aida-chart[\s\S]*?```/g,function(){ hasChart=true; return ''; });
    t=esc(t.trim())
      .replace(/```([\s\S]*?)```/g,function(_,c){ return '<code>'+c.trim()+'</code>'; })
      .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
      .replace(/`([^`]+)`/g,'<code>$1</code>');
    var lines=t.split('\n'), out='', inList=false;
    lines.forEach(function(l){
      var m=/^\s*[-•*]\s+(.*)$/.exec(l);
      if(m){ if(!inList){ out+='<ul>'; inList=true; } out+='<li>'+m[1]+'</li>'; }
      else { if(inList){ out+='</ul>'; inList=false; } out+=(out&&!/<\/ul>$/.test(out)?'<br>':'')+l; }
    });
    if(inList) out+='</ul>';
    if(hasChart) out+='<span class="amc-note">This reply includes a chart. <button type="button" data-amc="full">Open full chat</button> to view it.</span>';
    return out||'(no response)';
  }

  function brandColours(){
    var accent=(getComputedStyle(document.documentElement).getPropertyValue('--red')||'').trim()||'#C0392B';
    var h=accent.replace('#',''), f=h.length===3?h.split('').map(function(c){return c+c;}).join(''):h, light=false;
    if(/^[0-9a-f]{6}$/i.test(f)){
      var lum=[0,2,4].map(function(i){ var v=parseInt(f.slice(i,i+2),16)/255; return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4); });
      light=(.2126*lum[0]+.7152*lum[1]+.0722*lum[2])>.45;
    }
    el.style.setProperty('--amc-accent',accent);
    el.style.setProperty('--amc-on-accent',light?'#18181B':'#FFFFFF');
  }

  function build(){
    el=document.createElement('section');
    el.className='amc'; el.id='aida-mini-chat';
    el.setAttribute('role','dialog'); el.setAttribute('aria-labelledby','amcTitle'); el.setAttribute('aria-hidden','true');
    el.innerHTML=
      '<header class="amc-head">'+
        '<div class="amc-avatar"><img src="'+LOGO+'" alt=""></div>'+
        '<div class="amc-title"><strong id="amcTitle">AIDA</strong><span>'+esc(A.subtitle||'Your workspace assistant')+'</span></div>'+
        '<div class="amc-actions">'+
          '<button type="button" class="amc-icon" data-amc="full" data-tip="Open full chat" aria-label="Open full chat">'+svg('expand')+'</button>'+
          '<button type="button" class="amc-icon" data-amc="voice" data-tip="Talk to AIDA" aria-label="Talk to AIDA">'+svg('voice')+'</button>'+
          '<button type="button" class="amc-icon" data-amc="close" data-tip="Close" aria-label="Close chat">'+svg('close')+'</button>'+
        '</div>'+
      '</header>'+
      '<div class="amc-body">'+
        '<div class="amc-empty">'+
          '<div class="amc-hero"><img src="'+LOGO+'" alt=""></div>'+
          '<h2>'+esc((A.welcome&&A.welcome.title)||'How can I help today?')+'</h2>'+
          '<p>'+esc((A.welcome&&A.welcome.text)||'')+'</p>'+
          '<div class="amc-chips">'+(A.suggestions||[]).map(function(s){ return '<button type="button" class="amc-chip">'+esc(s)+'</button>'; }).join('')+'</div>'+
        '</div>'+
        '<div class="amc-list" id="amcList" aria-live="polite"></div>'+
      '</div>'+
      '<div class="amc-compose">'+
        '<textarea class="amc-input" id="amcInput" rows="1" placeholder="Ask AIDA anything…" aria-label="Message AIDA"></textarea>'+
        '<button type="button" class="amc-send" id="amcSend" aria-label="Send message">'+svg('send')+'</button>'+
      '</div>';
    // Blurred backdrop behind the panel; clicking it closes the panel.
    scrim=document.createElement('div');
    scrim.className='amc-scrim'; scrim.setAttribute('aria-hidden','true');
    scrim.addEventListener('click',function(){ close(); });
    document.body.appendChild(scrim);
    document.body.appendChild(el);

    var input=el.querySelector('#amcInput');
    el.addEventListener('click',function(e){
      var b=e.target.closest('[data-amc]'); if(!b) return;
      var act=b.getAttribute('data-amc');
      if(act==='close') close();
      else if(act==='full'){ close({keepFocus:true}); A.openFull(); }
      else if(act==='voice'){ close({keepFocus:true}); A.openVoice(); }
    });
    el.querySelectorAll('.amc-chip').forEach(function(c){ c.addEventListener('click',function(){ submit(c.textContent); }); });
    el.querySelector('#amcSend').addEventListener('click',function(){ submit(input.value); });
    input.addEventListener('keydown',function(e){ if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){ e.preventDefault(); submit(input.value); } });
    input.addEventListener('input',autosize);
    document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&isOpen()) close(); });
    window.addEventListener('resize',function(){ if(isOpen()) position(); });
  }

  function autosize(){ var i=el.querySelector('#amcInput'); i.style.height='auto'; i.style.height=Math.min(i.scrollHeight,120)+'px'; }

  // Floats just above the launcher, wherever that sits on this page.
  function position(){
    var l=launcher(); if(!l||window.innerWidth<=640) return;
    var r=l.getBoundingClientRect(); if(!r.width) return;
    el.style.right=Math.max(12,window.innerWidth-r.right)+'px';
    el.style.bottom=Math.max(12,window.innerHeight-r.top+12)+'px';
  }

  function render(){
    if(!el) return;
    var list=el.querySelector('#amcList');
    var msgs=(A.getMessages()||[]).filter(function(m){ return m&&(m.role==='user'||m.role==='assistant')&&m.content; }).slice(-60);
    if(state.loading){ el.classList.remove('is-empty'); list.innerHTML='<div class="amc-loading">Loading conversation…</div>'; return; }
    el.classList.toggle('is-empty',!msgs.length&&!state.busy&&!state.error);
    var avatar='<div class="amc-av"><img src="'+LOGO+'" alt=""></div>';
    var html=msgs.map(function(m){
      return m.role==='user'
        ? '<div class="amc-msg user"><div class="amc-bubble">'+esc(m.content).replace(/\n/g,'<br>')+'</div></div>'
        : '<div class="amc-msg aida">'+avatar+'<div class="amc-bubble">'+format(m.content)+'</div></div>';
    }).join('');
    if(state.busy) html+='<div class="amc-msg aida amc-typing" aria-label="AIDA is typing">'+avatar+'<div class="amc-bubble"><span></span><span></span><span></span></div></div>';
    if(state.error) html+='<div class="amc-error" role="alert">'+svg('alert')+'<span>'+esc(state.error.message)+'</span><button type="button" class="amc-retry">Retry</button></div>';
    list.innerHTML=html;
    var retry=list.querySelector('.amc-retry');
    if(retry) retry.addEventListener('click',function(){ var t=state.error.text; state.error=null; submit(t,true); });
    list.scrollTop=list.scrollHeight;
  }

  async function submit(text,isRetry){
    text=String(text||'').trim();
    if(!text||state.busy) return;
    var input=el.querySelector('#amcInput'), btn=el.querySelector('#amcSend');
    if(!isRetry){ input.value=''; autosize(); }
    state.error=null; state.busy=true; btn.disabled=true;
    render();
    try{
      var p=A.send(text,{retry:!!isRetry});
      render(); // the adapter has pushed the user's message by now
      await p;
    }catch(e){
      state.error={message:(e&&e.message)||'AIDA could not respond right now.', text:text};
    }finally{
      state.busy=false; btn.disabled=false; render();
      if(isOpen()) input.focus();
    }
  }

  async function open(){
    if(!A) return;
    if(!el) build();
    brandColours(); position();
    el.classList.add('open'); el.setAttribute('aria-hidden','false');
    scrim.classList.add('open');
    document.body.classList.add('amc-sheet-open');
    var l=launcher(); if(l){ l.setAttribute('aria-expanded','true'); l.setAttribute('aria-controls','aida-mini-chat'); }
    render();
    setTimeout(function(){ if(isOpen()) el.querySelector('#amcInput').focus(); },180);
    if(!state.historyAsked&&A.ensureHistory){
      state.historyAsked=true;
      if(!(A.getMessages()||[]).length){ state.loading=true; render(); }
      try{ await A.ensureHistory(); }catch(e){}
      state.loading=false; render();
    }
  }
  function close(opts){
    if(!el||!isOpen()) return;
    el.classList.remove('open'); el.setAttribute('aria-hidden','true');
    scrim.classList.remove('open');
    document.body.classList.remove('amc-sheet-open');
    var l=launcher(); if(l){ l.setAttribute('aria-expanded','false'); if(!(opts&&opts.keepFocus)) l.focus(); }
  }

  window.AidaMini={
    init:function(adapter){ A=adapter; },
    open:open,
    close:close,
    toggle:function(){ isOpen()?close():open(); },
    isOpen:isOpen,
    refresh:render,
    // signing out: hide the panel and forget panel-only state
    reset:function(){ close({keepFocus:true}); state={busy:false,error:null,loading:false,historyAsked:false}; if(el){ el.remove(); el=null; } if(scrim){ scrim.remove(); scrim=null; } }
  };
})();
