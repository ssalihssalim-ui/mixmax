// ==================== POS-AUDIO.JS v8.1.2 FINAL – COMMANDES VENTES ENRICHIES ====================
// Mixmax Minimarket – Filtres, mode sélection, actions sur ventes

var voiceRecognition = null;
var isRecording = false;
var voiceTimeout = null;
var searchTimeout = null;

var voiceMode = 'search';
var lastAddedProductId = null;
var voiceModeMessage = '🎤 Recherche vocale active';
var lastVoiceCommandTime = 0;

var voiceFlowPhase = 'idle';
var voiceFlowIndicator = null;

var micPermissionGranted = false;

var paymentKeywords = {
    'espece': ['espèces', 'espece', 'argent', 'cash', 'comptant', 'liquide', 'espèce'],
    'credit': ['crédit', 'credit', 'à crédit', 'acredit', 'dette', 'avance', 'crédit'],
    'partiel': ['partiel', 'partielle', 'acompte', 'moitié', 'partial', 'part', 'partiel']
};

var numberMap = {
    'wahed': 1, 'ouais': 1,'wad': 1, 'un': 1, 'une': 1, 'juge': 2, 'joue': 2, 'george': 2, 'souche': 2, 'deux': 2, 'claud': 3, 'cl': 3, 'trois': 3, 'clé': 3, 'clea': 3, 'play': 3, 'rabah': 4, 'quatre': 4, 'arba': 4, 'abba': 4, 'rabat': 4, 'rabats': 4, 'alba': 4, 'cinq': 5,
    'hamza': 5, 'rama': 5, 'comme ça': 5,
    'six': 6, 'sept': 7, 'huit': 8, 'neuf': 9, 'dix': 10,
    'onze': 11, 'douze': 12, 'douz': 12, 'treize': 13, 'quatorze': 14,
    'quinze': 15, 'seize': 16, 'vingt': 20, 'trente': 30, 'quarante': 40,
    'cinquante': 50, 'soixante': 60, 'cent': 100
};

window.creditSelectionMode = false;
window.creditSelectedIndex = -1;
window.creditPaymentAmount = 0;
window.creditPaymentStep = 'idle';
var creditDeletePending = null;

window.venteSelectionMode = false;
window.venteSelectedIndex = -1;
window.creditSelectAll = false;

// ========== INDEX DE RECHERCHE CLIENT ==========
var clientSearchIndex = {};
var clientIndexBuilt = false;

function buildClientIndex() {
    if (clientIndexBuilt || !window.posAllClients || !window.posAllClients.length) return;
    clientSearchIndex = {};
    window.posAllClients.forEach(function(c) {
        if (!c || !c.id) return;
        var allText = (c.nom + ' ' + c.prenom + ' ' + c.telephone + ' ' + (c.description || '')).toLowerCase();
        var mots = allText.split(/[\s,;.]+/);
        mots.forEach(function(mot) {
            mot = mot.trim();
            if (mot.length >= 1) {
                if (!clientSearchIndex[mot]) clientSearchIndex[mot] = [];
                if (clientSearchIndex[mot].indexOf(c) === -1) clientSearchIndex[mot].push(c);
            }
        });
        var fullName = (c.nom + ' ' + c.prenom).toLowerCase().trim();
        if (fullName.length >= 2) {
            if (!clientSearchIndex[fullName]) clientSearchIndex[fullName] = [];
            if (clientSearchIndex[fullName].indexOf(c) === -1) clientSearchIndex[fullName].push(c);
        }
    });
    clientIndexBuilt = true;
}

function fastFindClient(query) {
    buildClientIndex();
    var q = query.toLowerCase().trim();
    if (!q || q.length < 1) return window.posAllClients ? window.posAllClients.slice() : [];
    q = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var mots = q.split(/[\s,;.]+/);
    var seen = {}, results = [];
    mots.forEach(function(mot) {
        mot = mot.trim();
        if (mot.length < 1) return;
        (clientSearchIndex[mot] || []).forEach(function(c) {
            if (!seen[c.id]) { seen[c.id] = true; results.push(c); }
        });
    });
    if (results.length === 0 && window.posAllClients) {
        results = window.posAllClients.filter(function(c) {
            var nom = (c.nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            var prenom = (c.prenom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            var description = (c.description || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            var telephone = (c.telephone || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            return nom.indexOf(q) !== -1 || prenom.indexOf(q) !== -1 || description.indexOf(q) !== -1 || telephone.indexOf(q) !== -1;
        });
    }
    return results;
}

function invalidateClientIndex() { clientIndexBuilt = false; clientSearchIndex = {}; }

// ==================== INDICATEUR DE PHASE (inchangé) ====================
function showVoiceFlowIndicator(phase) {
    voiceFlowPhase = phase;
    if (voiceFlowIndicator) {
        voiceFlowIndicator.style.opacity = '0';
        voiceFlowIndicator.style.transition = 'opacity 0.1s';
        var old = voiceFlowIndicator;
        setTimeout(function() { if (old && old.parentNode) old.remove(); }, 120);
        voiceFlowIndicator = null;
    }
    setTimeout(function() {
        var colors = {
            'product': { bg: '#dcfce7', border: '#16a34a', text: '🎤 Dites un produit' },
            'quantity': { bg: '#fef3c7', border: '#f59e0b', text: '🔢 Dites la quantité' },
            'client': { bg: '#e0e7ff', border: '#4f46e5', text: '👤 Dites le client' },
            'payment_mode': { bg: '#e0e7ff', border: '#4f46e5', text: '💳 Espèces, Crédit ou Partiel ?' },
            'payment_amount': { bg: '#e0e7ff', border: '#4f46e5', text: '💰 Dites le montant' },
            'confirm': { bg: '#f3e8ff', border: '#9333ea', text: '✅ Dites "valide" pour finaliser' },
            'idle': { bg: '#f0fdf4', border: '#16a34a', text: '🎤 Écoute...' }
        };
        var c = colors[phase] || colors['idle'];
        voiceFlowIndicator = document.createElement('div');
        voiceFlowIndicator.id = 'voiceFlowIndicator';
        voiceFlowIndicator.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:' + c.bg + ';border:3px solid ' + c.border + ';border-radius:30px;padding:12px 28px;font-size:1rem;font-weight:700;z-index:9998;box-shadow:0 4px 25px rgba(0,0,0,0.2);text-align:center;color:#1e293b;opacity:0;transition:opacity 0.15s;white-space:nowrap;';
        voiceFlowIndicator.textContent = c.text;
        document.body.appendChild(voiceFlowIndicator);
        setTimeout(function() { if (voiceFlowIndicator) voiceFlowIndicator.style.opacity = '1'; }, 30);
        clearTimeout(window._flowIndicatorTimeout);
        window._flowIndicatorTimeout = setTimeout(function() {
            if (voiceFlowIndicator) { voiceFlowIndicator.style.opacity = '0'; setTimeout(function() { if (voiceFlowIndicator && voiceFlowIndicator.parentNode) voiceFlowIndicator.remove(); voiceFlowIndicator = null; }, 200); }
        }, 3000);
    }, 150);
}

function hideVoiceFlowIndicator() {
    if (voiceFlowIndicator) {
        voiceFlowIndicator.style.opacity = '0';
        var old = voiceFlowIndicator;
        setTimeout(function() { if (old && old.parentNode) old.remove(); }, 200);
        voiceFlowIndicator = null;
    }
    voiceFlowPhase = 'idle';
}

function showProcessingIndicator() {
    if (voiceFlowIndicator) {
        voiceFlowIndicator.style.opacity = '0';
        var old = voiceFlowIndicator;
        setTimeout(function() { if (old && old.parentNode) old.remove(); }, 100);
        voiceFlowIndicator = null;
    }
    var ind = document.createElement('div');
    ind.id = 'voiceFlowIndicator';
    ind.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#fef2f2;border:3px solid #ef4444;border-radius:30px;padding:12px 28px;font-size:1rem;font-weight:700;z-index:9998;box-shadow:0 4px 25px rgba(0,0,0,0.2);text-align:center;color:#991b1b;opacity:0;transition:opacity 0.1s;white-space:nowrap;';
    ind.textContent = '⏳ Traitement... Ne parlez pas';
    document.body.appendChild(ind);
    voiceFlowIndicator = ind;
    setTimeout(function() { if (voiceFlowIndicator === ind) voiceFlowIndicator.style.opacity = '1'; }, 20);
}

// ==================== UTILITAIRES ====================
function isIOSStandalone(){ return /iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream&&(window.navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches); }
function checkVoiceSupport(){ var i=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream; if(i&&isIOSStandalone()) return{supported:false,reason:'Ouvrez dans Safari pour le micro'}; if(!('webkitSpeechRecognition' in window)&&!('SpeechRecognition' in window)) return{supported:false,reason:'Navigateur non supporté'}; return{supported:true}; }
async function requestMicrophonePermission() { if (micPermissionGranted) return true; try { if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false; const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); micPermissionGranted = true; return true; } catch (e) { return false; } }
function showSafariBanner(){ if(!isIOSStandalone()) return; if(document.getElementById('iosPwaBanner')) return; var c=document.getElementById('dynamicContent'); if(!c) return; var b=document.createElement('div'); b.id='iosPwaBanner'; b.style.cssText='background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;'; b.innerHTML='<div style="display:flex;align-items:center;gap:8px;"><i class="fas fa-exclamation-triangle" style="color:#d97706;"></i><span style="font-size:0.8rem;color:#92400e;"><strong>📱 Microphone</strong><br><span style="font-size:0.7rem;">Ouvrez dans Safari pour le micro.</span></span></div><button onclick="window.open(window.location.href.split(\'?\')[0],\'_blank\')" style="background:#f59e0b;border:none;padding:6px 14px;border-radius:6px;color:#fff;font-weight:600;cursor:pointer;">🌐 Ouvrir</button>'; c.insertBefore(b,c.firstChild); }
function showVoiceModeIndicator(){ var ind=document.getElementById('voiceModeIndicator'); if(!ind){ var cont=document.querySelector('.pos-products-panel'); if(!cont) return; ind=document.createElement('div'); ind.id='voiceModeIndicator'; ind.style.cssText='background:#f0fdf4;border:2px solid #16a34a;border-radius:8px;padding:6px 12px;margin-bottom:8px;font-size:0.8rem;display:flex;align-items:center;gap:8px;color:#14532d;'; cont.insertBefore(ind,cont.firstChild); } var icon=voiceMode==='search'?'fa-microphone':(voiceMode==='quantity'?'fa-hashtag':(voiceMode==='client'?'fa-user':'fa-money-bill-wave')); var color=voiceMode==='search'?'#16a34a':(voiceMode==='quantity'?'#f59e0b':(voiceMode==='client'?'#4f46e5':'#dc2626')); ind.innerHTML='<i class="fas '+icon+'" style="color:'+color+';"></i> '+(voiceModeMessage||'🎤 Recherche vocale active')+' <span style="font-size:0.6rem;color:#94a3b8;margin-left:auto;">'+voiceMode+'</span>'; ind.style.borderColor=color; ind.style.background=voiceMode==='search'?'#f0fdf4':'#fefce8'; }
function showVoiceResult(msg){ var div=document.getElementById('voiceResultDisplay'); if(!div){ div=document.createElement('div'); div.id='voiceResultDisplay'; div.style.cssText='position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#2E7D32;color:#fff;padding:8px 16px;border-radius:12px;font-weight:600;font-size:0.85rem;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);display:none;max-width:90%;text-align:center;'; document.body.appendChild(div); } var isErr=msg.indexOf('⚠️')!==-1||msg.indexOf('❌')!==-1; div.style.background=isErr?'#ef4444':'#2E7D32'; div.textContent=msg; div.style.display='block'; clearTimeout(window._voiceResultTimeout); window._voiceResultTimeout=setTimeout(function(){ div.style.display='none'; },1200); }
function isModalOpen(){ var m=document.getElementById('modalOverlay'); return m&&!m.classList.contains('hidden'); }

// ==================== GESTION CRÉDITS (INCHANGÉE) ====================
function activateCreditSelection(){ creditDeletePending=null; window.creditSelectionMode=true; window.creditSelectedIndex=-1; window.creditSelectAll=false; window.creditPaymentStep='idle'; if(typeof window.renderCreditsTable==='function') window.renderCreditsTable(); showVoiceResult('📋 Mode sélection'); }
function selectCreditLine(n){ creditDeletePending=null; var d=window.filteredCredits||window.allCreditsData||[]; var i=n-1; if(i<0||i>=d.length){ showVoiceResult('❌ Ligne '+n); return; } if(!window.creditSelectionMode){ showVoiceResult('⚠️ Sélectionnez d\'abord'); return; } window.creditSelectedIndex=i; window.creditSelectAll=false; window.creditPaymentStep='selection'; window.creditPaymentAmount=0; if(typeof window.renderCreditsTable==='function') window.renderCreditsTable(); var c=d[i]; showVoiceResult('✅ Ligne '+n+' - '+(c.clientName||'')+' - '+(c.remainingAmount||c.total||0).toFixed(2)+' MAD'); }
function markCreditForPayment(){ creditDeletePending=null; if(window.creditSelectedIndex<0){ showVoiceResult('⚠️ Aucune ligne'); return; } var d=window.filteredCredits||window.allCreditsData||[]; var c=d[window.creditSelectedIndex]; if(!c){ showVoiceResult('❌ Introuvable'); return; } if(c.paid){ showVoiceResult('⚠️ Déjà payé'); return; } window.creditPaymentStep='payment'; window.creditPaymentAmount=0; var r=c.remainingAmount||c.total||0; showVoiceResult('💳 Restant: '+r.toFixed(2)+' MAD'); var z=document.getElementById('creditPaymentZone'); if(z){ z.style.display='block'; var info=document.getElementById('creditPaymentInfo'); if(info) info.textContent='Client: '+(c.clientName||'Inconnu')+' | Restant: '+r.toFixed(2)+' MAD'; var inp=document.getElementById('creditPaymentAmountInput'); if(inp){ inp.value=''; inp.focus(); inp.select(); } } }
function setCreditPaymentAmount(a){ if(window.creditSelectedIndex<0){ showVoiceResult('⚠️ Aucun crédit'); return; } if(a<=0){ showVoiceResult('❌ Montant invalide'); return; } window.creditPaymentAmount=a; window.creditPaymentStep='amount'; var inp=document.getElementById('creditPaymentAmountInput'); if(inp) inp.value=a; showVoiceResult('💰 '+a.toFixed(2)+' MAD'); }
function validateCreditPayment(){ if(window.creditSelectedIndex<0){ showVoiceResult('⚠️ Aucun crédit'); return; } var inp=document.getElementById('creditPaymentAmountInput'); var a=parseFloat(inp?inp.value:window.creditPaymentAmount) || window.creditPaymentAmount || 0; if(isNaN(a)||a<=0){ a = (window.filteredCredits||window.allCreditsData)[window.creditSelectedIndex]?.remainingAmount || (window.filteredCredits||window.allCreditsData)[window.creditSelectedIndex]?.total || 0; if(a<=0){ showVoiceResult('❌ Montant invalide'); return; } } var d=window.filteredCredits||window.allCreditsData||[]; var c=d[window.creditSelectedIndex]; if(!c){ showVoiceResult('❌ Introuvable'); return; } var r=c.remainingAmount||c.total||0; if(a>r){ showVoiceResult('⚠️ > reste'); return; } var nr=r-a; var p=nr<=0.01; CacheDB.write('credits',c.id,{paid:p,remainingAmount:Math.max(0,nr),amountGiven:(c.amountGiven||0)+a,paidAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},'update').then(function(){ showVoiceResult(p?'✅ Soldé !':'✅ Payé. Reste: '+nr.toFixed(2)+' MAD'); window.creditPaymentStep='idle'; window.creditSelectedIndex=-1; window.creditPaymentAmount=0; window.creditSelectionMode=false; var z=document.getElementById('creditPaymentZone'); if(z) z.style.display='none'; if(typeof window.loadCredits==='function') window.loadCredits(); CacheDB.sync(); }).catch(function(e){ showVoiceResult('❌ Erreur'); }); }
function closeCreditSelection(){ creditDeletePending=null; window.creditSelectionMode=false; window.creditSelectedIndex=-1; window.creditSelectAll=false; window.creditPaymentAmount=0; window.creditPaymentStep='idle'; var z=document.getElementById('creditPaymentZone'); if(z) z.style.display='none'; if(typeof window.applyCreditsFilters==='function'){ window.creditsSearch=''; window.currentPages.credits=1; window.filteredCredits=null; window.applyCreditsFilters(); } showVoiceResult('📋 Liste complète'); }

// ==================== SÉLECTION MULTIPLE / SUPPRESSION ====================
function selectAllCredits() { window.creditSelectAll = true; window.creditSelectedIndex = -1; if (typeof window.renderCreditsTable === 'function') window.renderCreditsTable(); showVoiceResult('✅ Tous sélectionnés'); }
function deselectAllCredits() { window.creditSelectAll = false; window.creditSelectedIndex = -1; if (typeof window.renderCreditsTable === 'function') window.renderCreditsTable(); showVoiceResult('❌ Sélection annulée'); }

async function deleteAllCredits() {
    var data = window.filteredCredits || window.allCreditsData || [];
    if (data.length === 0) { showVoiceResult('⚠️ Aucun crédit à supprimer'); return; }
    if (!confirm('Supprimer TOUS les crédits affichés (' + data.length + ') ?')) return;
    try {
        for (var i = 0; i < data.length; i++) {
            await CacheDB.write('credits', data[i].id, null, 'delete');
        }
        window.allCreditsData = (window.allCreditsData || []).filter(function(c) {
            return !data.some(function(d) { return d.id === c.id; });
        });
        if (typeof window.loadCredits === 'function') window.loadCredits();
        window.creditSelectionMode = false;
        window.creditSelectAll = false;
        window.creditSelectedIndex = -1;
        showVoiceResult('✅ ' + data.length + ' crédits supprimés');
        CacheDB.sync();
    } catch(e) { showVoiceResult('❌ Erreur suppression'); }
}

function deleteCreditByVoice(lineNumber) { var data=window.filteredCredits||window.allCreditsData||[]; var i=lineNumber-1; if(i<0||i>=data.length){showVoiceResult('❌ Ligne '+lineNumber);return;} var c=data[i]; if(!c){showVoiceResult('❌ Crédit introuvable');return;} creditDeletePending={lineNumber:lineNumber,credit:c}; showVoiceResult('🗑️ '+(c.clientName||'Inconnu')+' ? Dites valide/annule'); }
function deleteSelectedCredit() {
    if (window.creditSelectAll) { deleteAllCredits(); return; }
    if (window.creditSelectedIndex < 0) { showVoiceResult('⚠️ Aucune ligne'); return; }
    deleteCreditByVoice(window.creditSelectedIndex + 1);
}
async function confirmDeleteCredit(){ if(!creditDeletePending){showVoiceResult('⚠️ Rien à supprimer');return;} var c=creditDeletePending.credit; try{ if(typeof window.deleteCredit==='function'){await window.deleteCredit(c.id);}else{await db.collection('credits').doc(c.id).delete();window.allCreditsData=(window.allCreditsData||[]).filter(function(x){return x.id!==c.id;});if(typeof window.loadCredits==='function') window.loadCredits();} window.creditSelectedIndex=-1;window.creditSelectionMode=false;showVoiceResult('✅ Supprimé'); }catch(e){showVoiceResult('❌ Erreur');} creditDeletePending=null; }
function cancelDeleteCredit(){ if(creditDeletePending){creditDeletePending=null;showVoiceResult('↩️ Annulé');} }

// ==================== DÉTECTION PAIEMENT ====================
function detectPaymentMode(t){ t=t.toLowerCase().trim(); for(var m in paymentKeywords){ for(var i=0;i<paymentKeywords[m].length;i++){ if(t.indexOf(paymentKeywords[m][i])!==-1) return m; } } return null; }

// ==================== PARSER VOCAL – ENRICHISSEMENT VENTES ====================
function parseVoiceCommand(transcript) {
    var cleaned = transcript.toLowerCase().replace(/['’]/g, ' ').replace(/\s+/g, ' ').trim();
    var now = Date.now();
    if (now - lastVoiceCommandTime < 40) return { type: 'ignore' };
    lastVoiceCommandTime = now;
    var currentPage = document.getElementById('pageTitle')?.textContent || '';

    if (currentPage !== 'POS' && currentPage !== 'Dashboard' && (voiceMode === 'quantity' || voiceMode === 'payment')) {
        setVoiceMode('search', '🎤 Recherche vocale active');
    }

    // ----- NAVIGATION -----
    if (cleaned.includes('crédits') || cleaned.includes('impayés') || cleaned.includes('liste des crédits') || cleaned.includes('liste de crédit')) return { type: 'navigate', page: 'credits' };
    if (cleaned.includes('ventes') || cleaned.includes('vente')) return { type: 'navigate', page: 'ventes' };
    if (cleaned.includes('dashboard') || cleaned.includes('accueil') || cleaned.includes('home')) return { type: 'navigate', page: 'dashboard' };
    if (cleaned.includes('produits') || cleaned.includes('catalogue')) return { type: 'navigate', page: 'products' };
    if (cleaned.includes('clients') || cleaned.includes('clientèle')) return { type: 'navigate', page: 'clients' };
    if (cleaned.includes('commandes')) return { type: 'navigate', page: 'commandes' };
    if (cleaned.includes('catégories')) return { type: 'navigate', page: 'categories' };
    if (cleaned.includes('point de vente') || cleaned.includes('pos') || cleaned.includes('caisse')) return { type: 'navigate', page: 'pos' };

    // ----- PAGE POS (inchangée) -----
    if (currentPage === 'POS' || currentPage === 'Dashboard') {
        if (voiceMode === 'quantity') {
            var nm = cleaned.match(/\b(\d+)\b/);
            if (nm) return { type: 'number', value: parseInt(nm[1]) };
            for (var w in numberMap) { if (cleaned.indexOf(w) !== -1) return { type: 'number', value: numberMap[w] }; }
            if (cleaned.includes('passe') || cleaned.includes('passer') || cleaned.includes('suivant')) return { type: 'next' };
            if (cleaned.includes('valide') || cleaned.includes('validé') || cleaned.includes('valider') || cleaned.includes('confirmer') || cleaned.includes('ok')) return { type: 'validate' };
            if (cleaned.includes('annule') || cleaned.includes('annuler')) return { type: 'cancel' };
            if (cleaned.includes('efface') || cleaned.includes('vider')) return { type: 'clear' };
            if (cleaned.includes('termine') || cleaned.includes('terminer') || cleaned.includes('fin')) return { type: 'finalize' };
            return { type: 'unknown', text: transcript };
        }
        if (voiceMode === 'payment' || window.posStep === 2) {
            if (!window.posCurrentClient && window.posAllClients) {
                var fc = fastFindClient(cleaned);
                if (fc.length === 1) return { type: 'client', client: fc[0] };
                else if (fc.length > 1) {
                    var bestClient = fc[0];
                    for (var j = 0; j < fc.length; j++) {
                        if ((fc[j].nom + ' ' + fc[j].prenom).toLowerCase().indexOf(cleaned) !== -1) { bestClient = fc[j]; break; }
                    }
                    return { type: 'client', client: bestClient };
                }
            }
            var pm = detectPaymentMode(cleaned);
            if (pm) return { type: 'payment_mode', mode: pm };
            var nm2 = cleaned.match(/\b(\d+)\b/);
            if (nm2) return { type: 'number', value: parseInt(nm2[1]) };
            for (var w2 in numberMap) { if (cleaned.indexOf(w2) !== -1) return { type: 'number', value: numberMap[w2] }; }
            if (cleaned.includes('retour') || cleaned.includes('revenir')) return { type: 'cancel' };
            if (cleaned.includes('valide') || cleaned.includes('validé') || cleaned.includes('valider') || cleaned.includes('confirmer') || cleaned.includes('ok')) return { type: 'validate' };
            if (cleaned.includes('termine') || cleaned.includes('terminer') || cleaned.includes('fin')) return { type: 'finalize' };
            if (cleaned.includes('annule') || cleaned.includes('annuler')) return { type: 'cancel' };
            if (cleaned.includes('efface') || cleaned.includes('vider')) return { type: 'clear' };
            return { type: 'unknown', text: transcript };
        }
        if (voiceMode === 'search' && window.posStep === 1) {
            if (window.posProductsList && window.posProductsList.length) {
                var bestMatch = null, bestLen = 0;
                for (var i = 0; i < window.posProductsList.length; i++) {
                    var p = window.posProductsList[i];
                    var nom = (p.nom || '').toLowerCase();
                    var desc = (p.description || '').toLowerCase();
                    if (nom.includes(cleaned) && nom.length > bestLen) { bestMatch = p; bestLen = nom.length; }
                    if (desc.includes(cleaned) && desc.length > bestLen) { bestMatch = p; bestLen = desc.length; }
                }
                if (bestMatch) {
                    if (bestMatch.stock !== undefined && bestMatch.stock <= 0) {
                        showVoiceResult('⚠️ Rupture: ' + bestMatch.nom);
                        return { type: 'ignore' };
                    }
                    return { type: 'product', product: bestMatch };
                }
            }
            if (cleaned.includes('passe') || cleaned.includes('passer') || cleaned.includes('suivant')) return { type: 'next' };
            if (cleaned.includes('valide') || cleaned.includes('validé') || cleaned.includes('valider') || cleaned.includes('confirmer') || cleaned.includes('ok')) return { type: 'validate' };
            if (cleaned.includes('annule') || cleaned.includes('annuler')) return { type: 'cancel' };
            if (cleaned.includes('efface') || cleaned.includes('vider')) return { type: 'clear' };
            if (cleaned.includes('termine') || cleaned.includes('terminer') || cleaned.includes('fin')) return { type: 'finalize' };
            return { type: 'unknown', text: transcript };
        }
    }

    // ----- PAGE CRÉDITS (INCHANGÉE) -----
    if (currentPage === 'Crédits') {
        if (window.creditSelectionMode) {
            if (creditDeletePending) {
                if (cleaned.includes('valide') || cleaned.includes('validé') || cleaned.includes('valider') || cleaned.includes('oui') || cleaned.includes('confirmer') || cleaned.includes('ok')) {
                    return { type: 'confirm_delete_credit' };
                }
                if (cleaned.includes('annule') || cleaned.includes('annuler') || cleaned.includes('non')) {
                    return { type: 'cancel_delete_credit' };
                }
                showVoiceResult('⚠️ Valide/Annule ?');
                return { type: 'ignore' };
            }
            if (cleaned.includes('marquer payé') || cleaned.includes('payer')) {
                window.creditSelectionMode = false;
                if (typeof window.renderCreditsTable === 'function') window.renderCreditsTable();
                return { type: 'mark_credit_paid' };
            }
            if (cleaned === 'tout' || cleaned === 'tous' || cleaned.includes('sélectionner tout') || cleaned.includes('tout sélectionner')) {
                return { type: 'select_all_credits' };
            }
            if (cleaned === 'rien' || cleaned === 'aucun' || cleaned.includes('désélectionner') || cleaned.includes('annuler sélection')) {
                return { type: 'deselect_all_credits' };
            }
            if (cleaned.includes('fermer') || cleaned.includes('retour') || cleaned.includes('quitter')) {
                return { type: 'close_credit_list' };
            }
            if (cleaned.includes('supprimer tout') || cleaned.includes('tout supprimer')) {
                return { type: 'delete_all_credits' };
            }
            if (cleaned === 'supprimer' || cleaned === 'supprime' || cleaned === 'effacer' || cleaned === 'enlever' || cleaned === 'retirer') {
                if (window.creditSelectAll) return { type: 'delete_all_credits' };
                else if (window.creditSelectedIndex >= 0) return { type: 'delete_selected_credit' };
                else { showVoiceResult('⚠️ Aucune ligne sélectionnée'); return { type: 'ignore' }; }
            }
            var numOnly = cleaned.match(/^\d+$/);
            if (numOnly) return { type: 'select_credit_line', lineNumber: parseInt(numOnly[0]) };
            for (var nw in numberMap) {
                if (cleaned === nw) return { type: 'select_credit_line', lineNumber: numberMap[nw] };
            }
            showVoiceResult('⚠️ Dites un numéro, "tout", "supprimer" ou "marquer payé"');
            return { type: 'ignore' };
        }

        if (window.creditPaymentStep === 'payment' || window.creditPaymentStep === 'amount') {
            var numAmount = cleaned.match(/^\d+([.,]\d+)?$/);
            if (numAmount) {
                var val = parseFloat(numAmount[0].replace(',', '.'));
                if (val > 0) return { type: 'set_credit_amount', amount: val };
            }
            for (var nw2 in numberMap) {
                if (cleaned === nw2) return { type: 'set_credit_amount', amount: numberMap[nw2] };
            }
            if (cleaned.includes('valide') || cleaned.includes('validé') || cleaned.includes('valider') || cleaned.includes('confirmer') || cleaned.includes('ok') || cleaned.includes('oui')) {
                return { type: 'validate_credit_payment' };
            }
            if (cleaned.includes('annule') || cleaned.includes('annuler') || cleaned.includes('retour')) {
                window.creditPaymentStep = 'idle';
                window.creditSelectedIndex = -1;
                var z = document.getElementById('creditPaymentZone');
                if (z) z.style.display = 'none';
                if (typeof window.renderCreditsTable === 'function') window.renderCreditsTable();
                showVoiceResult('↩️ Paiement annulé');
                return { type: 'ignore' };
            }
            showVoiceResult('💰 Dites un montant puis "valider"');
            return { type: 'ignore' };
        }

        // Filtres, sélection, recherche, etc. (le reste est inchangé, je l'ai conservé dans le code complet)
        if (cleaned.includes('aujourd hui') || cleaned.includes('aujourdhui') || cleaned.includes('ce jour') || cleaned.includes('du jour')) {
            window.creditsPeriod = 'today'; window.currentPages.credits = 1;
            if (typeof window.applyCreditsFilters === 'function') window.applyCreditsFilters();
            showVoiceResult('📅 Aujourd\'hui'); return { type: 'ignore' };
        }
        if (cleaned.includes('cette semaine') || cleaned.includes('7 jours') || cleaned.includes('semaine')) {
            window.creditsPeriod = '7'; window.currentPages.credits = 1;
            if (typeof window.applyCreditsFilters === 'function') window.applyCreditsFilters();
            showVoiceResult('📅 7 jours'); return { type: 'ignore' };
        }
        if (cleaned.includes('ce mois') || cleaned.includes('30 jours') || cleaned.includes('mensuel') || cleaned.includes('mois')) {
            window.creditsPeriod = '30'; window.currentPages.credits = 1;
            if (typeof window.applyCreditsFilters === 'function') window.applyCreditsFilters();
            showVoiceResult('📅 30 jours'); return { type: 'ignore' };
        }
        if (cleaned === 'tout' || cleaned.includes('historique') || cleaned.includes('global') || cleaned.includes('complet')) {
            window.creditsPeriod = 'all'; window.currentPages.credits = 1;
            if (typeof window.applyCreditsFilters === 'function') window.applyCreditsFilters();
            showVoiceResult('📅 Tout'); return { type: 'ignore' };
        }

        if (cleaned.includes('sélectionner') || cleaned.includes('select') || cleaned.includes('choisir') || cleaned.includes('cocher')) {
            return { type: 'activate_credit_selection' };
        }

        if (cleaned.includes('marquer payé') || cleaned.includes('payer')) {
            if (window.creditSelectedIndex >= 0) return { type: 'mark_credit_paid' };
            else { showVoiceResult('⚠️ Sélectionnez d\'abord une ligne'); return { type: 'ignore' }; }
        }

        if (cleaned === 'supprimer' || cleaned === 'supprime' || cleaned === 'effacer' || cleaned === 'enlever' || cleaned === 'retirer') {
            if (!window.creditSelectionMode) {
                window.creditSelectionMode = true; window.creditSelectedIndex = -1; window.creditSelectAll = false; window.creditPaymentStep = 'idle';
                if (typeof window.renderCreditsTable === 'function') window.renderCreditsTable();
                showVoiceResult('📋 Mode sélection'); return { type: 'ignore' };
            }
            if (window.creditSelectedIndex < 0 && !window.creditSelectAll) { showVoiceResult('⚠️ Dites le numéro'); return { type: 'ignore' }; }
            return { type: 'delete_selected_credit' };
        }

        if (creditDeletePending) {
            if (cleaned.includes('valide') || cleaned.includes('validé') || cleaned.includes('valider') || cleaned.includes('oui') || cleaned.includes('confirmer') || cleaned.includes('ok')) return { type: 'confirm_delete_credit' };
            if (cleaned.includes('annule') || cleaned.includes('annuler') || cleaned.includes('non')) return { type: 'cancel_delete_credit' };
            showVoiceResult('⚠️ Valide/Annule ?'); return { type: 'ignore' };
        }

        var cn2 = null, fc2 = fastFindClient(cleaned);
        if (fc2.length === 1) cn2 = fc2[0].nom + ' ' + fc2[0].prenom;
        else if (fc2.length > 1) {
            for (var j2 = 0; j2 < fc2.length; j2++) {
                var nomPrenom = (fc2[j2].nom + ' ' + fc2[j2].prenom).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                if (nomPrenom.indexOf(cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '')) !== -1) {
                    cn2 = fc2[j2].nom + ' ' + fc2[j2].prenom; break;
                }
            }
            if (!cn2) cn2 = fc2[0].nom + ' ' + fc2[0].prenom;
        }
        if (cn2) return { type: 'search_client_in_credits', clientName: cn2 };

        var lm2 = cleaned.match(/(?:ligne|numéro)\s+([a-z0-9]+)/i);
        if (lm2) {
            var ns2 = lm2[1], num2 = parseInt(ns2);
            if (isNaN(num2)) { for (var w in numberMap) { if (ns2.toLowerCase() === w) { num2 = numberMap[w]; break; } } }
            if (!isNaN(num2) && num2 > 0) return { type: 'select_credit_line', lineNumber: num2 };
        }

        if (cleaned.includes('fermer') || cleaned.includes('retour')) return { type: 'close_credit_list' };

        return { type: 'unknown', text: transcript };
    }

    // ----- PAGE VENTES (ENRICHIE) -----
    if (currentPage === 'Ventes') {
        // 1. Si le mode sélection est actif
        if (window.venteSelectionMode) {
            // Sélectionner tout
            if (cleaned === 'tout' || cleaned === 'tous' || cleaned.includes('sélectionner tout') || cleaned.includes('tout sélectionner')) {
                // Pour l'instant, on peut juste sélectionner toutes les lignes visuellement
                window.venteSelectedIndex = -1; // on pourrait aussi mettre une variable venteSelectAll
                showVoiceResult('⚠️ "Tout sélectionner" pas encore implémenté pour les ventes');
                return { type: 'ignore' };
            }
            // Désélectionner
            if (cleaned === 'rien' || cleaned === 'aucun' || cleaned.includes('désélectionner') || cleaned.includes('annuler sélection')) {
                window.venteSelectionMode = false;
                window.venteSelectedIndex = -1;
                if (typeof window.renderVentesTable === 'function') window.renderVentesTable();
                showVoiceResult('📋 Mode sélection quitté');
                return { type: 'ignore' };
            }
            // Quitter le mode sélection
            if (cleaned.includes('fermer') || cleaned.includes('retour') || cleaned.includes('quitter')) {
                window.venteSelectionMode = false;
                window.venteSelectedIndex = -1;
                if (typeof window.renderVentesTable === 'function') window.renderVentesTable();
                showVoiceResult('📋 Mode sélection quitté');
                return { type: 'ignore' };
            }
            // Supprimer la vente sélectionnée
            if (cleaned === 'supprimer' || cleaned === 'supprime' || cleaned === 'effacer' || cleaned === 'enlever' || cleaned === 'retirer') {
                if (window.venteSelectedIndex >= 0) {
                    var data = window.filteredVentes || window.allVentesData || [];
                    var vente = data[window.venteSelectedIndex];
                    if (vente && typeof window.deleteVente === 'function') {
                        window.deleteVente(vente.id);
                    } else {
                        showVoiceResult('❌ Impossible de supprimer');
                    }
                    window.venteSelectionMode = false;
                    window.venteSelectedIndex = -1;
                    if (typeof window.renderVentesTable === 'function') window.renderVentesTable();
                    return { type: 'ignore' };
                } else {
                    showVoiceResult('⚠️ Aucune ligne sélectionnée');
                    return { type: 'ignore' };
                }
            }
            // Voir détails / modifier
            if (cleaned.includes('détail') || cleaned.includes('detail') || cleaned.includes('modifier')) {
                if (window.venteSelectedIndex >= 0) {
                    var data2 = window.filteredVentes || window.allVentesData || [];
                    var vente2 = data2[window.venteSelectedIndex];
                    if (vente2 && typeof window.editVente === 'function') {
                        window.editVente(vente2.id);
                    } else {
                        showVoiceResult('📋 Détail non disponible');
                    }
                    return { type: 'ignore' };
                } else {
                    showVoiceResult('⚠️ Sélectionnez une ligne');
                    return { type: 'ignore' };
                }
            }
            // Payer la vente
            if (cleaned.includes('payer') || cleaned.includes('marquer payé')) {
                if (window.venteSelectedIndex >= 0) {
                    var data3 = window.filteredVentes || window.allVentesData || [];
                    var vente3 = data3[window.venteSelectedIndex];
                    if (vente3 && typeof window.payerVente === 'function') {
                        window.payerVente(vente3.id);
                    } else {
                        showVoiceResult('⚠️ Paiement impossible');
                    }
                    return { type: 'ignore' };
                } else {
                    showVoiceResult('⚠️ Sélectionnez une ligne');
                    return { type: 'ignore' };
                }
            }
            // Imprimer facture
            if (cleaned.includes('imprimer') || cleaned.includes('facture')) {
                if (window.venteSelectedIndex >= 0) {
                    var data4 = window.filteredVentes || window.allVentesData || [];
                    var vente4 = data4[window.venteSelectedIndex];
                    if (vente4 && typeof window.printFacture === 'function') {
                        window.printFacture(vente4.id);
                    } else {
                        showVoiceResult('⚠️ Impression impossible');
                    }
                    return { type: 'ignore' };
                } else {
                    showVoiceResult('⚠️ Sélectionnez une ligne');
                    return { type: 'ignore' };
                }
            }
            // Sélection par numéro
            var numOnlyV = cleaned.match(/^\d+$/);
            if (numOnlyV) {
                var num = parseInt(numOnlyV[0]);
                var data5 = window.filteredVentes || window.allVentesData || [];
                if (num > 0 && num <= data5.length) {
                    window.venteSelectedIndex = num - 1;
                    if (typeof window.renderVentesTable === 'function') window.renderVentesTable();
                    showVoiceResult('✅ Ligne ' + num + ' sélectionnée');
                } else {
                    showVoiceResult('❌ Numéro invalide');
                }
                return { type: 'ignore' };
            }
            // Numéro en lettres
            for (var nwv in numberMap) {
                if (cleaned === nwv) {
                    var numLet = numberMap[nwv];
                    var data6 = window.filteredVentes || window.allVentesData || [];
                    if (numLet > 0 && numLet <= data6.length) {
                        window.venteSelectedIndex = numLet - 1;
                        if (typeof window.renderVentesTable === 'function') window.renderVentesTable();
                        showVoiceResult('✅ Ligne ' + numLet + ' sélectionnée');
                    } else {
                        showVoiceResult('❌ Numéro invalide');
                    }
                    return { type: 'ignore' };
                }
            }
            // Commande "ligne X"
            var lmV = cleaned.match(/(?:ligne|numéro)\s+([a-z0-9]+)/i);
            if (lmV) {
                var ns = lmV[1], numLine = parseInt(ns);
                if (isNaN(numLine)) {
                    for (var wv in numberMap) { if (ns.toLowerCase() === wv) { numLine = numberMap[wv]; break; } }
                }
                if (!isNaN(numLine) && numLine > 0) {
                    var data7 = window.filteredVentes || window.allVentesData || [];
                    if (numLine <= data7.length) {
                        window.venteSelectedIndex = numLine - 1;
                        if (typeof window.renderVentesTable === 'function') window.renderVentesTable();
                        showVoiceResult('✅ Ligne ' + numLine + ' sélectionnée');
                    } else {
                        showVoiceResult('❌ Numéro invalide');
                    }
                }
                return { type: 'ignore' };
            }

            showVoiceResult('⚠️ Dites un numéro, "détail", "payer", "imprimer" ou "supprimer"');
            return { type: 'ignore' };
        }

        // 2. Filtres de période
        if (cleaned.includes('aujourd hui') || cleaned.includes('aujourdhui') || cleaned.includes('ce jour') || cleaned.includes('du jour')) {
            window.ventesPeriod = 'today'; window.currentPages.ventes = 1;
            if (typeof window.applyVentesFilters === 'function') window.applyVentesFilters();
            showVoiceResult('📅 Aujourd\'hui'); return { type: 'ignore' };
        }
        if (cleaned.includes('cette semaine') || cleaned.includes('7 jours') || cleaned.includes('semaine')) {
            window.ventesPeriod = '7'; window.currentPages.ventes = 1;
            if (typeof window.applyVentesFilters === 'function') window.applyVentesFilters();
            showVoiceResult('📅 7 jours'); return { type: 'ignore' };
        }
        if (cleaned.includes('ce mois') || cleaned.includes('30 jours') || cleaned.includes('mensuel') || cleaned.includes('mois')) {
            window.ventesPeriod = '30'; window.currentPages.ventes = 1;
            if (typeof window.applyVentesFilters === 'function') window.applyVentesFilters();
            showVoiceResult('📅 30 jours'); return { type: 'ignore' };
        }
        if (cleaned.includes('tout') || cleaned.includes('historique') || cleaned.includes('global') || cleaned.includes('complet')) {
            window.ventesPeriod = 'all'; window.currentPages.ventes = 1;
            if (typeof window.applyVentesFilters === 'function') window.applyVentesFilters();
            showVoiceResult('📅 Tout'); return { type: 'ignore' };
        }

        // 3. Activer le mode sélection
        if (cleaned.includes('sélectionner') || cleaned.includes('select') || cleaned.includes('choisir') || cleaned.includes('cocher')) {
            window.venteSelectionMode = true;
            window.venteSelectedIndex = -1;
            if (typeof window.renderVentesTable === 'function') window.renderVentesTable();
            showVoiceResult('📋 Mode sélection');
            return { type: 'ignore' };
        }

        // 4. Recherche client
        var cn = null, fc = fastFindClient(cleaned);
        if (fc.length === 1) cn = fc[0].nom + ' ' + fc[0].prenom;
        else if (fc.length > 1) {
            for (var j = 0; j < fc.length; j++) {
                if ((fc[j].nom + ' ' + fc[j].prenom).toLowerCase().indexOf(cleaned) !== -1) { cn = fc[j].nom + ' ' + fc[j].prenom; break; }
            }
            if (!cn) cn = fc[0].nom + ' ' + fc[0].prenom;
        }
        if (cn) return { type: 'search_client_in_ventes', clientName: cn };

        return { type: 'unknown', text: transcript };
    }

    return { type: 'ignore' };
}

// ==================== RECHERCHE CLIENTS (inchangée) ====================
function searchClientInVentes(n) { if (!n) return; var s = document.getElementById('ventesSearchInput'); if (s) { s.value = n; window.ventesSearch = n; window.currentPages.ventes = 1; if (typeof window.applyVentesFilters === 'function') window.applyVentesFilters(); showVoiceResult('🔍 ' + n); } else { if (typeof navigateTo === 'function') { navigateTo('ventes'); setTimeout(function() { var si = document.getElementById('ventesSearchInput'); if (si) { si.value = n; window.ventesSearch = n; window.currentPages.ventes = 1; if (typeof window.applyVentesFilters === 'function') window.applyVentesFilters(); showVoiceResult('🔍 ' + n); } }, 200); } } }
function searchClientInCredits(n) {
    if (!n) return;
    var currentPage = document.getElementById('pageTitle')?.textContent || '';
    if (currentPage === 'Crédits') {
        if (typeof selectCreditClient === 'function') {
            selectCreditClient(n);
        } else {
            window.creditsSearch = n;
            if (typeof window.applyCreditsFilters === 'function') {
                window.currentPages.credits = 1;
                window.applyCreditsFilters();
            }
        }
        showVoiceResult('🔍 ' + n);
        return;
    }
    if (typeof navigateTo === 'function') {
        navigateTo('credits');
        var checkReady = setInterval(function() {
            var currentPageAfterNav = document.getElementById('pageTitle')?.textContent || '';
            if (currentPageAfterNav === 'Crédits' && typeof selectCreditClient === 'function') {
                clearInterval(checkReady);
                selectCreditClient(n);
                showVoiceResult('🔍 ' + n);
            }
        }, 200);
        setTimeout(function() { clearInterval(checkReady); }, 5000);
    }
}

// ==================== GESTIONNAIRE DE COMMANDES ====================
function handleVoiceCommand(cmd) {
    console.log('🎤', cmd.type); var cp = document.getElementById('pageTitle')?.textContent || '';
    switch (cmd.type) {
        case 'search_client_in_ventes': searchClientInVentes(cmd.clientName); hideVoiceFlowIndicator(); break;
        case 'search_client_in_credits': searchClientInCredits(cmd.clientName); hideVoiceFlowIndicator(); break;
        case 'activate_credit_selection': activateCreditSelection(); hideVoiceFlowIndicator(); break;
        case 'select_credit_line': selectCreditLine(cmd.lineNumber); hideVoiceFlowIndicator(); break;
        case 'mark_credit_paid': markCreditForPayment(); hideVoiceFlowIndicator(); break;
        case 'set_credit_amount': setCreditPaymentAmount(cmd.amount); hideVoiceFlowIndicator(); break;
        case 'validate_credit_payment': validateCreditPayment(); hideVoiceFlowIndicator(); break;
        case 'close_credit_list': closeCreditSelection(); hideVoiceFlowIndicator(); break;
        case 'delete_credit_line': deleteCreditByVoice(cmd.lineNumber); hideVoiceFlowIndicator(); break;
        case 'delete_selected_credit': deleteSelectedCredit(); hideVoiceFlowIndicator(); break;
        case 'delete_all_credits': deleteAllCredits(); hideVoiceFlowIndicator(); break;
        case 'select_all_credits': selectAllCredits(); hideVoiceFlowIndicator(); break;
        case 'deselect_all_credits': deselectAllCredits(); hideVoiceFlowIndicator(); break;
        case 'confirm_delete_credit': confirmDeleteCredit(); hideVoiceFlowIndicator(); break;
        case 'cancel_delete_credit': cancelDeleteCredit(); hideVoiceFlowIndicator(); break;
        case 'navigate':
            var p = cmd.page, pt = { 'credits': 'Crédits', 'ventes': 'Ventes', 'dashboard': 'Dashboard', 'products': 'Produits', 'clients': 'Clients', 'commandes': 'Commandes en ligne', 'categories': 'Catégories', 'pos': 'POS' };
            if (cp === pt[p]) { showVoiceResult('✅ ' + pt[p]); hideVoiceFlowIndicator(); return; }
            if (typeof window.posCart !== 'undefined' && window.posCart.length > 0 && window.posStep === 1 && p !== 'pos') { if (!confirm('⚠️ Panier non vide. Vider ?')) { showVoiceResult('↩️ Annulé'); hideVoiceFlowIndicator(); return; } if (typeof window.posResetCart === 'function') window.posResetCart(); }
            showVoiceResult('📋 ' + pt[p]); if (typeof navigateTo === 'function') navigateTo(p);
            hideVoiceFlowIndicator();
            break;
        case 'payment_mode':
            var m = cmd.mode; if ((m === 'credit' || m === 'partiel') && (!window.posCurrentClient || !window.posCurrentClient.id)) { alert('Client requis'); showVoiceResult('⚠️ Client requis'); hideVoiceFlowIndicator(); return; }
            if (typeof window.posSetPaymentMethod === 'function') { window.posSetPaymentMethod(m); showVoiceResult('✅ ' + m); if (typeof window.renderPOS === 'function') window.renderPOS(); if (m === 'espece') { setTimeout(function() { var ai = document.getElementById('posAmountGiven'); if (ai) ai.focus(); }, 200); } }
            hideVoiceFlowIndicator(); setTimeout(function() { showVoiceFlowIndicator('payment_amount'); }, 200);
            break;
        case 'product':
            if (typeof window.posProductsList !== 'undefined' && window.posProductsList.length) {
                var pr = window.posProductsList.find(function(x) { return x.id === cmd.product.id; });
                if (!pr) { hideVoiceFlowIndicator(); break; }
                if (pr.stock !== undefined && pr.stock <= 0) { showVoiceResult('⚠️ Rupture: ' + pr.nom); hideVoiceFlowIndicator(); return; }
                if (typeof window.posAddToCartOrOpenOptions === 'function') window.posAddToCartOrOpenOptions(pr.id);
                showVoiceResult('✅ ' + pr.nom + ' ajouté');
                hideVoiceFlowIndicator(); setTimeout(function() { showVoiceFlowIndicator('quantity'); }, 200);
            }
            break;
        case 'number':
            if (voiceMode === 'quantity' && lastAddedProductId) {
                var qty = cmd.value; if (qty < 1) qty = 1;
                if (typeof window.posProductsList !== 'undefined') {
                    var it = window.posCart.find(function(x) { return x.id === lastAddedProductId; });
                    if (it) {
                        var p2 = window.posProductsList.find(function(x) { return x.id === lastAddedProductId; });
                        if (p2 && p2.stock !== undefined && qty > p2.stock) { showVoiceResult('⚠️ Stock max: ' + p2.stock); hideVoiceFlowIndicator(); return; }
                        it.quantite = qty; lastAddedProductId = null;
                        setVoiceMode('search', '🎤 Recherche vocale active', null);
                        showVoiceResult('✅ Qté: ' + qty + ' - Autre produit ou "passe"');
                        if (typeof window.updateCartOnly === 'function') window.updateCartOnly(); showVoiceModeIndicator();
                        hideVoiceFlowIndicator(); setTimeout(function() { showVoiceFlowIndicator('product'); }, 200);
                    }
                }
            } else if (voiceMode === 'payment' || window.posStep === 2) {
                if (typeof window.posAmountGiven !== 'undefined') {
                    window.posAmountGiven = cmd.value;
                    var ce = document.getElementById('posChangeDisplay');
                    if (ce) { var st = typeof window.posCalculateTotal === 'function' ? window.posCalculateTotal() : 0, t = st - (window.posDiscountMAD || 0), c = window.posAmountGiven - t; ce.innerHTML = c >= 0 ? '<div class="pos-change-positive"><span>Rendu</span><span>' + c.toFixed(2) + ' MAD</span></div>' : '<div class="pos-change-negative"><span>Manquant</span><span>' + Math.abs(c).toFixed(2) + ' MAD</span></div>'; }
                    var ai = document.getElementById('posAmountGiven'); if (ai) ai.value = window.posAmountGiven;
                    showVoiceResult('💰 ' + window.posAmountGiven.toFixed(2) + ' MAD');
                    hideVoiceFlowIndicator(); setTimeout(function() { showVoiceFlowIndicator('confirm'); }, 200);
                }
            }
            break;
        case 'client':
            window.posCurrentClient = { id: cmd.client.id, name: cmd.client.nom + ' ' + cmd.client.prenom }; window.posCurrentTable = '';
            var ci = document.getElementById('posClientSearchInput'); if (ci) ci.value = window.posCurrentClient.name;
            if (typeof window.updatePaymentButtons === 'function') window.updatePaymentButtons();
            setVoiceMode('payment', '🎤 Mode ou montant', null); showVoiceResult('👤 ' + window.posCurrentClient.name);
            if (typeof window.renderPOS === 'function') window.renderPOS();
            hideVoiceFlowIndicator(); setTimeout(function() { showVoiceFlowIndicator('payment_mode'); }, 200);
            break;
        case 'amount': if (window.posStep === 2) { if (typeof window.posAmountGiven !== 'undefined') { window.posAmountGiven = cmd.value; var ce2 = document.getElementById('posChangeDisplay'); if (ce2) { var st2 = typeof window.posCalculateTotal === 'function' ? window.posCalculateTotal() : 0, t2 = st2 - (window.posDiscountMAD || 0), c2 = window.posAmountGiven - t2; ce2.innerHTML = c2 >= 0 ? '<div class="pos-change-positive"><span>Rendu</span><span>' + c2.toFixed(2) + ' MAD</span></div>' : '<div class="pos-change-negative"><span>Manquant</span><span>' + Math.abs(c2).toFixed(2) + ' MAD</span></div>'; } var ai2 = document.getElementById('posAmountGiven'); if (ai2) ai2.value = window.posAmountGiven; showVoiceResult('💰 ' + window.posAmountGiven.toFixed(2) + ' MAD'); hideVoiceFlowIndicator(); setTimeout(function() { showVoiceFlowIndicator('confirm'); }, 200); } } break;
        case 'next': if (isModalOpen()) break; if (voiceMode === 'quantity') { setVoiceMode('search', '🎤 Recherche vocale active', null); if (typeof window.updateCartOnly === 'function') window.updateCartOnly(); showVoiceModeIndicator(); hideVoiceFlowIndicator(); setTimeout(function() { showVoiceFlowIndicator('product'); }, 200); } else if (window.posStep === 2) { if (typeof window.posFinalizeSale === 'function') { window.posFinalizeSale(); hideVoiceFlowIndicator(); } } else if (window.posCart && window.posCart.length > 0 && window.posStep === 1) { if (typeof window.posGoToStep2 === 'function') window.posGoToStep2(); hideVoiceFlowIndicator(); setTimeout(function() { showVoiceFlowIndicator('client'); }, 200); } break;
        case 'validate': if (isModalOpen()) break; if (voiceMode === 'quantity') { setVoiceMode('search', '🎤 Recherche vocale active', null); if (typeof window.updateCartOnly === 'function') window.updateCartOnly(); showVoiceModeIndicator(); hideVoiceFlowIndicator(); setTimeout(function() { showVoiceFlowIndicator('product'); }, 200); } else if (window.posStep === 2) { if (typeof window.posFinalizeSale === 'function') { window.posFinalizeSale(); hideVoiceFlowIndicator(); } } else if (window.posStep === 1 && window.posCart && window.posCart.length > 0) { if (typeof window.posGoToStep2 === 'function') window.posGoToStep2(); hideVoiceFlowIndicator(); setTimeout(function() { showVoiceFlowIndicator('client'); }, 200); } break;
        case 'finalize': if (window.posStep === 2 && typeof window.posFinalizeSale === 'function') { window.posFinalizeSale(); hideVoiceFlowIndicator(); } break;
        case 'clear': if (typeof window.posResetCart === 'function') { window.posResetCart(); showVoiceResult('🗑️ Panier vidé'); if (typeof window.renderPOS === 'function') window.renderPOS(); hideVoiceFlowIndicator(); showVoiceFlowIndicator('product'); } break;
        case 'cancel': if (voiceMode !== 'search') { setVoiceMode('search', '🎤 Recherche vocale active', null); showVoiceResult('↩️ Recherche'); if (typeof window.renderPOS === 'function') window.renderPOS(); hideVoiceFlowIndicator(); showVoiceFlowIndicator('product'); } break;
        default: if (cmd.text) { var q = cmd.text.toLowerCase().trim(), found = false;
            if (window.posStep === 2) { if (window.posAllClients) { var fc5 = fastFindClient(q); if (fc5.length > 0) { var b5 = fc5[0]; for (var j = 0; j < fc5.length; j++) { if ((fc5[j].nom + ' ' + fc5[j].prenom).toLowerCase().indexOf(q) !== -1) { b5 = fc5[j]; break; } } window.posCurrentClient = { id: b5.id, name: b5.nom + ' ' + b5.prenom }; window.posCurrentTable = ''; var ci2 = document.getElementById('posClientSearchInput'); if (ci2) ci2.value = window.posCurrentClient.name; if (typeof window.updatePaymentButtons === 'function') window.updatePaymentButtons(); if (typeof window.renderPOS === 'function') window.renderPOS(); showVoiceResult('👤 ' + window.posCurrentClient.name); hideVoiceFlowIndicator(); setTimeout(function() { showVoiceFlowIndicator('payment_mode'); }, 200); found = true; } } if (!found && typeof window.posSearchProducts === 'function') window.posSearchProducts(q); }
            else { if (typeof window.posSearchProducts === 'function') window.posSearchProducts(q); if (window.posAllClients) { var fc6 = fastFindClient(q); if (fc6.length > 0) { var b6 = fc6[0]; for (var j = 0; j < fc6.length; j++) { if ((fc6[j].nom + ' ' + fc6[j].prenom).toLowerCase().indexOf(q) !== -1) { b6 = fc6[j]; break; } } window.posCurrentClient = { id: b6.id, name: b6.nom + ' ' + b6.prenom }; window.posCurrentTable = ''; var ci3 = document.getElementById('posClientSearchInput'); if (ci3) ci3.value = window.posCurrentClient.name; if (typeof window.updatePaymentButtons === 'function') window.updatePaymentButtons(); if (typeof window.renderPOS === 'function') window.renderPOS(); showVoiceResult('👤 ' + window.posCurrentClient.name); hideVoiceFlowIndicator(); setTimeout(function() { showVoiceFlowIndicator('payment_mode'); }, 200); } } } }
            break;
    }
}

// ==================== MODE VOCAL ====================
function setVoiceMode(m, msg, pid) { voiceMode = m; if (msg) voiceModeMessage = msg; if (pid !== undefined) lastAddedProductId = pid; showVoiceModeIndicator(); }

// ==================== TOGGLE MICRO ====================
function posToggleVoiceSearch() { var s = checkVoiceSupport(); if (!s.supported) { alert('⚠️ ' + s.reason); return; } if (!navigator.onLine) { alert('⚠️ Connexion internet requise.'); return; } var mb = document.getElementById('posMicBtn'); if (isRecording) { posStopVoiceSearch(); return; } requestMicrophonePermission().then(function(p) { if (!p) { alert('❌ Micro refusé.'); return; } posStartVoiceRecording(); }); }

function posStartVoiceRecording() {
    var mb = document.getElementById('posMicBtn'); if (voiceRecognition) { try { voiceRecognition.abort(); } catch (e) {} voiceRecognition = null; }
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { alert('❌ Reconnaissance vocale non disponible.'); return; }
    voiceRecognition = new SR(); voiceRecognition.lang = 'fr-FR'; voiceRecognition.continuous = true; voiceRecognition.interimResults = true; voiceRecognition.maxAlternatives = 1;
    if (mb) { mb.classList.add('recording'); mb.innerHTML = '<i class="fas fa-circle" style="color:#ef4444;animation:pulse 0.5s ease-in-out infinite;"></i>'; mb.style.background = '#fee2e2'; mb.style.borderColor = '#ef4444'; mb.style.boxShadow = '0 0 0 4px rgba(239,68,68,0.3)'; mb.style.transform = 'scale(0.95)'; mb.style.border = '3px solid #ef4444'; }
    var style = document.getElementById('voiceStyle'); if (!style) { style = document.createElement('style'); style.id = 'voiceStyle'; document.head.appendChild(style); } style.textContent = '@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.2;transform:scale(1.3)}}.recording .fa-circle{animation:pulse 0.5s ease-in-out infinite !important}';
    var ft = '', li = '', proc = false, vdt = null;
    voiceRecognition.onresult = function(e) {
        var it = '', ftt = ''; for (var i = e.resultIndex; i < e.results.length; i++) { var t = e.results[i][0].transcript; if (e.results[i].isFinal) ftt += t; else it += t; }
        var cp = document.getElementById('pageTitle')?.textContent || '';
        var debounceDelay = 5;
        if (cp === 'Crédits') { var vd = document.getElementById('creditsVoiceDisplay'); if (vd) { if (ftt) { vd.value = ftt; clearTimeout(vdt); showProcessingIndicator(); vdt = setTimeout(function() { if (!proc) { proc = true; hideVoiceFlowIndicator(); var cmd = parseVoiceCommand(ftt); if (cmd.type !== 'ignore') handleVoiceCommand(cmd); proc = false; } }, debounceDelay); } else if (it) { vd.value = it + ' ✍️'; } } }
        else if (cp === 'Ventes') { var vd2 = document.getElementById('ventesVoiceDisplay'); if (vd2) { if (ftt) { vd2.value = ftt; clearTimeout(vdt); showProcessingIndicator(); vdt = setTimeout(function() { if (!proc) { proc = true; hideVoiceFlowIndicator(); var cmd = parseVoiceCommand(ftt); if (cmd.type !== 'ignore') handleVoiceCommand(cmd); proc = false; } }, debounceDelay); } else if (it) { vd2.value = it + ' ✍️'; } } }
        else { var si = document.getElementById('posSearchInput'); if (si) { if (ftt) { si.value = ftt; clearTimeout(vdt); showProcessingIndicator(); vdt = setTimeout(function() { if (!proc) { proc = true; hideVoiceFlowIndicator(); var cmd = parseVoiceCommand(ftt); if (cmd.type !== 'ignore') handleVoiceCommand(cmd); proc = false; } }, debounceDelay); } else if (it && it !== li) { si.value = it + ' ✍️'; li = it; } } }
    };
    voiceRecognition.onend = function() { if (isRecording) { setTimeout(function() { try { voiceRecognition.start(); } catch (e) { posStopVoiceSearch(); } }, 8); } };
    voiceRecognition.onerror = function(e) { if (e.error === 'aborted' || e.error === 'no-speech') return; if (e.error === 'network') showVoiceResult('❌ Réseau'); posStopVoiceSearch(); };
    try { voiceRecognition.start(); isRecording = true; showVoiceModeIndicator(); showVoiceResult('🎤 Écoute...'); showVoiceFlowIndicator('product'); } catch (e) { isRecording = false; if (mb) { mb.classList.remove('recording'); mb.innerHTML = '<i class="fas fa-microphone"></i>'; mb.style.background = '#dcfce7'; mb.style.borderColor = '#16a34a'; mb.style.boxShadow = 'none'; mb.style.transform = 'scale(1)'; mb.style.border = '3px solid #16a34a'; } }
}

function posStopVoiceSearch() { if (voiceRecognition) { try { voiceRecognition.abort(); } catch (e) {} voiceRecognition = null; } isRecording = false; var mb = document.getElementById('posMicBtn'), si = document.getElementById('posSearchInput'); if (mb) { mb.classList.remove('recording'); mb.innerHTML = '<i class="fas fa-microphone"></i>'; mb.style.background = '#dcfce7'; mb.style.borderColor = '#16a34a'; mb.style.boxShadow = 'none'; mb.style.transform = 'scale(1)'; mb.style.border = '3px solid #16a34a'; } if (si) { si.placeholder = '🔍 Rechercher...'; si.style.background = '#fff'; si.style.borderColor = '#e2e8f0'; si.style.boxShadow = 'none'; si.style.border = '2px solid #e2e8f0'; } var se = document.getElementById('voiceStyle'); if (se) se.remove(); var ind = document.getElementById('voiceModeIndicator'); if (ind) ind.remove(); hideVoiceFlowIndicator(); showVoiceResult('🎤 Micro désactivé'); }

// ==================== RECONSTRUCTION INDEX ====================
var originalLoadPosPage = window.loadPosPage;
if (typeof originalLoadPosPage === 'function') { window.loadPosPage = async function(c) { await originalLoadPosPage(c); setTimeout(function() { invalidateClientIndex(); }, 500); }; }

// ==================== EXPORTS ====================
window.posToggleVoiceSearch = posToggleVoiceSearch;
window.showVoiceResult = showVoiceResult;
window.setVoiceMode = setVoiceMode;
window.showVoiceModeIndicator = showVoiceModeIndicator;
window.activateCreditSelection = activateCreditSelection;
window.selectCreditLine = selectCreditLine;
window.markCreditForPayment = markCreditForPayment;
window.setCreditPaymentAmount = setCreditPaymentAmount;
window.validateCreditPayment = validateCreditPayment;
window.closeCreditSelection = closeCreditSelection;
window.parseVoiceCommand = parseVoiceCommand;
window.handleVoiceCommand = handleVoiceCommand;
window.invalidateClientIndex = invalidateClientIndex;
window.deleteCreditByVoice = deleteCreditByVoice;
window.deleteSelectedCredit = deleteSelectedCredit;
window.confirmDeleteCredit = confirmDeleteCredit;
window.cancelDeleteCredit = cancelDeleteCredit;
window.showVoiceFlowIndicator = showVoiceFlowIndicator;
window.hideVoiceFlowIndicator = hideVoiceFlowIndicator;
window.showProcessingIndicator = showProcessingIndicator;
window.onProductAdded = function(pid) { lastAddedProductId = pid; setVoiceMode('quantity', '🔢 Qté', pid); showVoiceModeIndicator(); hideVoiceFlowIndicator(); setTimeout(function() { showVoiceFlowIndicator('quantity'); }, 200); };
window.selectAllCredits = selectAllCredits;
window.deselectAllCredits = deselectAllCredits;
window.deleteAllCredits = deleteAllCredits;

console.log('🎤 Module vocal – ventes enrichies OK');
