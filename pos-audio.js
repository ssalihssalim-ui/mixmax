// ==================== POS-AUDIO.JS v9.2 – FLEXIBLE ÉTAPE 2 ====================
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

// ========== MOTS-CLÉS PAIEMENT ==========
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
function showVoiceModeIndicator(){ /* identique à la version précédente */ }
function showVoiceResult(msg){ /* identique */ }
function showVoiceFlowIndicator(phase) { /* identique */ }
function hideVoiceFlowIndicator() { /* identique */ }
function showProcessingIndicator() { /* identique */ }

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

// ========== COMMANDES (FLEXIBLE ÉTAPE 2) ==========
function parseVoiceCommand(transcript){
    var cleaned=transcript.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    var currentPage=document.getElementById('pageTitle')?.textContent||'';

    // MODE QUANTITÉ
    if(voiceMode==='quantity'){
        var num=extractNumberFromTranscript(cleaned);
        if(num!==null&&num>0) return { type:'number', value:num };
        return { type:'ignore' };
    }

    // MODE PAIEMENT (étape 2) – FLEXIBLE
    if(voiceMode==='payment'||(currentPage==='POS'&&(window.posStep||0)===2)){
        // 1. Nombre → montant
        var n=extractNumberFromTranscript(cleaned);
        if(n!==null&&n>0) return { type:'number', value:n };

        // 2. Mode de paiement
        var pm=detectPaymentMode(cleaned);
        if(pm) return { type:'payment_mode', mode:pm };

        // 3. Client (ou table)
        if(window.posAllClients){
            var clients=fastFindClient(cleaned);
            if(clients.length===1) return { type:'client', client:clients[0] };
            if(clients.length>1){
                var best=clients.find(function(c){ return (c.nom+' '+c.prenom).toLowerCase().indexOf(cleaned)!==-1; })||clients[0];
                return { type:'client', client:best };
            }
        }

        // 4. Commandes de finalisation
        if(cleaned.includes('valide')||cleaned.includes('validé')||cleaned.includes('valider')||cleaned.includes('confirmer')||cleaned.includes('ok')) return { type:'validate' };
        if(cleaned.includes('termine')||cleaned.includes('terminer')||cleaned.includes('fin')) return { type:'finalize' };
        if(cleaned.includes('annule')||cleaned.includes('annuler')) return { type:'cancel' };

        return { type:'ignore' };
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
                var words=cleaned.split(' '), searchTerm=words[0];
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
            }else if(voiceMode==='payment'||(window.posStep||0)===2){
                // Montant donné
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
            showVoiceResult('👤 '+window.posCurrentClient.name);
            hideVoiceFlowIndicator(); break;
        case 'payment_mode':
            if(typeof window.posSetPaymentMethod==='function'){
                window.posSetPaymentMethod(cmd.mode);
                showVoiceResult('💳 '+cmd.mode);
                if(cmd.mode==='espece'){ setTimeout(function(){ var ai=document.getElementById('posAmountGiven'); if(ai) ai.focus(); },200); }
            }
            hideVoiceFlowIndicator(); break;
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

// ========== CRÉDITS (inchangé) ==========
function activateCreditSelection(){ /* ... idem ... */ }
function selectCreditLine(n){ /* ... */ }
function markCreditForPayment(){ /* ... */ }
function setCreditPaymentAmount(a){ /* ... */ }
function validateCreditPayment(){ /* ... */ }
function closeCreditSelection(){ /* ... */ }
function selectAllCredits(){ /* ... */ }
function deselectAllCredits(){ /* ... */ }
async function deleteAllCredits(){ /* ... */ }
function deleteCreditByVoice(lineNumber){ /* ... */ }
function deleteSelectedCredit(){ /* ... */ }
async function confirmDeleteCredit(){ /* ... */ }
function cancelDeleteCredit(){ /* ... */ }

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

console.log('🎤 Module vocal – flexible étape 2 OK');
