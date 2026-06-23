// ==================== POS-AUDIO.JS - RECONNAISSANCE VOCALE ====================
var voiceRecognition = null;
var isRecording = false;
var voiceTimeout = null;
var searchTimeout = null;

var voiceMode = 'search';
var lastAddedProductId = null;
var voiceModeMessage = '🎤 Recherche vocale active';
var lastVoiceCommandTime = 0;

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

window.creditSelectionMode = false;
window.creditSelectedIndex = -1;
window.creditPaymentAmount = 0;
window.creditPaymentStep = 'idle';

function isIOSStandalone() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream &&
        (window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches);
}

function checkVoiceSupport() {
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS && isIOSStandalone()) return { supported: false, reason: 'Ouvrez dans Safari pour le micro' };
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return { supported: false, reason: 'Navigateur non supporté' };
    return { supported: true };
}

async function requestMicrophonePermission() {
    try { if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false; const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach(track => track.stop()); return true; }
    catch (e) { console.error('Permission microphone refusée:', e); return false; }
}

function showSafariBanner() {
    if (!isIOSStandalone()) return; if (document.getElementById('iosPwaBanner')) return;
    var container = document.getElementById('dynamicContent'); if (!container) return;
    var banner = document.createElement('div'); banner.id = 'iosPwaBanner';
    banner.style.cssText = 'background:#fef3c7; border:2px solid #f59e0b; border-radius:12px; padding:10px 14px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;';
    banner.innerHTML = '<div style="display:flex;align-items:center;gap:8px;"><i class="fas fa-exclamation-triangle" style="color:#d97706;font-size:1.1rem;"></i><span style="font-size:0.8rem;color:#92400e;"><strong>📱 Microphone</strong><br><span style="font-size:0.7rem;">Ouvrez dans Safari pour le micro.</span></span></div><button onclick="window.open(window.location.href.split(\'?\')[0],\'_blank\')" style="background:#f59e0b;border:none;padding:6px 14px;border-radius:6px;color:#fff;font-weight:600;cursor:pointer;font-size:0.75rem;white-space:nowrap;">🌐 Ouvrir</button>';
    container.insertBefore(banner, container.firstChild);
}

function showVoiceModeIndicator() {
    var indicator = document.getElementById('voiceModeIndicator');
    if (!indicator) { var container = document.querySelector('.pos-products-panel'); if (!container) return; indicator = document.createElement('div'); indicator.id = 'voiceModeIndicator'; indicator.style.cssText = 'background:#f0fdf4;border:2px solid #16a34a;border-radius:8px;padding:6px 12px;margin-bottom:8px;font-size:0.8rem;display:flex;align-items:center;gap:8px;color:#14532d;'; container.insertBefore(indicator, container.firstChild); }
    var icon = voiceMode === 'search' ? 'fa-microphone' : (voiceMode === 'quantity' ? 'fa-hashtag' : (voiceMode === 'client' ? 'fa-user' : 'fa-money-bill-wave'));
    var color = voiceMode === 'search' ? '#16a34a' : (voiceMode === 'quantity' ? '#f59e0b' : (voiceMode === 'client' ? '#4f46e5' : '#dc2626'));
    indicator.innerHTML = '<i class="fas ' + icon + '" style="color:' + color + ';"></i> ' + (voiceModeMessage || '🎤 Recherche vocale active') + ' <span style="font-size:0.6rem;color:#94a3b8;margin-left:auto;">' + voiceMode + '</span>';
    indicator.style.borderColor = color; indicator.style.background = voiceMode === 'search' ? '#f0fdf4' : '#fefce8';
}

function showVoiceResult(message) {
    var resultDiv = document.getElementById('voiceResultDisplay');
    if (!resultDiv) { resultDiv = document.createElement('div'); resultDiv.id = 'voiceResultDisplay'; resultDiv.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#2E7D32;color:#fff;padding:12px 24px;border-radius:12px;font-weight:600;font-size:1rem;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);transition:all 0.3s ease;display:none;max-width:90%;text-align:center;'; document.body.appendChild(resultDiv); }
    var isError = message.indexOf('⚠️') !== -1 || message.indexOf('❌') !== -1;
    resultDiv.style.background = isError ? '#ef4444' : '#2E7D32'; resultDiv.textContent = message; resultDiv.style.display = 'block';
    clearTimeout(window._voiceResultTimeout); window._voiceResultTimeout = setTimeout(function() { resultDiv.style.display = 'none'; }, 2000);
}

function activateCreditSelection() { window.creditSelectionMode = true; window.creditSelectedIndex = -1; window.creditPaymentStep = 'idle'; if (typeof window.renderCreditsTable === 'function') window.renderCreditsTable(); showVoiceResult('📋 Mode sélection activé. Dites le numéro de la ligne'); }

function selectCreditLine(lineNumber) {
    var data = window.filteredCredits || window.allCreditsData || []; var index = lineNumber - 1;
    if (index < 0 || index >= data.length) { showVoiceResult('❌ Ligne ' + lineNumber + ' inexistante. ' + data.length + ' ligne(s) disponible(s)'); return; }
    if (!window.creditSelectionMode) { showVoiceResult('⚠️ Activez d\'abord le mode sélection avec "sélectionner"'); return; }
    window.creditSelectedIndex = index; window.creditPaymentStep = 'selection'; window.creditPaymentAmount = 0;
    if (typeof window.renderCreditsTable === 'function') window.renderCreditsTable();
    var credit = data[index]; var reste = credit.remainingAmount || credit.total || 0;
    showVoiceResult('✅ Ligne ' + lineNumber + ' sélectionnée - ' + (credit.clientName || credit.table || '') + ' - Restant: ' + reste.toFixed(2) + ' MAD');
}

function markCreditForPayment() {
    if (window.creditSelectedIndex < 0) { showVoiceResult('⚠️ Aucune ligne sélectionnée'); return; }
    var data = window.filteredCredits || window.allCreditsData || []; var credit = data[window.creditSelectedIndex];
    if (!credit) { showVoiceResult('❌ Crédit introuvable'); return; } if (credit.paid) { showVoiceResult('⚠️ Ce crédit est déjà payé'); return; }
    window.creditPaymentStep = 'payment'; var reste = credit.remainingAmount || credit.total || 0;
    showVoiceResult('💳 Paiement - Restant: ' + reste.toFixed(2) + ' MAD. Dites le montant');
    var zone = document.getElementById('creditPaymentZone'); var info = document.getElementById('creditPaymentInfo');
    if (zone) { zone.style.display = 'block'; if (info) info.textContent = 'Client: ' + (credit.clientName || credit.table || 'Inconnu') + ' | Restant: ' + reste.toFixed(2) + ' MAD'; var input = document.getElementById('creditPaymentAmountInput'); if (input) { input.value = ''; input.focus(); input.select(); } }
}

function setCreditPaymentAmount(amount) {
    if (window.creditSelectedIndex < 0) { showVoiceResult('⚠️ Aucun crédit sélectionné'); return; }
    if (amount <= 0) { showVoiceResult('❌ Montant invalide'); return; }
    window.creditPaymentAmount = amount; window.creditPaymentStep = 'amount';
    var input = document.getElementById('creditPaymentAmountInput'); if (input) input.value = amount;
    showVoiceResult('💰 Montant: ' + amount.toFixed(2) + ' MAD. Dites "valide" pour confirmer');
}

function validateCreditPayment() {
    if (window.creditSelectedIndex < 0) { showVoiceResult('⚠️ Aucun crédit sélectionné'); return; }
    var input = document.getElementById('creditPaymentAmountInput'); var amount = parseFloat(input ? input.value : window.creditPaymentAmount);
    if (isNaN(amount) || amount <= 0) { showVoiceResult('❌ Montant invalide'); return; }
    var data = window.filteredCredits || window.allCreditsData || []; var credit = data[window.creditSelectedIndex];
    if (!credit) { showVoiceResult('❌ Crédit introuvable'); return; }
    var reste = credit.remainingAmount || credit.total || 0;
    if (amount > reste) { showVoiceResult('⚠️ Montant supérieur au reste dû (' + reste.toFixed(2) + ' MAD)'); return; }
    var newReste = reste - amount; var paid = newReste <= 0.01;
    var updateData = { paid: paid, remainingAmount: Math.max(0, newReste), amountGiven: (credit.amountGiven || 0) + amount, paidAt: firebase.firestore.FieldValue.serverTimestamp() };
    CacheDB.write('credits', credit.id, updateData, 'update').then(function() {
        showVoiceResult(paid ? '✅ Crédit soldé !' : '✅ Paiement enregistré. Reste: ' + newReste.toFixed(2) + ' MAD');
        window.creditPaymentStep = 'idle'; window.creditSelectedIndex = -1; window.creditPaymentAmount = 0; window.creditSelectionMode = false;
        var zone = document.getElementById('creditPaymentZone'); if (zone) zone.style.display = 'none';
        if (typeof window.loadCredits === 'function') window.loadCredits(); CacheDB.sync();
    }).catch(function(e) { showVoiceResult('❌ Erreur: ' + e.message); });
}

function closeCreditSelection() {
    window.creditSelectionMode = false; window.creditSelectedIndex = -1; window.creditPaymentAmount = 0; window.creditPaymentStep = 'idle';
    var zone = document.getElementById('creditPaymentZone'); if (zone) zone.style.display = 'none';
    if (typeof window.closeCreditSelection === 'function') window.closeCreditSelection();
    else { if (typeof window.applyCreditsFilters === 'function') { window.creditsSearch = ''; window.currentPages.credits = 1; window.filteredCredits = null; window.applyCreditsFilters(); } }
    showVoiceResult('📋 Liste complète des crédits');
}

function detectPaymentMode(text) {
    text = text.toLowerCase().trim();
    for (var mode in paymentKeywords) { for (var i = 0; i < paymentKeywords[mode].length; i++) { if (text.indexOf(paymentKeywords[mode][i]) !== -1) return mode; } }
    if (text === 'espece' || text === 'especes' || text === 'cash') return 'espece';
    if (text === 'credit' || text === 'credit') return 'credit';
    if (text === 'partiel' || text === 'partial') return 'partiel'; return null;
}

function isModalOpen() { var modal = document.getElementById('modalOverlay'); return modal && !modal.classList.contains('hidden'); }

function parseVoiceCommand(transcript) {
    transcript = transcript.toLowerCase().trim(); var now = Date.now();
    if (now - lastVoiceCommandTime < 500) return { type: 'ignore' }; lastVoiceCommandTime = now;
    var currentPage = document.getElementById('pageTitle')?.textContent || '';
    if (currentPage === 'Ventes') {
        var clientMatch = transcript.match(/client\s+([a-z]+(?:\s+[a-z]+)*)/i), searchMatch = transcript.match(/rechercher\s+([a-z]+(?:\s+[a-z]+)*)/i), directMatch = transcript.match(/^([a-z]+(?:\s+[a-z]+)*)$/), clientName = null;
        if (clientMatch) clientName = clientMatch[1]; else if (searchMatch) clientName = searchMatch[1];
        else if (directMatch && directMatch[1].length > 2) { var name = directMatch[1].toLowerCase(); var found = window.posAllClients && window.posAllClients.some(function(c) { var fullName = (c.nom + ' ' + c.prenom).toLowerCase(), desc = (c.description || '').toLowerCase(); return fullName.indexOf(name) !== -1 || c.nom.toLowerCase().indexOf(name) !== -1 || c.prenom.toLowerCase().indexOf(name) !== -1 || (desc && desc.indexOf(name) !== -1); }); if (found) clientName = directMatch[1]; }
        if (!clientName) { var q = transcript.toLowerCase().trim(); if (window.posAllClients) { for (var j = 0; j < window.posAllClients.length; j++) { var c = window.posAllClients[j], nom = (c.nom || '').toLowerCase(), prenom = (c.prenom || '').toLowerCase(), desc = (c.description || '').toLowerCase(), fullName = nom + ' ' + prenom; if (q && (fullName.indexOf(q) !== -1 || nom.indexOf(q) !== -1 || prenom.indexOf(q) !== -1 || (desc && desc.indexOf(q) !== -1))) { clientName = c.nom + ' ' + c.prenom; break; } } } }
        if (clientName) return { type: 'search_client_in_ventes', clientName: clientName };
    }
    if (currentPage === 'Crédits') {
        var clientMatch2 = transcript.match(/client\s+([a-z]+(?:\s+[a-z]+)*)/i), searchMatch2 = transcript.match(/rechercher\s+([a-z]+(?:\s+[a-z]+)*)/i), directMatch2 = transcript.match(/^([a-z]+(?:\s+[a-z]+)*)$/), clientName2 = null;
        if (clientMatch2) clientName2 = clientMatch2[1]; else if (searchMatch2) clientName2 = searchMatch2[1];
        else if (directMatch2 && directMatch2[1].length > 2) { var name2 = directMatch2[1].toLowerCase(); var found2 = window.posAllClients && window.posAllClients.some(function(c) { var fullName = (c.nom + ' ' + c.prenom).toLowerCase(), desc = (c.description || '').toLowerCase(); return fullName.indexOf(name2) !== -1 || c.nom.toLowerCase().indexOf(name2) !== -1 || c.prenom.toLowerCase().indexOf(name2) !== -1 || (desc && desc.indexOf(name2) !== -1); }); if (found2) clientName2 = directMatch2[1]; }
        if (!clientName2) { var q2 = transcript.toLowerCase().trim(); if (window.posAllClients) { for (var j2 = 0; j2 < window.posAllClients.length; j2++) { var c2 = window.posAllClients[j2], nom2 = (c2.nom || '').toLowerCase(), prenom2 = (c2.prenom || '').toLowerCase(), desc2 = (c2.description || '').toLowerCase(), fullName2 = nom2 + ' ' + prenom2; if (q2 && (fullName2.indexOf(q2) !== -1 || nom2.indexOf(q2) !== -1 || prenom2.indexOf(q2) !== -1 || (desc2 && desc2.indexOf(q2) !== -1))) { clientName2 = c2.nom + ' ' + c2.prenom; break; } } } }
        if (clientName2) return { type: 'search_client_in_credits', clientName: clientName2 };
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
    if (transcript.includes('point de vente') || transcript.includes('point vente') || transcript.includes('pos') || transcript.includes('caisse')) { if (currentPage === 'POS') { showVoiceResult('✅ Déjà sur le POS'); return { type: 'ignore' }; } if (window.posCart && window.posCart.length > 0 && window.posStep === 1) { if (!confirm('⚠️ Panier non vide. Continuer ?')) { if (typeof window.posResetCart === 'function') window.posResetCart(); } } showVoiceResult('📋 Retour au POS...'); setTimeout(function() { if (typeof navigateTo === 'function') navigateTo('pos'); }, 300); return { type: 'ignore' }; }
    if (transcript.includes('crédits') || transcript.includes('credit') || transcript.includes('impayés')) return { type: 'navigate', page: 'credits' };
    if (transcript.includes('ventes') || transcript.includes('vente')) return { type: 'navigate', page: 'ventes' };
    if (transcript.includes('dashboard') || transcript.includes('accueil') || transcript.includes('home')) return { type: 'navigate', page: 'dashboard' };
    if (transcript.includes('produits') || transcript.includes('catalogue')) return { type: 'navigate', page: 'products' };
    if (transcript.includes('clients') || transcript.includes('clientèle')) return { type: 'navigate', page: 'clients' };
    if (transcript.includes('commandes')) return { type: 'navigate', page: 'commandes' };
    if (transcript.includes('catégories')) return { type: 'navigate', page: 'categories' };
    if (window.posStep === 2) { var paymentMode = detectPaymentMode(transcript); if (paymentMode) return { type: 'payment_mode', mode: paymentMode }; }
    var numberMatch = transcript.match(/\b(\d+)\b/); if (numberMatch) return { type: 'number', value: parseInt(numberMatch[1]) };
    for (var word in numberMap) { if (transcript.indexOf(word) !== -1) return { type: 'number', value: numberMap[word] }; }
    if (transcript.includes('passe') || transcript.includes('passer') || transcript.includes('suivant')) return { type: 'next' };
    if (currentPage !== 'Crédits') { if (transcript.includes('valide') || transcript.includes('valider') || transcript.includes('confirmer') || transcript.includes('ok')) return { type: 'validate' }; }
    if (transcript.includes('annule') || transcript.includes('annuler')) return { type: 'cancel' };
    if (transcript.includes('efface') || transcript.includes('vider')) return { type: 'clear' };
    if (transcript.includes('termine') || transcript.includes('terminer') || transcript.includes('fin')) return { type: 'finalize' };
    if (window.posStep === 2) { if (window.posAllClients) { for (var j = 0; j < window.posAllClients.length; j++) { var client = window.posAllClients[j], fullName = (client.nom + ' ' + client.prenom).toLowerCase(), desc = (client.description || '').toLowerCase(); if (transcript.includes(fullName) || transcript.includes(client.nom.toLowerCase()) || transcript.includes(client.prenom.toLowerCase()) || (desc && transcript.includes(desc))) return { type: 'client', client: client }; } } if (window.posProductsList) { var foundProduct2 = null, bestMatchLength2 = 0; for (var i2 = 0; i2 < window.posProductsList.length; i2++) { var prod2 = window.posProductsList[i2], prodName2 = prod2.nom.toLowerCase(); if (transcript.includes(prodName2) && prodName2.length > bestMatchLength2) { foundProduct2 = prod2; bestMatchLength2 = prodName2.length; } } if (foundProduct2) return { type: 'product', product: foundProduct2 }; } }
    else { if (window.posProductsList) { var foundProduct = null, bestMatchLength = 0; for (var i = 0; i < window.posProductsList.length; i++) { var prod = window.posProductsList[i], prodName = prod.nom.toLowerCase(); if (transcript.includes(prodName) && prodName.length > bestMatchLength) { foundProduct = prod; bestMatchLength = prodName.length; } } if (foundProduct) return { type: 'product', product: foundProduct }; } if (window.posAllClients) { for (var j = 0; j < window.posAllClients.length; j++) { var client = window.posAllClients[j], fullName = (client.nom + ' ' + client.prenom).toLowerCase(), desc = (client.description || '').toLowerCase(); if (transcript.includes(fullName) || transcript.includes(client.nom.toLowerCase()) || transcript.includes(client.prenom.toLowerCase()) || (desc && transcript.includes(desc))) return { type: 'client', client: client }; } } }
    var amountMatch = transcript.match(/\d+[.,]?\d*/); if (amountMatch) { var amount = parseFloat(amountMatch[0].replace(',', '.')); if (amount > 0) return { type: 'amount', value: amount }; }
    return { type: 'unknown', text: transcript };
}

// ==================== RECHERCHE CLIENT DANS VENTES ====================
function searchClientInVentes(clientName) {
    if (!clientName) return;
    var searchInput = document.getElementById('ventesSearchInput');
    if (searchInput) {
        searchInput.value = clientName;
        if (typeof window.ventesSearch !== 'undefined') window.ventesSearch = clientName;
        if (typeof window.currentPages !== 'undefined') window.currentPages.ventes = 1;
        if (typeof window.applyVentesFilters === 'function') window.applyVentesFilters();
        showVoiceResult('🔍 Client: ' + clientName);
        // Forcer le nom réel après 500ms
        setTimeout(function() { if (searchInput) { searchInput.value = clientName; if (typeof window.ventesSearch !== 'undefined') window.ventesSearch = clientName; } }, 500);
    } else {
        if (typeof navigateTo === 'function') {
            navigateTo('ventes');
            setTimeout(function() {
                var si = document.getElementById('ventesSearchInput');
                if (si) { si.value = clientName; if (typeof window.ventesSearch !== 'undefined') window.ventesSearch = clientName; if (typeof window.currentPages !== 'undefined') window.currentPages.ventes = 1; if (typeof window.applyVentesFilters === 'function') window.applyVentesFilters(); showVoiceResult('🔍 Client: ' + clientName); }
            }, 500);
        }
    }
}

// ==================== RECHERCHE CLIENT DANS CRÉDITS ====================
function searchClientInCredits(clientName) {
    if (!clientName) return;
    var searchInput = document.getElementById('creditsSearchInput');
    if (searchInput) {
        searchInput.value = clientName;
        if (typeof window.creditsSearch !== 'undefined') window.creditsSearch = clientName;
        if (typeof window.currentPages !== 'undefined') window.currentPages.credits = 1;
        if (typeof window.applyCreditsFilters === 'function') window.applyCreditsFilters();
        showVoiceResult('🔍 Client: ' + clientName);
        // ✅ Forcer le nom réel après 500ms pour contrer la reconnaissance continue
        setTimeout(function() { if (searchInput) { searchInput.value = clientName; if (typeof window.creditsSearch !== 'undefined') window.creditsSearch = clientName; } }, 500);
    } else {
        if (typeof navigateTo === 'function') {
            navigateTo('credits');
            setTimeout(function() {
                var si = document.getElementById('creditsSearchInput');
                if (si) { si.value = clientName; if (typeof window.creditsSearch !== 'undefined') window.creditsSearch = clientName; if (typeof window.currentPages !== 'undefined') window.currentPages.credits = 1; if (typeof window.applyCreditsFilters === 'function') window.applyCreditsFilters(); showVoiceResult('🔍 Client: ' + clientName); }
            }, 500);
        }
    }
}

// ==================== HANDLER DES COMMANDES VOCALES ====================
function handleVoiceCommand(command) {
    console.log('🎤 Commande vocale:', command); var currentPage = document.getElementById('pageTitle')?.textContent || '';
    switch (command.type) {
        case 'search_client_in_ventes': searchClientInVentes(command.clientName); break;
        case 'search_client_in_credits': searchClientInCredits(command.clientName); break;
        case 'activate_credit_selection': activateCreditSelection(); break;
        case 'select_credit_line': selectCreditLine(command.lineNumber); break;
        case 'mark_credit_paid': markCreditForPayment(); break;
        case 'set_credit_amount': setCreditPaymentAmount(command.amount); break;
        case 'validate_credit_payment': validateCreditPayment(); break;
        case 'close_credit_list': closeCreditSelection(); break;
        case 'navigate':
            var page = command.page, pageTitles = { 'credits': 'Crédits', 'ventes': 'Ventes', 'dashboard': 'Dashboard', 'products': 'Produits', 'clients': 'Clients', 'commandes': 'Commandes en ligne', 'categories': 'Catégories', 'pos': 'POS' };
            if (currentPage === pageTitles[page]) { showVoiceResult('✅ Déjà sur ' + pageTitles[page]); return; }
            if (typeof window.posCart !== 'undefined' && window.posCart.length > 0 && window.posStep === 1 && page !== 'pos') { if (!confirm('⚠️ Panier non vide. Continuer ?')) { if (typeof window.posResetCart === 'function') window.posResetCart(); } }
            showVoiceResult('📋 Navigation vers ' + pageTitles[page] + '...'); setTimeout(function() { if (typeof navigateTo === 'function') navigateTo(page); }, 500); break;
        case 'payment_mode':
            var mode = command.mode;
            if ((mode === 'credit' || mode === 'partiel') && (!window.posCurrentClient || !window.posCurrentClient.id)) { alert('Client requis pour ' + mode); showVoiceResult('⚠️ Client requis'); return; }
            if (typeof window.posSetPaymentMethod === 'function') { window.posSetPaymentMethod(mode); showVoiceResult('✅ Paiement en ' + mode); if (typeof window.renderPOS === 'function') window.renderPOS(); if (mode === 'espece') { setTimeout(function() { var ai = document.getElementById('posAmountGiven'); if (ai) ai.focus(); }, 300); } } break;
        case 'product':
            var p = command.product;
            if (typeof window.posProductsList !== 'undefined' && window.posProductsList.length) { var prod = window.posProductsList.find(function(x) { return x.id === p.id; }); if (!prod) break; if (prod.stock !== undefined && prod.stock <= 0) { showVoiceResult('⚠️ Rupture: ' + prod.nom); return; } if (typeof window.posAddToCartOrOpenOptions === 'function') window.posAddToCartOrOpenOptions(prod.id); } break;
        case 'number':
            if (voiceMode === 'quantity' && lastAddedProductId) { var qty = command.value; if (qty < 1) qty = 1; if (typeof window.posProductsList !== 'undefined') { var item = window.posCart.find(function(x) { return x.id === lastAddedProductId; }); if (item) { var prod2 = window.posProductsList.find(function(p2) { return p2.id === lastAddedProductId; }); if (prod2 && prod2.stock !== undefined && qty > prod2.stock) { showVoiceResult('⚠️ Stock max: ' + prod2.stock); return; } item.quantite = qty; lastAddedProductId = null; setVoiceMode('search', '🎤 Recherche vocale active', null); showVoiceResult('✅ Quantité: ' + qty); if (typeof window.updateCartOnly === 'function') window.updateCartOnly(); showVoiceModeIndicator(); } } }
            else if (voiceMode === 'payment' || window.posStep === 2) { if (typeof window.posAmountGiven !== 'undefined') { window.posAmountGiven = command.value; var changeEl = document.getElementById('posChangeDisplay'); if (changeEl) { var st = typeof window.posCalculateTotal === 'function' ? window.posCalculateTotal() : 0, t = st - (window.posDiscountMAD || 0), c = window.posAmountGiven - t; changeEl.innerHTML = c >= 0 ? '<div class="pos-change-positive"><span>Rendu</span><span>' + c.toFixed(2) + ' MAD</span></div>' : '<div class="pos-change-negative"><span>Manquant</span><span>' + Math.abs(c).toFixed(2) + ' MAD</span></div>'; } var ai = document.getElementById('posAmountGiven'); if (ai) ai.value = window.posAmountGiven; showVoiceResult('💰 Montant: ' + window.posAmountGiven.toFixed(2) + ' MAD'); } } break;
        case 'client':
            window.posCurrentClient = { id: command.client.id, name: command.client.nom + ' ' + command.client.prenom }; window.posCurrentTable = '';
            var ci = document.getElementById('posClientSearchInput'); if (ci) ci.value = window.posCurrentClient.name;
            if (typeof window.updatePaymentButtons === 'function') window.updatePaymentButtons();
            setVoiceMode('payment', '🎤 Dites le montant, "valide" ou mode paiement', null); showVoiceResult('👤 Client: ' + window.posCurrentClient.name);
            if (typeof window.renderPOS === 'function') window.renderPOS(); break;
        case 'amount':
            if (window.posStep === 2) { if (typeof window.posAmountGiven !== 'undefined') { window.posAmountGiven = command.value; var changeEl2 = document.getElementById('posChangeDisplay'); if (changeEl2) { var st2 = typeof window.posCalculateTotal === 'function' ? window.posCalculateTotal() : 0, t2 = st2 - (window.posDiscountMAD || 0), c2 = window.posAmountGiven - t2; changeEl2.innerHTML = c2 >= 0 ? '<div class="pos-change-positive"><span>Rendu</span><span>' + c2.toFixed(2) + ' MAD</span></div>' : '<div class="pos-change-negative"><span>Manquant</span><span>' + Math.abs(c2).toFixed(2) + ' MAD</span></div>'; } var ai2 = document.getElementById('posAmountGiven'); if (ai2) ai2.value = window.posAmountGiven; showVoiceResult('💰 Montant: ' + window.posAmountGiven.toFixed(2) + ' MAD'); } } break;
        case 'next': if (isModalOpen()) break;
            if (voiceMode === 'quantity') { setVoiceMode('search', '🎤 Recherche vocale active', null); if (typeof window.updateCartOnly === 'function') window.updateCartOnly(); showVoiceModeIndicator(); }
            else if (window.posStep === 2) { if (typeof window.posFinalizeSale === 'function') window.posFinalizeSale(); }
            else if (window.posCart && window.posCart.length > 0 && window.posStep === 1) { if (typeof window.posGoToStep2 === 'function') window.posGoToStep2(); } break;
        case 'validate': if (isModalOpen()) break;
            if (voiceMode === 'quantity') { setVoiceMode('search', '🎤 Recherche vocale active', null); if (typeof window.updateCartOnly === 'function') window.updateCartOnly(); showVoiceModeIndicator(); }
            else if (window.posStep === 2) { if (typeof window.posFinalizeSale === 'function') window.posFinalizeSale(); }
            else if (window.posStep === 1 && window.posCart && window.posCart.length > 0) { if (typeof window.posGoToStep2 === 'function') window.posGoToStep2(); } break;
        case 'finalize': if (window.posStep === 2 && typeof window.posFinalizeSale === 'function') window.posFinalizeSale(); break;
        case 'clear': if (typeof window.posResetCart === 'function') { window.posResetCart(); showVoiceResult('🗑️ Panier vidé'); if (typeof window.renderPOS === 'function') window.renderPOS(); } break;
        case 'cancel': if (voiceMode !== 'search') { setVoiceMode('search', '🎤 Recherche vocale active', null); showVoiceResult('↩️ Retour à la recherche'); if (typeof window.renderPOS === 'function') window.renderPOS(); } break;
        default:
            if (command.text) { var q = command.text.toLowerCase().trim(), found = false;
                if (window.posStep === 2) { if (window.posAllClients) { for (var j = 0; j < window.posAllClients.length; j++) { var c = window.posAllClients[j], nom = (c.nom || '').toLowerCase(), prenom = (c.prenom || '').toLowerCase(), desc = (c.description || '').toLowerCase(), fullName = nom + ' ' + prenom; if (q && (fullName.indexOf(q) !== -1 || nom.indexOf(q) !== -1 || prenom.indexOf(q) !== -1 || desc.indexOf(q) !== -1)) { window.posCurrentClient = { id: c.id, name: c.nom + ' ' + c.prenom }; window.posCurrentTable = ''; var ci2 = document.getElementById('posClientSearchInput'); if (ci2) ci2.value = window.posCurrentClient.name; if (typeof window.updatePaymentButtons === 'function') window.updatePaymentButtons(); if (typeof window.renderPOS === 'function') window.renderPOS(); showVoiceResult('👤 Client: ' + window.posCurrentClient.name); found = true; break; } } } if (!found && typeof window.posSearchProducts === 'function') window.posSearchProducts(q); }
                else { if (typeof window.posSearchProducts === 'function') window.posSearchProducts(q); if (window.posAllClients) { for (var j = 0; j < window.posAllClients.length; j++) { var c = window.posAllClients[j], nom = (c.nom || '').toLowerCase(), prenom = (c.prenom || '').toLowerCase(), desc = (c.description || '').toLowerCase(), fullName = nom + ' ' + prenom; if (q && (fullName.indexOf(q) !== -1 || nom.indexOf(q) !== -1 || prenom.indexOf(q) !== -1 || desc.indexOf(q) !== -1)) { window.posCurrentClient = { id: c.id, name: c.nom + ' ' + c.prenom }; window.posCurrentTable = ''; var ci3 = document.getElementById('posClientSearchInput'); if (ci3) ci3.value = window.posCurrentClient.name; if (typeof window.updatePaymentButtons === 'function') window.updatePaymentButtons(); if (typeof window.renderPOS === 'function') window.renderPOS(); showVoiceResult('👤 Client: ' + window.posCurrentClient.name); break; } } } } } break;
    }
}

function setVoiceMode(newMode, message, productId) { voiceMode = newMode; if (message) voiceModeMessage = message; if (productId !== undefined) lastAddedProductId = productId; showVoiceModeIndicator(); }

function posToggleVoiceSearch() {
    var support = checkVoiceSupport(); if (!support.supported) { alert('⚠️ ' + support.reason); return; }
    if (!navigator.onLine) { alert('⚠️ Connexion internet requise.'); return; }
    var micBtn = document.getElementById('posMicBtn'); if (isRecording) { posStopVoiceSearch(); return; }
    requestMicrophonePermission().then(hasPermission => { if (!hasPermission) { alert('❌ Micro refusé.'); return; } posStartVoiceRecording(); });
}

function posStartVoiceRecording() {
    var micBtn = document.getElementById('posMicBtn'), searchInput = document.getElementById('posSearchInput');
    if (voiceRecognition) { try { voiceRecognition.abort(); } catch (e) {} voiceRecognition = null; }
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SpeechRecognition) { alert('❌ Reconnaissance vocale non disponible.'); return; }
    voiceRecognition = new SpeechRecognition(); voiceRecognition.lang = 'fr-FR'; voiceRecognition.continuous = true; voiceRecognition.interimResults = true; voiceRecognition.maxAlternatives = 5;
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) { voiceRecognition.continuous = true; voiceRecognition.interimResults = true; }
    if (micBtn) { micBtn.classList.add('recording'); micBtn.innerHTML = '<i class="fas fa-circle" style="color:#ef4444;animation:pulse 0.5s ease-in-out infinite;"></i>'; micBtn.style.background = '#fee2e2'; micBtn.style.borderColor = '#ef4444'; micBtn.style.boxShadow = '0 0 0 4px rgba(239,68,68,0.3)'; micBtn.style.transform = 'scale(0.95)'; micBtn.style.border = '3px solid #ef4444'; }
    var style = document.getElementById('voiceStyle'); if (!style) { style = document.createElement('style'); style.id = 'voiceStyle'; document.head.appendChild(style); }
    style.textContent = '@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.2;transform:scale(1.3)}}.recording .fa-circle{animation:pulse 0.5s ease-in-out infinite !important}';
    var finalTranscript = '', lastInterim = '', processing = false;
    voiceRecognition.onresult = function(event) {
        var interimTranscript = '', finalTranscriptTemp = '';
        for (var i = event.resultIndex; i < event.results.length; i++) { var t = event.results[i][0].transcript; if (event.results[i].isFinal) finalTranscriptTemp += t; else interimTranscript += t; }
        var currentPage = document.getElementById('pageTitle')?.textContent || '', searchInputId = (currentPage === 'Crédits') ? 'creditsSearchInput' : 'posSearchInput', searchInputElem = document.getElementById(searchInputId);
        if (searchInputElem) { if (finalTranscriptTemp) { searchInputElem.value = finalTranscriptTemp; finalTranscript = finalTranscriptTemp; if (!processing) { processing = true; var command = parseVoiceCommand(finalTranscript); if (command.type !== 'ignore') handleVoiceCommand(command); processing = false; } } else if (interimTranscript && interimTranscript !== lastInterim) { searchInputElem.value = interimTranscript + ' ✍️'; lastInterim = interimTranscript; } }
    };
    voiceRecognition.onend = function() { if (isRecording) { try { voiceRecognition.start(); } catch (e) { console.error('❌ Erreur redémarrage:', e); posStopVoiceSearch(); } } };
    voiceRecognition.onerror = function(event) { console.error('🎤 Erreur:', event.error); if (event.error === 'aborted' || event.error === 'no-speech') return; posStopVoiceSearch(); };
    try { voiceRecognition.start(); isRecording = true; showVoiceModeIndicator(); } catch (e) { console.error('Erreur démarrage:', e); isRecording = false; if (micBtn) { micBtn.classList.remove('recording'); micBtn.innerHTML = '<i class="fas fa-microphone"></i>'; micBtn.style.background = '#dcfce7'; micBtn.style.borderColor = '#16a34a'; micBtn.style.boxShadow = 'none'; micBtn.style.transform = 'scale(1)'; micBtn.style.border = '3px solid #16a34a'; } }
}

function posStopVoiceSearch() {
    if (voiceRecognition) { try { voiceRecognition.abort(); } catch (e) {} voiceRecognition = null; } isRecording = false;
    var micBtn = document.getElementById('posMicBtn'), searchInput = document.getElementById('posSearchInput');
    if (micBtn) { micBtn.classList.remove('recording'); micBtn.innerHTML = '<i class="fas fa-microphone"></i>'; micBtn.style.background = '#dcfce7'; micBtn.style.borderColor = '#16a34a'; micBtn.style.boxShadow = 'none'; micBtn.style.transform = 'scale(1)'; micBtn.style.border = '3px solid #16a34a'; }
    if (searchInput) { searchInput.placeholder = '🔍 Rechercher...'; searchInput.style.background = '#fff'; searchInput.style.borderColor = '#e2e8f0'; searchInput.style.boxShadow = 'none'; searchInput.style.border = '2px solid #e2e8f0'; }
    var styleEl = document.getElementById('voiceStyle'); if (styleEl) styleEl.remove(); var indicator = document.getElementById('voiceModeIndicator'); if (indicator) indicator.remove();
}

window.posToggleVoiceSearch = posToggleVoiceSearch; window.showVoiceResult = showVoiceResult; window.setVoiceMode = setVoiceMode;
window.showVoiceModeIndicator = showVoiceModeIndicator; window.activateCreditSelection = activateCreditSelection;
window.selectCreditLine = selectCreditLine; window.markCreditForPayment = markCreditForPayment;
window.setCreditPaymentAmount = setCreditPaymentAmount; window.validateCreditPayment = validateCreditPayment;
window.closeCreditSelection = closeCreditSelection;
window.onProductAdded = function(productId) { lastAddedProductId = productId; setVoiceMode('quantity', '🎤 Dites un nombre, "passe" ou "valide"', productId); showVoiceModeIndicator(); };

console.log('🎤 Mixmax Minimarket - Module vocal chargé');
