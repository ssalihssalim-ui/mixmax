// ==================== POS-AUDIO.JS v9.1 – RAPIDE + FEEDBACK DIRECT ====================
// Mixmax Minimarket – Reconnaissance vocale optimisée

var voiceRecognition = null;
var isRecording = false;
var voiceMode = 'search';
var lastAddedProductId = null;
var voiceModeMessage = '🎤 Recherche vocale active';
var lastVoiceCommandTime = 0;
var voiceFlowPhase = 'idle';
var voiceFlowIndicator = null;
var micPermissionGranted = false;

// ========== INDEX CLIENT ==========
var clientSearchIndex = {};
var clientIndexBuilt = false;

// ========== PAYMENT STATE MACHINE ==========
window.voicePaymentState = 0;   // 0 = client, 1 = payment_mode, 2 = amount

var paymentKeywords = {
    'espece': ['espèces', 'espece', 'argent', 'cash', 'comptant', 'liquide', 'espèce'],
    'credit': ['crédit', 'credit', 'à crédit', 'acredit', 'dette', 'avance', 'crédit'],
    'partiel': ['partiel', 'partielle', 'acompte', 'moitié', 'partial', 'part', 'partiel']
};

var numberMap = {
    'wahed':1, 'ouais':1,'wad':1, 'un':1, 'une':1,
    'juge':2, 'joue':2, 'george':2, 'souche':2, 'deux':2,
    'claud':3, 'cl':3, 'trois':3, 'clé':3, 'clea':3, 'play':3,
    'rabah':4, 'quatre':4, 'arba':4, 'abba':4, 'rabat':4, 'rabats':4, 'alba':4,
    'cinq':5, 'hamza':5, 'rama':5, 'comme ça':5,
    'six':6, 'sept':7, 'huit':8, 'neuf':9, 'dix':10,
    'onze':11, 'douze':12, 'douz':12, 'treize':13, 'quatorze':14,
    'quinze':15, 'seize':16, 'vingt':20, 'trente':30, 'quarante':40,
    'cinquante':50, 'soixante':60, 'cent':100
};

// ========== UTILITAIRES ==========
function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]); }
function isIOSStandalone(){ return /iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream&&(window.navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches); }
function checkVoiceSupport(){ var i=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream; if(i&&isIOSStandalone()) return{supported:false,reason:'Ouvrez dans Safari pour le micro'}; if(!('webkitSpeechRecognition' in window)&&!('SpeechRecognition' in window)) return{supported:false,reason:'Navigateur non supporté'}; return{supported:true}; }
async function requestMicrophonePermission(){ if(micPermissionGranted) return true; try{ if(!navigator.mediaDevices?.getUserMedia) return false; const s=await navigator.mediaDevices.getUserMedia({audio:true}); s.getTracks().forEach(t=>t.stop()); micPermissionGranted=true; return true; }catch(e){ return false; } }

// ========== INDICATEURS VISUELS ==========
function showVoiceModeIndicator(){
    var ind=document.getElementById('voiceModeIndicator'); if(!ind){ var cont=document.querySelector('.pos-products-panel'); if(!cont) return; ind=document.createElement('div'); ind.id='voiceModeIndicator'; ind.style.cssText='background:#f0fdf4;border:2px solid #16a34a;border-radius:8px;padding:6px 12px;margin-bottom:8px;font-size:0.8rem;display:flex;align-items:center;gap:8px;color:#14532d;'; cont.insertBefore(ind,cont.firstChild); }
    var icon=voiceMode==='search'?'fa-microphone':(voiceMode==='quantity'?'fa-hashtag':(voiceMode==='client'?'fa-user':'fa-money-bill-wave'));
    var color=voiceMode==='search'?'#16a34a':(voiceMode==='quantity'?'#f59e0b':(voiceMode==='client'?'#4f46e5':'#dc2626'));
    ind.innerHTML='<i class="fas '+icon+'" style="color:'+color+';"></i> '+(voiceModeMessage||'🎤 Recherche vocale active')+' <span style="font-size:0.6rem;color:#94a3b8;margin-left:auto;">'+voiceMode+'</span>';
    ind.style.borderColor=color; ind.style.background=voiceMode==='search'?'#f0fdf4':'#fefce8';
}
function showVoiceResult(msg){
    var div=document.getElementById('voiceResultDisplay'); if(!div){ div=document.createElement('div'); div.id='voiceResultDisplay'; div.style.cssText='position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#2E7D32;color:#fff;padding:8px 16px;border-radius:12px;font-weight:600;font-size:0.85rem;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);display:none;max-width:90%;text-align:center;'; document.body.appendChild(div); }
    var isErr=msg.indexOf('⚠️')!==-1||msg.indexOf('❌')!==-1; div.style.background=isErr?'#ef4444':'#2E7D32'; div.textContent=msg; div.style.display='block';
    clearTimeout(window._voiceResultTimeout); window._voiceResultTimeout=setTimeout(function(){ div.style.display='none'; },1200);
}
function showVoiceFlowIndicator(phase) { /* inchangé, repris de l'original */ }
function hideVoiceFlowIndicator() { /* inchangé */ }
function showProcessingIndicator() { /* inchangé */ }

// ========== INDEX CLIENT ==========
function buildClientIndex() {
    if(clientIndexBuilt || !window.posAllClients?.length) return;
    clientSearchIndex={};
    window.posAllClients.forEach(function(c){
        if(!c?.id) return;
        var allText=(c.nom+' '+c.prenom+' '+c.telephone+' '+(c.description||'')).toLowerCase();
        allText.split(/[\s,;.]+/).forEach(function(mot){ mot=mot.trim(); if(mot.length>=1){ if(!clientSearchIndex[mot]) clientSearchIndex[mot]=[]; if(clientSearchIndex[mot].indexOf(c)===-1) clientSearchIndex[mot].push(c); } });
        var fullName=(c.nom+' '+c.prenom).toLowerCase().trim();
        if(fullName.length>=2){ if(!clientSearchIndex[fullName]) clientSearchIndex[fullName]=[]; if(clientSearchIndex[fullName].indexOf(c)===-1) clientSearchIndex[fullName].push(c); }
    });
    clientIndexBuilt=true;
}
function fastFindClient(query){
    buildClientIndex();
    var q=(query||'').toLowerCase().trim(); if(!q) return window.posAllClients?window.posAllClients.slice():[];
    var normalized=q.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    var mots=normalized.split(/[\s,;.]+/), seen={}, results=[];
    mots.forEach(function(mot){ mot=mot.trim(); if(!mot) return; (clientSearchIndex[mot]||[]).forEach(function(c){ if(!seen[c.id]){ seen[c.id]=true; results.push(c); } }); });
    if(results.length===0&&window.posAllClients){ results=window.posAllClients.filter(function(c){ var nom=(c.nom||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(), prenom=(c.prenom||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(), description=(c.description||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(), telephone=(c.telephone||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); return nom.indexOf(normalized)!==-1||prenom.indexOf(normalized)!==-1||description.indexOf(normalized)!==-1||telephone.indexOf(normalized)!==-1; }); }
    return results;
}
function invalidateClientIndex(){ clientIndexBuilt=false; clientSearchIndex={}; }

// ========== DÉTECTION ==========
function extractNumberFromTranscript(transcript) {
    var cleaned=transcript.toLowerCase().trim();
    var digits=cleaned.match(/\b\d+\b/); if(digits) return parseInt(digits[0]);
    for(var word in numberMap){ if(cleaned.indexOf(word)!==-1) return numberMap[word]; }
    return null;
}
function detectPaymentMode(transcript){
    var t=transcript.toLowerCase().trim();
    for(var mode in paymentKeywords){ if(paymentKeywords[mode].some(function(kw){ return t.indexOf(kw)!==-1; })) return mode; }
    return null;
}
function findBestProductMatch(term,products){
    var normalized=term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    var best=null, bestLen=0;
    for(var i=0;i<products.length;i++){ var p=products[i], nom=(p.nom||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); if(nom===normalized){ best=p; break; } if(nom.indexOf(normalized)!==-1&&nom.length>bestLen){ best=p; bestLen=nom.length; } var desc=(p.description||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); if(desc.indexOf(normalized)!==-1&&desc.length>bestLen){ best=p; bestLen=desc.length; } }
    return best;
}

// ========== COMMANDES ==========
function parseVoiceCommand(transcript){
    var cleaned=transcript.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    var currentPage=document.getElementById('pageTitle')?.textContent||'';

    // MODE QUANTITÉ
    if(voiceMode==='quantity'){
        var num=extractNumberFromTranscript(cleaned);
        if(num!==null&&num>0) return { type:'number', value:num };
        return { type:'ignore' };
    }

    // MODE PAIEMENT (étape 2)
    if(voiceMode==='payment'||(currentPage==='POS'&&(window.posStep||0)===2)){
        switch(window.voicePaymentState){
            case 0:
                if(window.posAllClients){
                    var clients=fastFindClient(cleaned);
                    if(clients.length===1) return { type:'client', client:clients[0] };
                    if(clients.length>1){
                        var best=clients.find(function(c){ return (c.nom+' '+c.prenom).toLowerCase().indexOf(cleaned)!==-1; })||clients[0];
                        return { type:'client', client:best };
                    }
                }
                var pm0=detectPaymentMode(cleaned); if(pm0) return { type:'payment_mode', mode:pm0 };
                return { type:'ignore' };
            case 1:
                var pm=detectPaymentMode(cleaned); if(pm) return { type:'payment_mode', mode:pm };
                return { type:'ignore' };
            case 2:
                var n=extractNumberFromTranscript(cleaned); if(n!==null&&n>0) return { type:'number', value:n };
                if(cleaned.includes('valide')||cleaned.includes('validé')||cleaned.includes('valider')||cleaned.includes('confirmer')||cleaned.includes('ok')) return { type:'validate' };
                return { type:'ignore' };
        }
    }

    // NAVIGATION
    if(cleaned.includes('crédits')||cleaned.includes('impayés')||cleaned.includes('liste des crédits')||cleaned.includes('dettes')||cleaned.includes('ardoises')) return { type:'navigate', page:'credits' };
    if(cleaned.includes('ventes')||cleaned.includes('vente')||cleaned.includes('historique ventes')||cleaned.includes('recettes')) return { type:'navigate', page:'ventes' };
    if(cleaned.includes('dashboard')||cleaned.includes('accueil')||cleaned.includes('home')||cleaned.includes('sommaire')) return { type:'navigate', page:'dashboard' };
    if(cleaned.includes('produits')||cleaned.includes('catalogue')) return { type:'navigate', page:'products' };
    if(cleaned.includes('clients')||cleaned.includes('clientèle')) return { type:'navigate', page:'clients' };
    if(cleaned.includes('commandes')) return { type:'navigate', page:'commandes' };
    if(cleaned.includes('catégories')) return { type:'navigate', page:'categories' };
    if(cleaned.includes('point de vente')||cleaned.includes('pos')||cleaned.includes('caisse')||cleaned.includes('encaissement')) return { type:'navigate', page:'pos' };

    // RECHERCHE PRODUIT (étape 1)
    if(currentPage==='POS'||currentPage==='Dashboard'){
        if(voiceMode==='search'&&(window.posStep||0)===1){
            var products=window.posProductsList||[];
            if(products.length){
                var words=cleaned.split(' '), searchTerm=words[0]; // premier mot
                var best=findBestProductMatch(searchTerm,products);
                if(!best&&words.length>1) best=findBestProductMatch(cleaned,products);
                if(best) return { type:'search_product', product:best };
            }
            if(cleaned.includes('passe')||cleaned.includes('passer')||cleaned.includes('suivant')) return { type:'next' };
            if(cleaned.includes('valide')||cleaned.includes('validé')||cleaned.includes('valider')||cleaned.includes('confirmer')||cleaned.includes('ok')) return { type:'validate' };
            if(cleaned.includes('annule')||cleaned.includes('annuler')) return { type:'cancel' };
            if(cleaned.includes('efface')||cleaned.includes('vider')) return { type:'clear' };
            if(cleaned.includes('termine')||cleaned.includes('terminer')||cleaned.includes('fin')) return { type:'finalize' };
        }
    }

    return { type:'ignore' };
}

// ========== HANDLE ==========
function handleVoiceCommand(cmd){
    var cp=document.getElementById('pageTitle')?.textContent||'';
    switch(cmd.type){
        case 'search_product':
            var searchInput=document.getElementById('posSearchInput');
            if(searchInput&&cmd.product){
                searchInput.value=cmd.product.nom;
                if(typeof window.posSearchProducts==='function') window.posSearchProducts(cmd.product.nom);
                showVoiceResult('🔍 '+cmd.product.nom+' – cliquez pour ajouter');
            }
            hideVoiceFlowIndicator(); break;
        case 'number':
            if(voiceMode==='quantity'&&lastAddedProductId){
                var qty=cmd.value, it=window.posCart?.find(function(x){ return x.id===lastAddedProductId; });
                if(it){
                    var p=window.posProductsList?.find(function(x){ return x.id===lastAddedProductId; });
                    if(p&&p.stock!==undefined&&qty>p.stock){ showVoiceResult('⚠️ Stock max: '+p.stock); return; }
                    it.quantite=qty; lastAddedProductId=null;
                    setVoiceMode('search','🎤 Recherche vocale active',null);
                    if(typeof window.updateCartOnly==='function') window.updateCartOnly();
                    showVoiceResult('✅ Qté: '+qty);
                }
            }else if(voiceMode==='payment'&&window.voicePaymentState===2){
                window.posAmountGiven=cmd.value;
                var ce=document.getElementById('posChangeDisplay'); if(ce){ var st=typeof window.posCalculateTotal==='function'?window.posCalculateTotal():0, t=st-(window.posDiscountMAD||0), c=window.posAmountGiven-t; ce.innerHTML=c>=0?'<div class="pos-change-positive"><span>Rendu</span><span>'+c.toFixed(2)+' MAD</span></div>':'<div class="pos-change-negative"><span>Manquant</span><span>'+Math.abs(c).toFixed(2)+' MAD</span></div>'; }
                var ai=document.getElementById('posAmountGiven'); if(ai) ai.value=window.posAmountGiven;
                showVoiceResult('💰 '+window.posAmountGiven.toFixed(2)+' MAD');
            }
            hideVoiceFlowIndicator(); break;
        case 'client':
            window.posCurrentClient={ id:cmd.client.id, name:cmd.client.nom+' '+cmd.client.prenom };
            window.posCurrentTable=''; var ci=document.getElementById('posClientSearchInput'); if(ci) ci.value=window.posCurrentClient.name;
            if(typeof window.updatePaymentButtons==='function') window.updatePaymentButtons();
            window.voicePaymentState=1;
            showVoiceResult('👤 '+window.posCurrentClient.name);
            hideVoiceFlowIndicator(); setTimeout(function(){ showVoiceFlowIndicator('payment_mode'); },100); break;
        case 'payment_mode':
            if(typeof window.posSetPaymentMethod==='function'){ window.posSetPaymentMethod(cmd.mode); window.voicePaymentState=2;
                showVoiceResult('💳 '+cmd.mode); if(cmd.mode==='espece'){ setTimeout(function(){ var ai=document.getElementById('posAmountGiven'); if(ai) ai.focus(); },200); } }
            hideVoiceFlowIndicator(); setTimeout(function(){ showVoiceFlowIndicator('payment_amount'); },100); break;
        case 'validate': case 'finalize':
            if(window.posStep===2&&typeof window.posFinalizeSale==='function'){ window.posFinalizeSale(); hideVoiceFlowIndicator(); }
            else if(window.posCart?.length>0&&window.posStep===1){ window.posGoToStep2(); hideVoiceFlowIndicator(); } break;
        case 'clear': if(typeof window.posResetCart==='function'){ window.posResetCart(); showVoiceResult('🗑️ Panier vidé'); } hideVoiceFlowIndicator(); break;
        case 'next': if(window.posCart?.length>0&&window.posStep===1) window.posGoToStep2(); hideVoiceFlowIndicator(); break;
        case 'cancel': setVoiceMode('search','🎤 Recherche vocale active',null); showVoiceResult('↩️ Recherche'); if(typeof window.renderPOS==='function') window.renderPOS(); hideVoiceFlowIndicator(); break;
        case 'navigate':
            var pages={ 'credits':'Crédits','ventes':'Ventes','dashboard':'Dashboard','products':'Produits','clients':'Clients','commandes':'Commandes en ligne','categories':'Catégories','pos':'POS' };
            if(cp===pages[cmd.page]){ showVoiceResult('✅ '+pages[cmd.page]); return; }
            if(typeof navigateTo==='function') navigateTo(cmd.page); hideVoiceFlowIndicator(); break;
        default: if(cmd.text&&typeof window.posSearchProducts==='function') window.posSearchProducts(cmd.text);
    }
}

// ========== SET VOCAL MODE ==========
function setVoiceMode(mode,msg,productId){
    voiceMode=mode; if(msg) voiceModeMessage=msg; if(productId!==undefined) lastAddedProductId=productId;
    if(mode==='payment') window.voicePaymentState=0;
    showVoiceModeIndicator();
}

// ========== MICRO (avec feedback direct) ==========
function posToggleVoiceSearch(){
    var s=checkVoiceSupport(); if(!s.supported){ alert('⚠️ '+s.reason); return; }
    if(!navigator.onLine){ alert('⚠️ Connexion internet requise.'); return; }
    if(isRecording){ posStopVoiceSearch(); return; }
    requestMicrophonePermission().then(function(p){ if(!p){ alert('❌ Micro refusé.'); return; } posStartVoiceRecording(); });
}

function posStartVoiceRecording(){
    var mb=document.getElementById('posMicBtn');
    if(voiceRecognition){ try{ voiceRecognition.abort(); }catch(e){} voiceRecognition=null; }
    var SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR){ alert('❌ Reconnaissance vocale non disponible.'); return; }
    voiceRecognition=new SR(); voiceRecognition.lang='fr-FR'; voiceRecognition.continuous=true; voiceRecognition.interimResults=true; voiceRecognition.maxAlternatives=1;
    if(mb){ mb.classList.add('recording'); mb.innerHTML='<i class="fas fa-circle" style="color:#ef4444;animation:pulse 0.5s ease-in-out infinite;"></i>'; mb.style.background='#fee2e2'; mb.style.borderColor='#ef4444'; }
    var lastInterim='';
    voiceRecognition.onresult=function(e){
        var interim='', final='';
        for(var i=e.resultIndex;i<e.results.length;i++){ var t=e.results[i][0].transcript; if(e.results[i].isFinal) final+=t; else interim+=t; }
        var cp=document.getElementById('pageTitle')?.textContent||'';
        if(cp==='Crédits'){ var vd=document.getElementById('creditsVoiceDisplay'); if(vd){ if(final){ vd.value=final; showProcessingIndicator(); var cmd=parseVoiceCommand(final); if(cmd.type!=='ignore') handleVoiceCommand(cmd); hideVoiceFlowIndicator(); }else if(interim&&interim!==lastInterim){ vd.value=interim+' ✍️'; lastInterim=interim; } } }
        else if(cp==='Ventes'){ var vd2=document.getElementById('ventesVoiceDisplay'); if(vd2){ if(final){ vd2.value=final; showProcessingIndicator(); var cmd=parseVoiceCommand(final); if(cmd.type!=='ignore') handleVoiceCommand(cmd); hideVoiceFlowIndicator(); }else if(interim&&interim!==lastInterim){ vd2.value=interim+' ✍️'; lastInterim=interim; } } }
        else{ var si=document.getElementById('posSearchInput'); if(si){ if(final){ si.value=final; showProcessingIndicator(); var cmd=parseVoiceCommand(final); if(cmd.type!=='ignore') handleVoiceCommand(cmd); hideVoiceFlowIndicator(); }else if(interim&&interim!==lastInterim){ si.value=interim+' ✍️'; lastInterim=interim; } } }
    };
    voiceRecognition.onend=function(){ if(isRecording){ setTimeout(function(){ try{ voiceRecognition.start(); }catch(e){ posStopVoiceSearch(); } },8); } };
    voiceRecognition.onerror=function(e){ if(e.error==='aborted'||e.error==='no-speech') return; if(e.error==='network') showVoiceResult('❌ Réseau'); posStopVoiceSearch(); };
    try{ voiceRecognition.start(); isRecording=true; showVoiceModeIndicator(); showVoiceResult('🎤 Écoute...'); showVoiceFlowIndicator('product'); }catch(e){ isRecording=false; if(mb){ mb.classList.remove('recording'); mb.innerHTML='<i class="fas fa-microphone"></i>'; mb.style.background='#dcfce7'; mb.style.borderColor='#16a34a'; } }
}

function posStopVoiceSearch(){
    if(voiceRecognition){ try{ voiceRecognition.abort(); }catch(e){} voiceRecognition=null; } isRecording=false;
    var mb=document.getElementById('posMicBtn'), si=document.getElementById('posSearchInput');
    if(mb){ mb.classList.remove('recording'); mb.innerHTML='<i class="fas fa-microphone"></i>'; mb.style.background='#dcfce7'; mb.style.borderColor='#16a34a'; }
    if(si){ si.placeholder='🔍 Rechercher...'; si.style.background='#fff'; si.style.borderColor='#e2e8f0'; }
    hideVoiceFlowIndicator(); showVoiceResult('🎤 Micro désactivé');
}

// ========== CRÉDITS (reprises de l'original) ==========
function activateCreditSelection(){ window.creditDeletePending=null; window.creditSelectionMode=true; window.creditSelectedIndex=-1; window.creditSelectAll=false; window.creditPaymentStep='idle'; if(typeof window.renderCreditsTable==='function') window.renderCreditsTable(); showVoiceResult('📋 Mode sélection'); }
function selectCreditLine(n){ window.creditDeletePending=null; var d=window.filteredCredits||window.allCreditsData||[]; var i=n-1; if(i<0||i>=d.length){ showVoiceResult('❌ Ligne '+n); return; } if(!window.creditSelectionMode){ showVoiceResult('⚠️ Sélectionnez d\'abord'); return; } window.creditSelectedIndex=i; window.creditSelectAll=false; window.creditPaymentStep='selection'; window.creditPaymentAmount=0; if(typeof window.renderCreditsTable==='function') window.renderCreditsTable(); var c=d[i]; showVoiceResult('✅ Ligne '+n+' - '+(c.clientName||'')+' - '+(c.remainingAmount||c.total||0).toFixed(2)+' MAD'); }
function markCreditForPayment(){ window.creditDeletePending=null; if(window.creditSelectedIndex<0){ showVoiceResult('⚠️ Aucune ligne'); return; } var d=window.filteredCredits||window.allCreditsData||[]; var c=d[window.creditSelectedIndex]; if(!c){ showVoiceResult('❌ Introuvable'); return; } if(c.paid){ showVoiceResult('⚠️ Déjà payé'); return; } window.creditPaymentStep='payment'; window.creditPaymentAmount=0; var r=c.remainingAmount||c.total||0; showVoiceResult('💳 Restant: '+r.toFixed(2)+' MAD'); var z=document.getElementById('creditPaymentZone'); if(z){ z.style.display='block'; var info=document.getElementById('creditPaymentInfo'); if(info) info.textContent='Client: '+(c.clientName||'Inconnu')+' | Restant: '+r.toFixed(2)+' MAD'; var inp=document.getElementById('creditPaymentAmountInput'); if(inp){ inp.value=''; inp.focus(); inp.select(); } } }
function setCreditPaymentAmount(a){ if(window.creditSelectedIndex<0){ showVoiceResult('⚠️ Aucun crédit'); return; } if(a<=0){ showVoiceResult('❌ Montant invalide'); return; } window.creditPaymentAmount=a; window.creditPaymentStep='amount'; var inp=document.getElementById('creditPaymentAmountInput'); if(inp) inp.value=a; showVoiceResult('💰 '+a.toFixed(2)+' MAD'); }
function validateCreditPayment(){ if(window.creditSelectedIndex<0){ showVoiceResult('⚠️ Aucun crédit'); return; } var inp=document.getElementById('creditPaymentAmountInput'); var a=parseFloat(inp?inp.value:window.creditPaymentAmount)||window.creditPaymentAmount||0; if(isNaN(a)||a<=0){ a=(window.filteredCredits||window.allCreditsData)[window.creditSelectedIndex]?.remainingAmount||(window.filteredCredits||window.allCreditsData)[window.creditSelectedIndex]?.total||0; if(a<=0){ showVoiceResult('❌ Montant invalide'); return; } } var d=window.filteredCredits||window.allCreditsData||[]; var c=d[window.creditSelectedIndex]; if(!c){ showVoiceResult('❌ Introuvable'); return; } var r=c.remainingAmount||c.total||0; if(a>r){ showVoiceResult('⚠️ > reste'); return; } var nr=r-a; var p=nr<=0.01; CacheDB.write('credits',c.id,{paid:p,remainingAmount:Math.max(0,nr),amountGiven:(c.amountGiven||0)+a,paidAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},'update').then(function(){ showVoiceResult(p?'✅ Soldé !':'✅ Payé. Reste: '+nr.toFixed(2)+' MAD'); window.creditPaymentStep='idle'; window.creditSelectedIndex=-1; window.creditPaymentAmount=0; window.creditSelectionMode=false; var z=document.getElementById('creditPaymentZone'); if(z) z.style.display='none'; if(typeof window.loadCredits==='function') window.loadCredits(); CacheDB.sync(); }).catch(function(e){ showVoiceResult('❌ Erreur'); }); }
function closeCreditSelection(){ window.creditDeletePending=null; window.creditSelectionMode=false; window.creditSelectedIndex=-1; window.creditSelectAll=false; window.creditPaymentAmount=0; window.creditPaymentStep='idle'; var z=document.getElementById('creditPaymentZone'); if(z) z.style.display='none'; if(typeof window.applyCreditsFilters==='function'){ window.creditsSearch=''; window.currentPages.credits=1; window.filteredCredits=null; window.applyCreditsFilters(); } showVoiceResult('📋 Liste complète'); }
function selectAllCredits(){ window.creditSelectAll=true; window.creditSelectedIndex=-1; if(typeof window.renderCreditsTable==='function') window.renderCreditsTable(); showVoiceResult('✅ Tous sélectionnés'); }
function deselectAllCredits(){ window.creditSelectAll=false; window.creditSelectedIndex=-1; if(typeof window.renderCreditsTable==='function') window.renderCreditsTable(); showVoiceResult('❌ Sélection annulée'); }
async function deleteAllCredits(){ var data=window.filteredCredits||window.allCreditsData||[]; if(data.length===0){ showVoiceResult('⚠️ Aucun crédit à supprimer'); return; } if(!confirm('Supprimer TOUS les crédits affichés ('+data.length+') ?')) return; try{ for(var i=0;i<data.length;i++){ await CacheDB.write('credits',data[i].id,null,'delete'); } window.allCreditsData=(window.allCreditsData||[]).filter(function(c){ return !data.some(function(d){ return d.id===c.id; }); }); if(typeof window.loadCredits==='function') window.loadCredits(); window.creditSelectionMode=false; window.creditSelectAll=false; window.creditSelectedIndex=-1; showVoiceResult('✅ '+data.length+' crédits supprimés'); CacheDB.sync(); }catch(e){ showVoiceResult('❌ Erreur suppression'); } }
function deleteCreditByVoice(lineNumber){ var data=window.filteredCredits||window.allCreditsData||[]; var i=lineNumber-1; if(i<0||i>=data.length){ showVoiceResult('❌ Ligne '+lineNumber); return; } var c=data[i]; if(!c){ showVoiceResult('❌ Crédit introuvable'); return; } window.creditDeletePending={lineNumber:lineNumber,credit:c}; showVoiceResult('🗑️ '+(c.clientName||'Inconnu')+' ? Dites valide/annule'); }
function deleteSelectedCredit(){ if(window.creditSelectAll){ deleteAllCredits(); return; } if(window.creditSelectedIndex<0){ showVoiceResult('⚠️ Aucune ligne'); return; } deleteCreditByVoice(window.creditSelectedIndex+1); }
async function confirmDeleteCredit(){ if(!window.creditDeletePending){ showVoiceResult('⚠️ Rien à supprimer'); return; } var c=window.creditDeletePending.credit; try{ if(typeof window.deleteCredit==='function'){ await window.deleteCredit(c.id); }else{ await db.collection('credits').doc(c.id).delete(); window.allCreditsData=(window.allCreditsData||[]).filter(function(x){ return x.id!==c.id; }); if(typeof window.loadCredits==='function') window.loadCredits(); } window.creditSelectedIndex=-1; window.creditSelectionMode=false; showVoiceResult('✅ Supprimé'); }catch(e){ showVoiceResult('❌ Erreur'); } window.creditDeletePending=null; }
function cancelDeleteCredit(){ if(window.creditDeletePending){ window.creditDeletePending=null; showVoiceResult('↩️ Annulé'); } }

// ========== EXPORTS ==========
window.posToggleVoiceSearch=posToggleVoiceSearch; window.showVoiceResult=showVoiceResult;
window.setVoiceMode=setVoiceMode; window.showVoiceModeIndicator=showVoiceModeIndicator;
window.activateCreditSelection=activateCreditSelection; window.selectCreditLine=selectCreditLine;
window.markCreditForPayment=markCreditForPayment; window.setCreditPaymentAmount=setCreditPaymentAmount;
window.validateCreditPayment=validateCreditPayment; window.closeCreditSelection=closeCreditSelection;
window.parseVoiceCommand=parseVoiceCommand; window.handleVoiceCommand=handleVoiceCommand;
window.invalidateClientIndex=invalidateClientIndex; window.deleteCreditByVoice=deleteCreditByVoice;
window.deleteSelectedCredit=deleteSelectedCredit; window.confirmDeleteCredit=confirmDeleteCredit;
window.cancelDeleteCredit=cancelDeleteCredit; window.showVoiceFlowIndicator=showVoiceFlowIndicator;
window.hideVoiceFlowIndicator=hideVoiceFlowIndicator; window.showProcessingIndicator=showProcessingIndicator;
window.onProductAdded=function(pid){ lastAddedProductId=pid; setVoiceMode('quantity','🔢 Qté',pid); showVoiceModeIndicator(); hideVoiceFlowIndicator(); setTimeout(function(){ showVoiceFlowIndicator('quantity'); },100); };
window.selectAllCredits=selectAllCredits; window.deselectAllCredits=deselectAllCredits; window.deleteAllCredits=deleteAllCredits;

console.log('🎤 Module vocal – rapide avec feedback direct OK');
