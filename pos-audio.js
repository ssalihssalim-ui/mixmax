// ==================== POS-AUDIO.JS v6 - RECONNAISSANCE VOCALE OPTIMISÉE ====================
// Mixmax Minimarket - Module vocal ultra-rapide avec index de recherche

var voiceRecognition = null;
var isRecording = false;
var voiceTimeout = null;
var searchTimeout = null;

var voiceMode = 'search';
var lastAddedProductId = null;
var voiceModeMessage = '🎤 Recherche vocale active';
var lastVoiceCommandTime = 0;

// ========== DICTIONNAIRES ==========
var paymentKeywords = {
    'espece': ['espèces', 'espece', 'argent', 'cash', 'comptant', 'liquide', 'espèce'],
    'credit': ['crédit', 'credit', 'à crédit', 'acredit', 'dette', 'avance', 'crédit'],
    'partiel': ['partiel', 'partielle', 'acompte', 'moitié', 'partial', 'part', 'partiel']
};

var numberMap = {
    'un': 1, 'une': 1, 'deux': 2, 'trois': 3, 'quatre': 4, 'cinq': 5,
    'six': 6, 'sept': 7, 'huit': 8, 'neuf': 9, 'dix': 10,
    'onze': 11, 'douze': 12, 'douz': 12, 'treize': 13, 'quatorze': 14,
    'quinze': 15, 'seize': 16, 'vingt': 20, 'trente': 30, 'quarante': 40,
    'cinquante': 50, 'soixante': 60, 'cent': 100
};

// ========== MOTS-CLÉS PRIORITAIRES (vérifiés en premier) ==========
var priorityKeywords = ['pos', 'caisse', 'crédits', 'crédit', 'ventes', 'vente', 
    'valide', 'valider', 'passe', 'passer', 'annule', 'annuler', 'efface', 'vider', 
    'termine', 'terminer', 'dashboard', 'accueil', 'home', 'produits', 'catalogue',
    'clients', 'commandes', 'catégories', 'impayés', 'sélectionner', 'payer', 'régler',
    'fermer', 'retour', 'suivant', 'confirmer', 'ok', 'fin', 'table', 'numéro', 'ligne'];

// ========== INDEX DE RECHERCHE CLIENT (ULTRA-RAPIDE) ==========
var clientSearchIndex = {};
var clientSearchIndexBuilt = false;
var searchCache = {};
var searchCacheTimeout = {};

window.creditSelectionMode = false;
window.creditSelectedIndex = -1;
window.creditPaymentAmount = 0;
window.creditPaymentStep = 'idle';

// ==================== CONSTRUCTION INDEX CLIENT ====================
function buildClientSearchIndex() {
    if (clientSearchIndexBuilt) return;
    clientSearchIndex = {};
    if (window.posAllClients && window.posAllClients.length) {
        window.posAllClients.forEach(function(c) {
            if (!c || !c.id) return;
            var nom = (c.nom || '').toLowerCase().trim();
            var prenom = (c.prenom || '').toLowerCase().trim();
            var desc = (c.description || '').toLowerCase().trim();
            var tel = (c.telephone || '').toLowerCase().trim();
            var fullName = nom + ' ' + prenom;
            
            // Indexer chaque mot séparément
            var allWords = (nom + ' ' + prenom + ' ' + desc + ' ' + tel).split(/[\s,;.]+/);
            allWords.forEach(function(word) {
                word = word.trim();
                if (word.length >= 2) {
                    if (!clientSearchIndex[word]) clientSearchIndex[word] = [];
                    if (clientSearchIndex[word].indexOf(c) === -1) clientSearchIndex[word].push(c);
                }
            });
            
            // Indexer le nom complet
            if (fullName.length >= 2) {
                if (!clientSearchIndex[fullName]) clientSearchIndex[fullName] = [];
                if (clientSearchIndex[fullName].indexOf(c) === -1) clientSearchIndex[fullName].push(c);
            }
        });
    }
    clientSearchIndexBuilt = true;
    console.log('📇 Index client construit:', Object.keys(clientSearchIndex).length, 'mots');
}

// ✅ Invalider l'index quand les clients changent
function invalidateClientIndex() {
    clientSearchIndexBuilt = false;
    clientSearchIndex = {};
    searchCache = {};
}

// ==================== RECHERCHE CLIENT ULTRA-RAPIDE ====================
function fastClientSearch(query) {
    buildClientSearchIndex();
    var q = query.toLowerCase().trim();
    if (!q || q.length < 2) return window.posAllClients ? window.posAllClients.slice() : [];
    
    var words = q.split(/[\s,;.]+/);
    var results = [];
    var seen = {};
    
    // Chercher chaque mot dans l'index
    words.forEach(function(w) {
        w = w.trim();
        if (w.length < 2) return;
        var matches = clientSearchIndex[w] || [];
        matches.forEach(function(c) {
            if (!seen[c.id]) {
                seen[c.id] = true;
                results.push(c);
            }
        });
    });
    
    // Fallback : recherche classique si pas trouvé
    if (results.length === 0 && window.posAllClients) {
        results = window.posAllClients.filter(function(c) {
            return (c.nom || '').toLowerCase().indexOf(q) !== -1 ||
                   (c.prenom || '').toLowerCase().indexOf(q) !== -1 ||
                   (c.description || '').toLowerCase().indexOf(q) !== -1 ||
                   (c.telephone || '').toLowerCase().indexOf(q) !== -1;
        });
    }
    
    return results;
}

// ==================== CACHE DES RECHERCHES ====================
function cachedClientSearch(query) {
    var key = query.toLowerCase().trim();
    
    // Vérifier le cache (valide 30 secondes)
    if (searchCache[key] && (Date.now() - searchCache[key].time) < 30000) {
        return searchCache[key].results;
    }
    
    var results = fastClientSearch(query);
    
    // Mettre en cache
    searchCache[key] = { results: results, time: Date.now() };
    
    // Nettoyage différé
    clearTimeout(searchCacheTimeout[key]);
    searchCacheTimeout[key] = setTimeout(function() {
        delete searchCache[key];
    }, 30000);
    
    return results;
}

// ==================== DÉTECTION PRIORITAIRE ====================
function quickKeywordDetect(transcript) {
    var t = transcript.toLowerCase().trim();
    for (var i = 0; i < priorityKeywords.length; i++) {
        if (t.indexOf(priorityKeywords[i]) !== -1) {
            return priorityKeywords[i];
        }
    }
    return null;
}

// ==================== UTILITAIRES ====================
function isIOSStandalone(){ return /iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream&&(window.navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches); }
function checkVoiceSupport(){ var i=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream; if(i&&isIOSStandalone()) return{supported:false,reason:'Ouvrez dans Safari pour le micro'}; if(!('webkitSpeechRecognition' in window)&&!('SpeechRecognition' in window)) return{supported:false,reason:'Navigateur non supporté'}; return{supported:true}; }
async function requestMicrophonePermission(){ try{ if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia) return false; const s=await navigator.mediaDevices.getUserMedia({audio:true}); s.getTracks().forEach(t=>t.stop()); return true; }catch(e){ return false; } }
function showSafariBanner(){ if(!isIOSStandalone()) return; if(document.getElementById('iosPwaBanner')) return; var c=document.getElementById('dynamicContent'); if(!c) return; var b=document.createElement('div'); b.id='iosPwaBanner'; b.style.cssText='background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;'; b.innerHTML='<div style="display:flex;align-items:center;gap:8px;"><i class="fas fa-exclamation-triangle" style="color:#d97706;"></i><span style="font-size:0.8rem;color:#92400e;"><strong>📱 Microphone</strong><br><span style="font-size:0.7rem;">Ouvrez dans Safari pour le micro.</span></span></div><button onclick="window.open(window.location.href.split(\'?\')[0],\'_blank\')" style="background:#f59e0b;border:none;padding:6px 14px;border-radius:6px;color:#fff;font-weight:600;cursor:pointer;">🌐 Ouvrir</button>'; c.insertBefore(b,c.firstChild); }
function showVoiceModeIndicator(){ var ind=document.getElementById('voiceModeIndicator'); if(!ind){ var cont=document.querySelector('.pos-products-panel'); if(!cont) return; ind=document.createElement('div'); ind.id='voiceModeIndicator'; ind.style.cssText='background:#f0fdf4;border:2px solid #16a34a;border-radius:8px;padding:6px 12px;margin-bottom:8px;font-size:0.8rem;display:flex;align-items:center;gap:8px;color:#14532d;'; cont.insertBefore(ind,cont.firstChild); } var icon=voiceMode==='search'?'fa-microphone':(voiceMode==='quantity'?'fa-hashtag':(voiceMode==='client'?'fa-user':'fa-money-bill-wave')); var color=voiceMode==='search'?'#16a34a':(voiceMode==='quantity'?'#f59e0b':(voiceMode==='client'?'#4f46e5':'#dc2626')); ind.innerHTML='<i class="fas '+icon+'" style="color:'+color+';"></i> '+(voiceModeMessage||'🎤 Recherche vocale active')+' <span style="font-size:0.6rem;color:#94a3b8;margin-left:auto;">'+voiceMode+'</span>'; ind.style.borderColor=color; ind.style.background=voiceMode==='search'?'#f0fdf4':'#fefce8'; }
function showVoiceResult(msg){ var div=document.getElementById('voiceResultDisplay'); if(!div){ div=document.createElement('div'); div.id='voiceResultDisplay'; div.style.cssText='position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#2E7D32;color:#fff;padding:12px 24px;border-radius:12px;font-weight:600;font-size:1rem;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);display:none;max-width:90%;text-align:center;'; document.body.appendChild(div); } var isErr=msg.indexOf('⚠️')!==-1||msg.indexOf('❌')!==-1; div.style.background=isErr?'#ef4444':'#2E7D32'; div.textContent=msg; div.style.display='block'; clearTimeout(window._voiceResultTimeout); window._voiceResultTimeout=setTimeout(function(){ div.style.display='none'; },2000); }
function isModalOpen(){ var m=document.getElementById('modalOverlay'); return m&&!m.classList.contains('hidden'); }

// ==================== GESTION CRÉDITS ====================
function activateCreditSelection(){ window.creditSelectionMode=true; window.creditSelectedIndex=-1; window.creditPaymentStep='idle'; if(typeof window.renderCreditsTable==='function') window.renderCreditsTable(); showVoiceResult('📋 Mode sélection activé'); }
function selectCreditLine(n){ var d=window.filteredCredits||window.allCreditsData||[]; var i=n-1; if(i<0||i>=d.length){ showVoiceResult('❌ Ligne '+n+' inexistante'); return; } if(!window.creditSelectionMode){ showVoiceResult('⚠️ Dites "sélectionner" d\'abord'); return; } window.creditSelectedIndex=i; window.creditPaymentStep='selection'; window.creditPaymentAmount=0; if(typeof window.renderCreditsTable==='function') window.renderCreditsTable(); var c=d[i]; showVoiceResult('✅ Ligne '+n+' - '+(c.clientName||'')+' - '+(c.remainingAmount||c.total||0).toFixed(2)+' MAD'); }
function markCreditForPayment(){ if(window.creditSelectedIndex<0){ showVoiceResult('⚠️ Aucune ligne sélectionnée'); return; } var d=window.filteredCredits||window.allCreditsData||[]; var c=d[window.creditSelectedIndex]; if(!c){ showVoiceResult('❌ Crédit introuvable'); return; } if(c.paid){ showVoiceResult('⚠️ Déjà payé'); return; } window.creditPaymentStep='payment'; var r=c.remainingAmount||c.total||0; showVoiceResult('💳 Restant: '+r.toFixed(2)+' MAD. Dites le montant'); var z=document.getElementById('creditPaymentZone'); if(z){ z.style.display='block'; var info=document.getElementById('creditPaymentInfo'); if(info) info.textContent='Client: '+(c.clientName||'Inconnu')+' | Restant: '+r.toFixed(2)+' MAD'; var inp=document.getElementById('creditPaymentAmountInput'); if(inp){ inp.value=''; inp.focus(); inp.select(); } } }
function setCreditPaymentAmount(a){ if(window.creditSelectedIndex<0){ showVoiceResult('⚠️ Aucun crédit sélectionné'); return; } if(a<=0){ showVoiceResult('❌ Montant invalide'); return; } window.creditPaymentAmount=a; window.creditPaymentStep='amount'; var inp=document.getElementById('creditPaymentAmountInput'); if(inp) inp.value=a; showVoiceResult('💰 '+a.toFixed(2)+' MAD. Dites "valide"'); }
function validateCreditPayment(){ if(window.creditSelectedIndex<0){ showVoiceResult('⚠️ Aucun crédit sélectionné'); return; } var inp=document.getElementById('creditPaymentAmountInput'); var a=parseFloat(inp?inp.value:window.creditPaymentAmount); if(isNaN(a)||a<=0){ showVoiceResult('❌ Montant invalide'); return; } var d=window.filteredCredits||window.allCreditsData||[]; var c=d[window.creditSelectedIndex]; if(!c){ showVoiceResult('❌ Crédit introuvable'); return; } var r=c.remainingAmount||c.total||0; if(a>r){ showVoiceResult('⚠️ Montant > reste ('+r.toFixed(2)+' MAD)'); return; } var nr=r-a; var p=nr<=0.01; CacheDB.write('credits',c.id,{paid:p,remainingAmount:Math.max(0,nr),amountGiven:(c.amountGiven||0)+a,paidAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},'update').then(function(){ showVoiceResult(p?'✅ Crédit soldé !':'✅ Payé. Reste: '+nr.toFixed(2)+' MAD'); window.creditPaymentStep='idle'; window.creditSelectedIndex=-1; window.creditPaymentAmount=0; window.creditSelectionMode=false; var z=document.getElementById('creditPaymentZone'); if(z) z.style.display='none'; if(typeof window.loadCredits==='function') window.loadCredits(); CacheDB.sync(); }).catch(function(e){ showVoiceResult('❌ Erreur: '+e.message); }); }
function closeCreditSelection(){ window.creditSelectionMode=false; window.creditSelectedIndex=-1; window.creditPaymentAmount=0; window.creditPaymentStep='idle'; var z=document.getElementById('creditPaymentZone'); if(z) z.style.display='none'; if(typeof window.applyCreditsFilters==='function'){ window.creditsSearch=''; window.currentPages.credits=1; window.filteredCredits=null; window.applyCreditsFilters(); } showVoiceResult('📋 Liste complète'); }

// ==================== DÉTECTION PAIEMENT ====================
function detectPaymentMode(t){ t=t.toLowerCase().trim(); for(var m in paymentKeywords){ for(var i=0;i<paymentKeywords[m].length;i++){ if(t.indexOf(paymentKeywords[m][i])!==-1) return m; } } return null; }

// ==================== PARSER VOCAL v6 OPTIMISÉ ====================
function parseVoiceCommand(transcript) {
    transcript = transcript.toLowerCase().trim();
    var now = Date.now();
    
    // ✅ Anti-doublon optimisé : 300ms
    if (now - lastVoiceCommandTime < 300) return { type: 'ignore' };
    lastVoiceCommandTime = now;
    
    var currentPage = document.getElementById('pageTitle')?.textContent || '';
    
    // ✅ Détection prioritaire des mots-clés
    var quickKey = quickKeywordDetect(transcript);

    // ===================================================================
    // BLOC VENTES
    // ===================================================================
    if (currentPage === 'Ventes') {
        // Navigation depuis Ventes
        if (transcript.includes('point de vente') || transcript.includes('point vente') || 
            transcript.includes('pos') || transcript.includes('caisse') ||
            transcript.includes('retour pos') || transcript.includes('aller au pos')) {
            return { type: 'navigate', page: 'pos' };
        }
        if (transcript.includes('crédits') || transcript.includes('impayés')) return { type: 'navigate', page: 'credits' };
        if (transcript.includes('dashboard') || transcript.includes('accueil') || transcript.includes('home')) return { type: 'navigate', page: 'dashboard' };
        if (transcript.includes('commandes')) return { type: 'navigate', page: 'commandes' };
        if (transcript.includes('produits') || transcript.includes('catalogue')) return { type: 'navigate', page: 'products' };
        if (transcript.includes('clients') || transcript.includes('clientèle')) return { type: 'navigate', page: 'clients' };
        if (transcript.includes('ventes') || transcript.includes('vente')) { showVoiceResult('✅ Déjà sur Ventes'); return { type: 'ignore' }; }

        // ✅ Recherche client avec l'index optimisé
        var clientName = null;
        var q = transcript.toLowerCase().trim();
        if (window.posAllClients) {
            var foundClients = cachedClientSearch(q);
            if (foundClients.length === 1) {
                clientName = foundClients[0].nom + ' ' + foundClients[0].prenom;
            } else if (foundClients.length > 1) {
                // Prendre le meilleur match (nom complet)
                for (var j = 0; j < foundClients.length; j++) {
                    var c = foundClients[j];
                    var fullName = (c.nom + ' ' + c.prenom).toLowerCase();
                    if (fullName.indexOf(q) !== -1) {
                        clientName = c.nom + ' ' + c.prenom;
                        break;
                    }
                }
                if (!clientName) clientName = foundClients[0].nom + ' ' + foundClients[0].prenom;
            }
        }
        if (clientName) return { type: 'search_client_in_ventes', clientName: clientName };
    }

    // ===================================================================
    // BLOC CRÉDITS
    // ===================================================================
    if (currentPage === 'Crédits') {
        // Navigation depuis Crédits
        if (transcript.includes('point de vente') || transcript.includes('point vente') || 
            transcript.includes('pos') || transcript.includes('caisse') ||
            transcript.includes('retour pos') || transcript.includes('aller au pos')) {
            return { type: 'navigate', page: 'pos' };
        }
        if (transcript.includes('ventes') || transcript.includes('vente')) return { type: 'navigate', page: 'ventes' };
        if (transcript.includes('dashboard') || transcript.includes('accueil') || transcript.includes('home')) return { type: 'navigate', page: 'dashboard' };
        if (transcript.includes('commandes')) return { type: 'navigate', page: 'commandes' };
        if (transcript.includes('produits') || transcript.includes('catalogue')) return { type: 'navigate', page: 'products' };
        if (transcript.includes('clients') || transcript.includes('clientèle')) return { type: 'navigate', page: 'clients' };
        if (transcript.includes('crédits') || transcript.includes('impayés')) { showVoiceResult('✅ Déjà sur Crédits'); return { type: 'ignore' }; }

        // ✅ Recherche client avec l'index optimisé
        var clientName2 = null;
        var q2 = transcript.toLowerCase().trim();
        if (window.posAllClients) {
            var foundClients2 = cachedClientSearch(q2);
            if (foundClients2.length === 1) {
                clientName2 = foundClients2[0].nom + ' ' + foundClients2[0].prenom;
            } else if (foundClients2.length > 1) {
                for (var j2 = 0; j2 < foundClients2.length; j2++) {
                    var c2 = foundClients2[j2];
                    var fullName2 = (c2.nom + ' ' + c2.prenom).toLowerCase();
                    if (fullName2.indexOf(q2) !== -1) {
                        clientName2 = c2.nom + ' ' + c2.prenom;
                        break;
                    }
                }
                if (!clientName2) clientName2 = foundClients2[0].nom + ' ' + foundClients2[0].prenom;
            }
        }
        if (clientName2) return { type: 'search_client_in_credits', clientName: clientName2 };

        // Commandes spécifiques crédits
        if (transcript.includes('sélectionner') || transcript.includes('select') || transcript.includes('choisir') || transcript.includes('cocher')) return { type: 'activate_credit_selection' };
        var lineMatch = transcript.match(/(?:ligne|numéro)\s+([a-z0-9]+)/i);
        if (lineMatch) { var numStr = lineMatch[1], num = parseInt(numStr); if (isNaN(num)) { for (var word in numberMap) { if (numStr.toLowerCase() === word) { num = numberMap[word]; break; } } } if (!isNaN(num) && num > 0) return { type: 'select_credit_line', lineNumber: num }; }
        if (window.creditSelectionMode && (window.creditPaymentStep !== 'payment' && window.creditPaymentStep !== 'amount')) { var anyNumber = transcript.match(/\b(\d+)\b/), num = null; if (anyNumber) { num = parseInt(anyNumber[1]); } else { for (var word in numberMap) { if (transcript.includes(word)) { num = numberMap[word]; break; } } } if (num !== null && !isNaN(num) && num > 0) return { type: 'select_credit_line', lineNumber: num }; }
        if (transcript.includes('marquer payé') || transcript.includes('payer') || transcript.includes('régler')) return { type: 'mark_credit_paid' };
        var amountMatch = transcript.match(/montant\s+(\d+[.,]?\d*)/i);
        if (amountMatch) { var amount = parseFloat(amountMatch[1].replace(',', '.')); if (!isNaN(amount) && amount > 0) return { type: 'set_credit_amount', amount: amount }; }
        else if (window.creditPaymentStep === 'payment' || window.creditPaymentStep === 'amount') { var amountNumber = transcript.match(/\b(\d+[.,]?\d*)\b/); if (amountNumber) { var amount = parseFloat(amountNumber[1].replace(',', '.')); if (!isNaN(amount) && amount > 0) return { type: 'set_credit_amount', amount: amount }; } var foundAmount = null; for (var word in numberMap) { if (transcript.includes(word)) { foundAmount = numberMap[word]; break; } } if (foundAmount !== null && foundAmount > 0) return { type: 'set_credit_amount', amount: foundAmount }; }
        if (transcript.includes('valide') || transcript.includes('confirmer') || transcript.includes('ok')) return { type: 'validate_credit_payment' };
        if (transcript.includes('fermer') || transcript.includes('retour')) return { type: 'close_credit_list' };
        return { type: 'unknown', text: transcript };
    }

    // ===================================================================
    // NAVIGATION VOCALE (depuis POS, Dashboard, etc.)
    // ===================================================================
    if (transcript.includes('crédits') || transcript.includes('impayés')) return { type: 'navigate', page: 'credits' };
    if (transcript.includes('ventes') || transcript.includes('vente')) return { type: 'navigate', page: 'ventes' };
    if (transcript.includes('dashboard') || transcript.includes('accueil') || transcript.includes('home')) return { type: 'navigate', page: 'dashboard' };
    if (transcript.includes('produits') || transcript.includes('catalogue')) return { type: 'navigate', page: 'products' };
    if (transcript.includes('clients') || transcript.includes('clientèle')) return { type: 'navigate', page: 'clients' };
    if (transcript.includes('commandes en ligne') || transcript.includes('commandes')) return { type: 'navigate', page: 'commandes' };
    if (transcript.includes('catégories')) return { type: 'navigate', page: 'categories' };
    if (transcript.includes('point de vente') || transcript.includes('pos') || transcript.includes('caisse')) return { type: 'navigate', page: 'pos' };

    // === MODE PAIEMENT ===
    if (window.posStep === 2) { var paymentMode = detectPaymentMode(transcript); if (paymentMode) return { type: 'payment_mode', mode: paymentMode }; }

    // === NOMBRES ===
    var numberMatch = transcript.match(/\b(\d+)\b/); if (numberMatch) return { type: 'number', value: parseInt(numberMatch[1]) };
    for (var word in numberMap) { if (transcript.indexOf(word) !== -1) return { type: 'number', value: numberMap[word] }; }

    // === ACTIONS ===
    if (transcript.includes('passe') || transcript.includes('passer') || transcript.includes('suivant')) return { type: 'next' };
    if (currentPage !== 'Crédits') { if (transcript.includes('valide') || transcript.includes('valider') || transcript.includes('confirmer') || transcript.includes('ok')) return { type: 'validate' }; }
    if (transcript.includes('annule') || transcript.includes('annuler')) return { type: 'cancel' };
    if (transcript.includes('efface') || transcript.includes('vider')) return { type: 'clear' };
    if (transcript.includes('termine') || transcript.includes('terminer') || transcript.includes('fin')) return { type: 'finalize' };

    // === RECHERCHE PRODUIT/CLIENT ===
    if (window.posStep === 2) {
        if (window.posAllClients) { var fc = cachedClientSearch(transcript); if (fc.length > 0) { var best = fc[0]; for (var j = 0; j < fc.length; j++) { var c = fc[j]; if ((c.nom + ' ' + c.prenom).toLowerCase().indexOf(transcript) !== -1) { best = c; break; } } return { type: 'client', client: best }; } }
        if (window.posProductsList) { var fp2 = null, bml2 = 0; for (var i2 = 0; i2 < window.posProductsList.length; i2++) { var p2 = window.posProductsList[i2], pn2 = p2.nom.toLowerCase(); if (transcript.includes(pn2) && pn2.length > bml2) { fp2 = p2; bml2 = pn2.length; } } if (fp2) return { type: 'product', product: fp2 }; }
    } else {
        if (window.posProductsList) { var fp = null, bml = 0; for (var i = 0; i < window.posProductsList.length; i++) { var p = window.posProductsList[i], pn = p.nom.toLowerCase(); if (transcript.includes(pn) && pn.length > bml) { fp = p; bml = pn.length; } } if (fp) return { type: 'product', product: fp }; }
        if (window.posAllClients) { var fc2 = cachedClientSearch(transcript); if (fc2.length > 0) { var best2 = fc2[0]; for (var j = 0; j < fc2.length; j++) { var c = fc2[j]; if ((c.nom + ' ' + c.prenom).toLowerCase().indexOf(transcript) !== -1) { best2 = c; break; } } return { type: 'client', client: best2 }; } }
    }

    // === MONTANT ===
    var amountMatch = transcript.match(/\d+[.,]?\d*/); if (amountMatch) { var amount = parseFloat(amountMatch[0].replace(',', '.')); if (amount > 0) return { type: 'amount', value: amount }; }

    return { type: 'unknown', text: transcript };
}

// ==================== RECHERCHE CLIENTS (navigation) ====================
function searchClientInVentes(n){ if(!n) return; var s=document.getElementById('ventesSearchInput'); if(s){ s.value=n; if(typeof window.ventesSearch!=='undefined') window.ventesSearch=n; if(typeof window.currentPages!=='undefined') window.currentPages.ventes=1; if(typeof window.applyVentesFilters==='function') window.applyVentesFilters(); showVoiceResult('🔍 '+n); }else{ if(typeof navigateTo==='function'){ navigateTo('ventes'); setTimeout(function(){ var si=document.getElementById('ventesSearchInput'); if(si){ si.value=n; if(typeof window.ventesSearch!=='undefined') window.ventesSearch=n; if(typeof window.currentPages!=='undefined') window.currentPages.ventes=1; if(typeof window.applyVentesFilters==='function') window.applyVentesFilters(); showVoiceResult('🔍 '+n); } },400); } } }
function searchClientInCredits(n){ if(!n) return; if(typeof navigateTo==='function'){ navigateTo('credits'); setTimeout(function(){ if(typeof selectCreditClient==='function') selectCreditClient(n); },400); } }

// ==================== GESTIONNAIRE DE COMMANDES ====================
function handleVoiceCommand(cmd){
    console.log('🎤',cmd.type); var cp=document.getElementById('pageTitle')?.textContent||'';
    switch(cmd.type){
        case'search_client_in_ventes': searchClientInVentes(cmd.clientName); break;
        case'search_client_in_credits': searchClientInCredits(cmd.clientName); break;
        case'activate_credit_selection': activateCreditSelection(); break;
        case'select_credit_line': selectCreditLine(cmd.lineNumber); break;
        case'mark_credit_paid': markCreditForPayment(); break;
        case'set_credit_amount': setCreditPaymentAmount(cmd.amount); break;
        case'validate_credit_payment': validateCreditPayment(); break;
        case'close_credit_list': closeCreditSelection(); break;
        case'navigate':
            var p=cmd.page, pt={'credits':'Crédits','ventes':'Ventes','dashboard':'Dashboard','products':'Produits','clients':'Clients','commandes':'Commandes en ligne','categories':'Catégories','pos':'POS'};
            if(cp===pt[p]){ showVoiceResult('✅ Déjà sur '+pt[p]); return; }
            if(typeof window.posCart!=='undefined'&&window.posCart.length>0&&window.posStep===1&&p!=='pos'){ if(!confirm('⚠️ Panier non vide. Vider et changer de page ?')){ showVoiceResult('↩️ Annulé'); return; } if(typeof window.posResetCart==='function') window.posResetCart(); }
            showVoiceResult('📋 '+pt[p]);
            if(typeof navigateTo==='function') navigateTo(p);
            break;
        case'payment_mode':
            var m=cmd.mode; if((m==='credit'||m==='partiel')&&(!window.posCurrentClient||!window.posCurrentClient.id)){ alert('Client requis'); showVoiceResult('⚠️ Client requis'); return; }
            if(typeof window.posSetPaymentMethod==='function'){ window.posSetPaymentMethod(m); showVoiceResult('✅ '+m); if(typeof window.renderPOS==='function') window.renderPOS(); if(m==='espece') setTimeout(function(){ var ai=document.getElementById('posAmountGiven'); if(ai) ai.focus(); },200); }
            break;
        case'product':
            if(typeof window.posProductsList!=='undefined'&&window.posProductsList.length){ var pr=window.posProductsList.find(function(x){ return x.id===cmd.product.id; }); if(!pr) break; if(pr.stock!==undefined&&pr.stock<=0){ showVoiceResult('⚠️ Rupture: '+pr.nom); return; } if(typeof window.posAddToCartOrOpenOptions==='function') window.posAddToCartOrOpenOptions(pr.id); }
            break;
        case'number':
            if(voiceMode==='quantity'&&lastAddedProductId){ var qty=cmd.value; if(qty<1) qty=1; if(typeof window.posProductsList!=='undefined'){ var it=window.posCart.find(function(x){ return x.id===lastAddedProductId; }); if(it){ var p2=window.posProductsList.find(function(x){ return x.id===lastAddedProductId; }); if(p2&&p2.stock!==undefined&&qty>p2.stock){ showVoiceResult('⚠️ Stock max: '+p2.stock); return; } it.quantite=qty; lastAddedProductId=null; setVoiceMode('search','🎤 Recherche vocale active',null); showVoiceResult('✅ Qté: '+qty); if(typeof window.updateCartOnly==='function') window.updateCartOnly(); showVoiceModeIndicator(); } } }
            else if(voiceMode==='payment'||window.posStep===2){ if(typeof window.posAmountGiven!=='undefined'){ window.posAmountGiven=cmd.value; var ce=document.getElementById('posChangeDisplay'); if(ce){ var st=typeof window.posCalculateTotal==='function'?window.posCalculateTotal():0,t=st-(window.posDiscountMAD||0),c=window.posAmountGiven-t; ce.innerHTML=c>=0?'<div class="pos-change-positive"><span>Rendu</span><span>'+c.toFixed(2)+' MAD</span></div>':'<div class="pos-change-negative"><span>Manquant</span><span>'+Math.abs(c).toFixed(2)+' MAD</span></div>'; } var ai=document.getElementById('posAmountGiven'); if(ai) ai.value=window.posAmountGiven; showVoiceResult('💰 '+window.posAmountGiven.toFixed(2)+' MAD'); } }
            break;
        case'client': window.posCurrentClient={id:cmd.client.id,name:cmd.client.nom+' '+cmd.client.prenom}; window.posCurrentTable=''; var ci=document.getElementById('posClientSearchInput'); if(ci) ci.value=window.posCurrentClient.name; if(typeof window.updatePaymentButtons==='function') window.updatePaymentButtons(); setVoiceMode('payment','🎤 Dites le montant ou mode paiement',null); showVoiceResult('👤 '+window.posCurrentClient.name); if(typeof window.renderPOS==='function') window.renderPOS(); break;
        case'amount': if(window.posStep===2){ if(typeof window.posAmountGiven!=='undefined'){ window.posAmountGiven=cmd.value; var ce2=document.getElementById('posChangeDisplay'); if(ce2){ var st2=typeof window.posCalculateTotal==='function'?window.posCalculateTotal():0,t2=st2-(window.posDiscountMAD||0),c2=window.posAmountGiven-t2; ce2.innerHTML=c2>=0?'<div class="pos-change-positive"><span>Rendu</span><span>'+c2.toFixed(2)+' MAD</span></div>':'<div class="pos-change-negative"><span>Manquant</span><span>'+Math.abs(c2).toFixed(2)+' MAD</span></div>'; } var ai2=document.getElementById('posAmountGiven'); if(ai2) ai2.value=window.posAmountGiven; showVoiceResult('💰 '+window.posAmountGiven.toFixed(2)+' MAD'); } } break;
        case'next': if(isModalOpen()) break; if(voiceMode==='quantity'){ setVoiceMode('search','🎤 Recherche vocale active',null); if(typeof window.updateCartOnly==='function') window.updateCartOnly(); showVoiceModeIndicator(); }else if(window.posStep===2){ if(typeof window.posFinalizeSale==='function') window.posFinalizeSale(); }else if(window.posCart&&window.posCart.length>0&&window.posStep===1){ if(typeof window.posGoToStep2==='function') window.posGoToStep2(); } break;
        case'validate': if(isModalOpen()) break; if(voiceMode==='quantity'){ setVoiceMode('search','🎤 Recherche vocale active',null); if(typeof window.updateCartOnly==='function') window.updateCartOnly(); showVoiceModeIndicator(); }else if(window.posStep===2){ if(typeof window.posFinalizeSale==='function') window.posFinalizeSale(); }else if(window.posStep===1&&window.posCart&&window.posCart.length>0){ if(typeof window.posGoToStep2==='function') window.posGoToStep2(); } break;
        case'finalize': if(window.posStep===2&&typeof window.posFinalizeSale==='function') window.posFinalizeSale(); break;
        case'clear': if(typeof window.posResetCart==='function'){ window.posResetCart(); showVoiceResult('🗑️ Panier vidé'); if(typeof window.renderPOS==='function') window.renderPOS(); } break;
        case'cancel': if(voiceMode!=='search'){ setVoiceMode('search','🎤 Recherche vocale active',null); showVoiceResult('↩️ Recherche'); if(typeof window.renderPOS==='function') window.renderPOS(); } break;
        default: break;
    }
}

// ==================== MODE VOCAL ====================
function setVoiceMode(m,msg,pid){ voiceMode=m; if(msg) voiceModeMessage=msg; if(pid!==undefined) lastAddedProductId=pid; showVoiceModeIndicator(); }

// ==================== TOGGLE MICRO ====================
function posToggleVoiceSearch(){ var s=checkVoiceSupport(); if(!s.supported){ alert('⚠️ '+s.reason); return; } if(!navigator.onLine){ alert('⚠️ Connexion internet requise.'); return; } var mb=document.getElementById('posMicBtn'); if(isRecording){ posStopVoiceSearch(); return; } requestMicrophonePermission().then(function(p){ if(!p){ alert('❌ Micro refusé.'); return; } posStartVoiceRecording(); }); }

function posStartVoiceRecording(){
    var mb=document.getElementById('posMicBtn'); if(voiceRecognition){ try{ voiceRecognition.abort(); }catch(e){} voiceRecognition=null; }
    var SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR){ alert('❌ Reconnaissance vocale non disponible.'); return; }
    
    // ✅ OPTIMISÉ : continuous=false, maxAlternatives=1
    voiceRecognition=new SR(); voiceRecognition.lang='fr-FR'; voiceRecognition.continuous=false; voiceRecognition.interimResults=true; voiceRecognition.maxAlternatives=1;
    
    if(mb){ mb.classList.add('recording'); mb.innerHTML='<i class="fas fa-circle" style="color:#ef4444;animation:pulse 0.5s ease-in-out infinite;"></i>'; mb.style.background='#fee2e2'; mb.style.borderColor='#ef4444'; mb.style.boxShadow='0 0 0 4px rgba(239,68,68,0.3)'; mb.style.transform='scale(0.95)'; mb.style.border='3px solid #ef4444'; }
    var style=document.getElementById('voiceStyle'); if(!style){ style=document.createElement('style'); style.id='voiceStyle'; document.head.appendChild(style); } style.textContent='@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.2;transform:scale(1.3)}}.recording .fa-circle{animation:pulse 0.5s ease-in-out infinite !important}';
    
    var ft='',li='',proc=false,vdt=null;
    
    voiceRecognition.onresult=function(e){
        var it='',ftt=''; for(var i=e.resultIndex;i<e.results.length;i++){ var t=e.results[i][0].transcript; if(e.results[i].isFinal) ftt+=t; else it+=t; }
        var cp=document.getElementById('pageTitle')?.textContent||'';
        if(cp==='Crédits'){ var vd=document.getElementById('creditsVoiceDisplay'); if(vd){ if(ftt){ vd.value=ftt; clearTimeout(vdt); vdt=setTimeout(function(){ if(!proc){ proc=true; var cmd=parseVoiceCommand(ftt); if(cmd.type!=='ignore') handleVoiceCommand(cmd); proc=false; } },150); }else if(it){ vd.value=it+' ✍️'; } } }
        else{ var si=document.getElementById('posSearchInput'); if(si){ if(ftt){ si.value=ftt; clearTimeout(vdt); vdt=setTimeout(function(){ if(!proc){ proc=true; var cmd=parseVoiceCommand(ftt); if(cmd.type!=='ignore') handleVoiceCommand(cmd); proc=false; } },150); }else if(it&&it!==li){ si.value=it+' ✍️'; li=it; } } }
    };
    
    // ✅ Redémarrage optimisé
    voiceRecognition.onend=function(){ if(isRecording){ setTimeout(function(){ try{ voiceRecognition.start(); }catch(e){ posStopVoiceSearch(); } },100); } };
    voiceRecognition.onerror=function(e){ if(e.error==='aborted'||e.error==='no-speech') return; if(e.error==='network') showVoiceResult('❌ Erreur réseau'); posStopVoiceSearch(); };
    
    try{ voiceRecognition.start(); isRecording=true; showVoiceModeIndicator(); showVoiceResult('🎤 Écoute...'); }catch(e){ isRecording=false; if(mb){ mb.classList.remove('recording'); mb.innerHTML='<i class="fas fa-microphone"></i>'; mb.style.background='#dcfce7'; mb.style.borderColor='#16a34a'; mb.style.boxShadow='none'; mb.style.transform='scale(1)'; mb.style.border='3px solid #16a34a'; } }
}

function posStopVoiceSearch(){
    if(voiceRecognition){ try{ voiceRecognition.abort(); }catch(e){} voiceRecognition=null; } isRecording=false;
    var mb=document.getElementById('posMicBtn'),si=document.getElementById('posSearchInput');
    if(mb){ mb.classList.remove('recording'); mb.innerHTML='<i class="fas fa-microphone"></i>'; mb.style.background='#dcfce7'; mb.style.borderColor='#16a34a'; mb.style.boxShadow='none'; mb.style.transform='scale(1)'; mb.style.border='3px solid #16a34a'; }
    if(si){ si.placeholder='🔍 Rechercher...'; si.style.background='#fff'; si.style.borderColor='#e2e8f0'; si.style.boxShadow='none'; si.style.border='2px solid #e2e8f0'; }
    var se=document.getElementById('voiceStyle'); if(se) se.remove(); var ind=document.getElementById('voiceModeIndicator'); if(ind) ind.remove();
    showVoiceResult('🎤 Micro désactivé');
}

// ==================== NETTOYAGE CACHE PÉRIODIQUE ====================
setInterval(function(){ var now=Date.now(); for(var key in searchCache){ if(now-searchCache[key].time>30000){ delete searchCache[key]; } } },120000);

// ==================== RECONSTRUCTION INDEX APRÈS CHARGEMENT ====================
var originalLoadPosPage = window.loadPosPage;
if (typeof originalLoadPosPage === 'function') {
    window.loadPosPage = async function(c) {
        await originalLoadPosPage(c);
        setTimeout(function() { invalidateClientIndex(); buildClientSearchIndex(); }, 500);
    };
}

// ==================== EXPORTS ====================
window.posToggleVoiceSearch=posToggleVoiceSearch; window.showVoiceResult=showVoiceResult; window.setVoiceMode=setVoiceMode;
window.showVoiceModeIndicator=showVoiceModeIndicator; window.activateCreditSelection=activateCreditSelection;
window.selectCreditLine=selectCreditLine; window.markCreditForPayment=markCreditForPayment;
window.setCreditPaymentAmount=setCreditPaymentAmount; window.validateCreditPayment=validateCreditPayment;
window.closeCreditSelection=closeCreditSelection; window.parseVoiceCommand=parseVoiceCommand;
window.handleVoiceCommand=handleVoiceCommand; window.invalidateClientIndex=invalidateClientIndex;
window.buildClientSearchIndex=buildClientSearchIndex; window.cachedClientSearch=cachedClientSearch;
window.onProductAdded=function(pid){ lastAddedProductId=pid; setVoiceMode('quantity','🎤 Dites un nombre, "passe" ou "valide"',pid); showVoiceModeIndicator(); };

console.log('🎤 Mixmax Minimarket - Module vocal v6 OPTIMISÉ (index+cache+rapide)');
