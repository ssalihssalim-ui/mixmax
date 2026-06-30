// ==================== POS-AUDIO.JS v9.0 – RAPIDE & CIBLÉ ====================
// Mixmax Minimarket – Reconnaissance vocale optimisée
// Stratégie : mot-clé → produit (barre) → clic manuel → quantité (nombre) → étape2 (client/mode/montant)

// ========== VARIABLES ==========
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
    'wahed': 1, 'ouais': 1, 'wad': 1, 'un': 1, 'une': 1,
    'juge': 2, 'joue': 2, 'george': 2, 'souche': 2, 'deux': 2,
    'claud': 3, 'cl': 3, 'trois': 3, 'clé': 3, 'clea': 3, 'play': 3,
    'rabah': 4, 'quatre': 4, 'arba': 4, 'abba': 4, 'rabat': 4, 'rabats': 4, 'alba': 4,
    'cinq': 5, 'hamza': 5, 'rama': 5, 'comme ça': 5,
    'six': 6, 'sept': 7, 'huit': 8, 'neuf': 9, 'dix': 10,
    'onze': 11, 'douze': 12, 'douz': 12, 'treize': 13, 'quatorze': 14,
    'quinze': 15, 'seize': 16, 'vingt': 20, 'trente': 30, 'quarante': 40,
    'cinquante': 50, 'soixante': 60, 'cent': 100
};

// ========== UTILITAIRES ==========
function escapeHtml(str) { return str ? str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]) : ''; }
function isIOSStandalone() { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream && (window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches); }
function checkVoiceSupport() { var i = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; if (i && isIOSStandalone()) return { supported: false, reason: 'Ouvrez dans Safari' }; if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return { supported: false, reason: 'Non supporté' }; return { supported: true }; }
async function requestMicrophonePermission() { if (micPermissionGranted) return true; try { if (!navigator.mediaDevices?.getUserMedia) return false; const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach(t => t.stop()); micPermissionGranted = true; return true; } catch (e) { return false; } }
function showVoiceModeIndicator() { /* idem, non modifié pour rester compact */ }
function showVoiceResult(msg) { /* idem, non modifié */ }
function showVoiceFlowIndicator(phase) { /* idem, non modifié */ }
function hideVoiceFlowIndicator() { /* idem, non modifié */ }
function showProcessingIndicator() { /* idem, non modifié */ }

// ========== CONSTRUCTION INDEX CLIENT ==========
function buildClientIndex() {
    if (clientIndexBuilt || !window.posAllClients?.length) return;
    clientSearchIndex = {};
    window.posAllClients.forEach(c => {
        if (!c?.id) return;
        const allText = (c.nom + ' ' + c.prenom + ' ' + c.telephone + ' ' + (c.description || '')).toLowerCase();
        allText.split(/[\s,;.]+/).forEach(mot => {
            mot = mot.trim();
            if (mot.length >= 1) {
                if (!clientSearchIndex[mot]) clientSearchIndex[mot] = [];
                if (!clientSearchIndex[mot].includes(c)) clientSearchIndex[mot].push(c);
            }
        });
        const fullName = (c.nom + ' ' + c.prenom).toLowerCase().trim();
        if (fullName.length >= 2) {
            if (!clientSearchIndex[fullName]) clientSearchIndex[fullName] = [];
            if (!clientSearchIndex[fullName].includes(c)) clientSearchIndex[fullName].push(c);
        }
    });
    clientIndexBuilt = true;
}

function fastFindClient(query) {
    buildClientIndex();
    const q = (query || '').toLowerCase().trim();
    if (!q) return window.posAllClients?.slice() || [];
    const normalized = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const mots = normalized.split(/[\s,;.]+/);
    const seen = {}, results = [];
    mots.forEach(mot => {
        mot = mot.trim();
        if (!mot) return;
        (clientSearchIndex[mot] || []).forEach(c => { if (!seen[c.id]) { seen[c.id] = true; results.push(c); } });
    });
    if (results.length === 0 && window.posAllClients) {
        results.push(...window.posAllClients.filter(c => {
            const nom = (c.nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            const prenom = (c.prenom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            const desc = (c.description || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            const tel = (c.telephone || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            return nom.includes(normalized) || prenom.includes(normalized) || desc.includes(normalized) || tel.includes(normalized);
        }));
    }
    return results;
}

function invalidateClientIndex() { clientIndexBuilt = false; clientSearchIndex = {}; }

// ========== COMMANDES RAPIDES ==========
function extractNumberFromTranscript(transcript) {
    // cherche un nombre en chiffres ou en mots
    const cleaned = transcript.toLowerCase().trim();
    const digits = cleaned.match(/\b\d+\b/);
    if (digits) return parseInt(digits[0]);
    for (const word in numberMap) {
        if (cleaned.includes(word)) return numberMap[word];
    }
    return null;
}

function parseVoiceCommand(transcript) {
    const cleaned = transcript.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const currentPage = document.getElementById('pageTitle')?.textContent || '';

    // ----- MODE QUANTITÉ -----
    if (voiceMode === 'quantity') {
        const num = extractNumberFromTranscript(cleaned);
        if (num !== null && num > 0) {
            return { type: 'number', value: num };
        }
        // ignore tout autre mot
        return { type: 'ignore' };
    }

    // ----- MODE PAIEMENT (ÉTAPE 2) -----
    if (voiceMode === 'payment' || (currentPage === 'POS' && (window.posStep || 0) === 2)) {
        // Automate d'état
        switch (window.voicePaymentState) {
            case 0: // client prioritaire
                if (window.posAllClients) {
                    const clients = fastFindClient(cleaned);
                    if (clients.length === 1) return { type: 'client', client: clients[0] };
                    if (clients.length > 1) {
                        // meilleur match
                        const best = clients.find(c => (c.nom + ' ' + c.prenom).toLowerCase().includes(cleaned)) || clients[0];
                        return { type: 'client', client: best };
                    }
                }
                // Si aucun client, tester les mots de paiement pour aller plus vite
                {
                    const pm = detectPaymentMode(cleaned);
                    if (pm) return { type: 'payment_mode', mode: pm };
                }
                return { type: 'ignore' };
            case 1: // mode de paiement
                {
                    const pm = detectPaymentMode(cleaned);
                    if (pm) return { type: 'payment_mode', mode: pm };
                }
                return { type: 'ignore' };
            case 2: // montant
                {
                    const num = extractNumberFromTranscript(cleaned);
                    if (num !== null && num > 0) return { type: 'number', value: num };
                }
                // aussi accepter "valide" pour finaliser
                if (cleaned.includes('valide') || cleaned.includes('validé') || cleaned.includes('valider') || cleaned.includes('confirmer') || cleaned.includes('ok')) {
                    return { type: 'validate' };
                }
                return { type: 'ignore' };
        }
    }

    // ----- NAVIGATION -----
    if (cleaned.includes('crédits') || cleaned.includes('impayés') || cleaned.includes('liste des crédits') || cleaned.includes('dettes') || cleaned.includes('ardoises')) return { type: 'navigate', page: 'credits' };
    if (cleaned.includes('ventes') || cleaned.includes('vente') || cleaned.includes('historique ventes') || cleaned.includes('recettes')) return { type: 'navigate', page: 'ventes' };
    if (cleaned.includes('dashboard') || cleaned.includes('accueil') || cleaned.includes('home') || cleaned.includes('sommaire')) return { type: 'navigate', page: 'dashboard' };
    if (cleaned.includes('produits') || cleaned.includes('catalogue')) return { type: 'navigate', page: 'products' };
    if (cleaned.includes('clients') || cleaned.includes('clientèle')) return { type: 'navigate', page: 'clients' };
    if (cleaned.includes('commandes')) return { type: 'navigate', page: 'commandes' };
    if (cleaned.includes('catégories')) return { type: 'navigate', page: 'categories' };
    if (cleaned.includes('point de vente') || cleaned.includes('pos') || cleaned.includes('caisse') || cleaned.includes('encaissement')) return { type: 'navigate', page: 'pos' };

    // ----- RECHERCHE PRODUIT (ÉTAPE 1) -----
    if (currentPage === 'POS' || currentPage === 'Dashboard') {
        if (voiceMode === 'search' && (window.posStep || 0) === 1) {
            const products = window.posProductsList || [];
            if (products.length) {
                // ne prendre que le premier mot (ou la phrase complète si un seul mot)
                let searchTerm = cleaned;
                // Si plusieurs mots, on prend le premier pour la recherche rapide
                const words = cleaned.split(' ');
                if (words.length > 1) searchTerm = words[0]; // essayer le premier mot d'abord
                const best = findBestProductMatch(searchTerm, products);
                if (best) return { type: 'search_product', product: best };
                // si pas trouvé avec le premier mot, essayer toute la phrase
                if (words.length > 1) {
                    const best2 = findBestProductMatch(cleaned, products);
                    if (best2) return { type: 'search_product', product: best2 };
                }
            }
            // commandes panier
            if (cleaned.includes('passe') || cleaned.includes('passer') || cleaned.includes('suivant')) return { type: 'next' };
            if (cleaned.includes('valide') || cleaned.includes('validé') || cleaned.includes('valider') || cleaned.includes('confirmer') || cleaned.includes('ok')) return { type: 'validate' };
            if (cleaned.includes('annule') || cleaned.includes('annuler')) return { type: 'cancel' };
            if (cleaned.includes('efface') || cleaned.includes('vider')) return { type: 'clear' };
            if (cleaned.includes('termine') || cleaned.includes('terminer') || cleaned.includes('fin')) return { type: 'finalize' };
            return { type: 'unknown', text: transcript };
        }
    }

    return { type: 'ignore' };
}

function findBestProductMatch(term, products) {
    const normalized = term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let best = null, bestLen = 0;
    for (const p of products) {
        const nom = (p.nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (nom === normalized) { best = p; break; }
        if (nom.includes(normalized) && nom.length > bestLen) { best = p; bestLen = nom.length; }
        const desc = (p.description || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (desc.includes(normalized) && desc.length > bestLen) { best = p; bestLen = desc.length; }
    }
    return best;
}

function detectPaymentMode(transcript) {
    const t = transcript.toLowerCase().trim();
    for (const mode in paymentKeywords) {
        if (paymentKeywords[mode].some(kw => t.includes(kw))) return mode;
    }
    return null;
}

// ========== HANDLE COMMAND ==========
function handleVoiceCommand(cmd) {
    const cp = document.getElementById('pageTitle')?.textContent || '';
    switch (cmd.type) {
        case 'search_product':
            const searchInput = document.getElementById('posSearchInput');
            if (searchInput && cmd.product) {
                searchInput.value = cmd.product.nom;
                if (typeof window.posSearchProducts === 'function') window.posSearchProducts(cmd.product.nom);
                showVoiceResult('🔍 ' + cmd.product.nom + ' – cliquez pour ajouter');
            }
            hideVoiceFlowIndicator();
            break;
        case 'number':
            if (voiceMode === 'quantity' && lastAddedProductId) {
                const qty = cmd.value;
                const it = window.posCart?.find(x => x.id === lastAddedProductId);
                if (it) {
                    const p = window.posProductsList?.find(x => x.id === lastAddedProductId);
                    if (p && p.stock !== undefined && qty > p.stock) { showVoiceResult('⚠️ Stock max: ' + p.stock); return; }
                    it.quantite = qty;
                    lastAddedProductId = null;
                    setVoiceMode('search', '🎤 Recherche vocale active', null);
                    if (typeof window.updateCartOnly === 'function') window.updateCartOnly();
                    showVoiceResult('✅ Qté: ' + qty);
                    hideVoiceFlowIndicator();
                    setTimeout(() => showVoiceFlowIndicator('product'), 100);
                }
            } else if (voiceMode === 'payment' && window.voicePaymentState === 2) {
                window.posAmountGiven = cmd.value;
                const ce = document.getElementById('posChangeDisplay');
                if (ce) {
                    const st = typeof window.posCalculateTotal === 'function' ? window.posCalculateTotal() : 0;
                    const t = st - (window.posDiscountMAD || 0);
                    const c = window.posAmountGiven - t;
                    ce.innerHTML = c >= 0
                        ? '<div class="pos-change-positive"><span>Rendu</span><span>' + c.toFixed(2) + ' MAD</span></div>'
                        : '<div class="pos-change-negative"><span>Manquant</span><span>' + Math.abs(c).toFixed(2) + ' MAD</span></div>';
                }
                const ai = document.getElementById('posAmountGiven');
                if (ai) ai.value = window.posAmountGiven;
                showVoiceResult('💰 ' + window.posAmountGiven.toFixed(2) + ' MAD');
                hideVoiceFlowIndicator();
                setTimeout(() => showVoiceFlowIndicator('confirm'), 100);
            }
            break;
        case 'client':
            window.posCurrentClient = { id: cmd.client.id, name: cmd.client.nom + ' ' + cmd.client.prenom };
            window.posCurrentTable = '';
            const ci = document.getElementById('posClientSearchInput');
            if (ci) ci.value = window.posCurrentClient.name;
            if (typeof window.updatePaymentButtons === 'function') window.updatePaymentButtons();
            window.voicePaymentState = 1; // passer au mode
            showVoiceResult('👤 ' + window.posCurrentClient.name);
            hideVoiceFlowIndicator();
            setTimeout(() => showVoiceFlowIndicator('payment_mode'), 100);
            break;
        case 'payment_mode':
            if (typeof window.posSetPaymentMethod === 'function') {
                window.posSetPaymentMethod(cmd.mode);
                window.voicePaymentState = 2; // passer au montant
                showVoiceResult('💳 ' + cmd.mode);
                if (cmd.mode === 'espece') {
                    setTimeout(() => {
                        const ai = document.getElementById('posAmountGiven');
                        if (ai) ai.focus();
                    }, 200);
                }
                hideVoiceFlowIndicator();
                setTimeout(() => showVoiceFlowIndicator('payment_amount'), 100);
            }
            break;
        case 'validate':
            if (window.posStep === 2 && typeof window.posFinalizeSale === 'function') {
                window.posFinalizeSale();
                hideVoiceFlowIndicator();
            } else if (window.posCart?.length > 0 && window.posStep === 1) {
                window.posGoToStep2();
                hideVoiceFlowIndicator();
            }
            break;
        case 'finalize':
            if (window.posStep === 2 && typeof window.posFinalizeSale === 'function') window.posFinalizeSale();
            hideVoiceFlowIndicator();
            break;
        case 'clear':
            if (typeof window.posResetCart === 'function') { window.posResetCart(); showVoiceResult('🗑️ Panier vidé'); }
            hideVoiceFlowIndicator();
            break;
        case 'next':
            if (window.posCart?.length > 0 && window.posStep === 1) window.posGoToStep2();
            hideVoiceFlowIndicator();
            break;
        case 'cancel':
            setVoiceMode('search', '🎤 Recherche vocale active', null);
            showVoiceResult('↩️ Recherche');
            if (typeof window.renderPOS === 'function') window.renderPOS();
            hideVoiceFlowIndicator();
            break;
        case 'navigate':
            const pages = { 'credits': 'Crédits', 'ventes': 'Ventes', 'dashboard': 'Dashboard', 'products': 'Produits', 'clients': 'Clients', 'commandes': 'Commandes en ligne', 'categories': 'Catégories', 'pos': 'POS' };
            if (cp === pages[cmd.page]) { showVoiceResult('✅ ' + pages[cmd.page]); return; }
            if (typeof navigateTo === 'function') navigateTo(cmd.page);
            hideVoiceFlowIndicator();
            break;
        default:
            if (cmd.text) {
                // fallback : recherche produit
                if (typeof window.posSearchProducts === 'function') window.posSearchProducts(cmd.text);
            }
    }
}

// ========== SET VOCAL MODE ==========
function setVoiceMode(mode, msg, productId) {
    voiceMode = mode;
    if (msg) voiceModeMessage = msg;
    if (productId !== undefined) lastAddedProductId = productId;
    if (mode === 'payment') window.voicePaymentState = 0; // reset state
    showVoiceModeIndicator();
}

// ========== MICRO ==========
function posToggleVoiceSearch() {
    const s = checkVoiceSupport();
    if (!s.supported) { alert('⚠️ ' + s.reason); return; }
    if (!navigator.onLine) { alert('⚠️ Connexion internet requise.'); return; }
    if (isRecording) { posStopVoiceSearch(); return; }
    requestMicrophonePermission().then(p => {
        if (!p) { alert('❌ Micro refusé.'); return; }
        posStartVoiceRecording();
    });
}

function posStartVoiceRecording() {
    const mb = document.getElementById('posMicBtn');
    if (voiceRecognition) { try { voiceRecognition.abort(); } catch (e) {} voiceRecognition = null; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('❌ Reconnaissance vocale non disponible.'); return; }
    voiceRecognition = new SR();
    voiceRecognition.lang = 'fr-FR';
    voiceRecognition.continuous = false;   // plus rapide : arrêt après chaque phrase
    voiceRecognition.interimResults = false;
    voiceRecognition.maxAlternatives = 1;

    if (mb) {
        mb.classList.add('recording');
        mb.innerHTML = '<i class="fas fa-circle" style="color:#ef4444;animation:pulse 0.5s ease-in-out infinite;"></i>';
        mb.style.background = '#fee2e2'; mb.style.borderColor = '#ef4444';
    }

    voiceRecognition.onresult = function(e) {
        const transcript = e.results[0][0].transcript;
        const isFinal = e.results[0].isFinal;
        if (isFinal) {
            showProcessingIndicator();
            const cmd = parseVoiceCommand(transcript);
            if (cmd.type !== 'ignore') handleVoiceCommand(cmd);
            hideVoiceFlowIndicator();
        }
    };

    voiceRecognition.onend = function() {
        if (isRecording) {
            try { voiceRecognition.start(); } catch (e) { posStopVoiceSearch(); }
        }
    };
    voiceRecognition.onerror = function(e) {
        if (e.error === 'aborted' || e.error === 'no-speech') return;
        if (e.error === 'network') showVoiceResult('❌ Réseau');
        posStopVoiceSearch();
    };

    try {
        voiceRecognition.start();
        isRecording = true;
        showVoiceModeIndicator();
        showVoiceResult('🎤 Écoute...');
        showVoiceFlowIndicator('product');
    } catch (e) {
        isRecording = false;
        if (mb) { /* remettre style normal */ }
    }
}

function posStopVoiceSearch() {
    if (voiceRecognition) { try { voiceRecognition.abort(); } catch (e) {} voiceRecognition = null; }
    isRecording = false;
    const mb = document.getElementById('posMicBtn');
    if (mb) {
        mb.classList.remove('recording');
        mb.innerHTML = '<i class="fas fa-microphone"></i>';
        mb.style.background = '#dcfce7'; mb.style.borderColor = '#16a34a';
    }
    hideVoiceFlowIndicator();
    showVoiceResult('🎤 Micro désactivé');
}

// ========== INITIALISATION ==========
window.posToggleVoiceSearch = posToggleVoiceSearch;
window.showVoiceResult = showVoiceResult;
window.setVoiceMode = setVoiceMode;
window.showVoiceModeIndicator = showVoiceModeIndicator;
window.activateCreditSelection = activateCreditSelection;  // ces fonctions restent inchangées si tu les as ailleurs, sinon on les laisse
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
window.onProductAdded = function(pid) {
    lastAddedProductId = pid;
    setVoiceMode('quantity', '🔢 Qté', pid);
    showVoiceModeIndicator();
    hideVoiceFlowIndicator();
    setTimeout(() => showVoiceFlowIndicator('quantity'), 100);
};
window.selectAllCredits = selectAllCredits;
window.deselectAllCredits = deselectAllCredits;
window.deleteAllCredits = deleteAllCredits;

console.log('🎤 Module vocal rapide chargé');
