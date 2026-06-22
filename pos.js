// ==================== POS.JS - VERSION COMPLÈTE AVEC VOCAL CRÉDITS (CORRIGÉE) ====================
var posCart = [], posStep = 1, posCategoriesList = [], posProductsList = [], posSelectedCategory = 'all';
var posCurrentClient = null, posCurrentTable = '', posPaymentMethod = 'espece', posAmountGiven = 0, posDiscountMAD = 0;
var posAllClients = [], posFilteredClients = [], posCurrentProductId = null;
var posSearchQuery = '';
var voiceRecognition = null;
var isRecording = false;
var voiceTimeout = null;
var searchTimeout = null;

// ========== MODE VOCAL ==========
var voiceMode = 'search';
var lastAddedProductId = null;
var voiceModeMessage = '🎤 Recherche vocale active';
var lastVoiceCommandTime = 0;

// Cache pour la fidélité
var fideliteSettingsCache = null;

// Cache pour la recherche (index des produits)
var productNameIndex = {};
var productIndexBuilt = false;

// Compteur de facture local
var factureCounter = parseInt(localStorage.getItem('factureCounter')) || 0;

// ========== COMMANDES VOCALES DE PAIEMENT ==========
var paymentKeywords = {
    'espece': ['espèces', 'espece', 'argent', 'cash', 'comptant', 'liquide', 'espèce'],
    'credit': ['crédit', 'credit', 'à crédit', 'acredit', 'dette', 'avance', 'crédit'],
    'partiel': ['partiel', 'partielle', 'acompte', 'moitié', 'partial', 'part', 'partiel']
};

// ========== FONCTION POUR CHANGER LE MODE ==========
function setVoiceMode(newMode, message, productId) {
    voiceMode = newMode;
    if (message) voiceModeMessage = message;
    if (productId !== undefined) lastAddedProductId = productId;
    showVoiceModeIndicator();
}

// ========== COMMANDES TABLES ==========
var posCommandesTables = [];
var posCommandesTablesCount = 0;
var posCommandesEnLigneCount = 0;
var posCommandesFilterText = '';
var posCommandesSortField = 'createdAt';
var posCommandesSortOrder = 'desc';

var posEpicesList = ['Normal','Moins épicé','Très épicé','Sans épice'];
var posSelList = ['Normal','Moins de sel','Sans sel'];

var posCurrentProductIngredients = [];
var allStockData = [];

// ==================== UTILITAIRE ====================
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==================== SUPPORT VOCAL ====================
function isIOSStandalone() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) &&
           !window.MSStream &&
           (window.navigator.standalone === true ||
            window.matchMedia('(display-mode: standalone)').matches);
}

function checkVoiceSupport() {
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    var isStandalone = isIOSStandalone();
    if (isIOS && isStandalone) {
        return { supported: false, reason: 'Ouvrez dans Safari pour le micro' };
    }
    var hasSpeechRecognition = ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);
    if (!hasSpeechRecognition) {
        return { supported: false, reason: 'Navigateur non supporté' };
    }
    return { supported: true };
}

async function requestMicrophonePermission() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch(e) {
        console.error('Permission microphone refusée:', e);
        return false;
    }
}

function showSafariBanner() {
    if (!isIOSStandalone()) return;
    if (document.getElementById('iosPwaBanner')) return;
    var container = document.getElementById('dynamicContent');
    if (!container) return;
    var banner = document.createElement('div');
    banner.id = 'iosPwaBanner';
    banner.style.cssText = 'background:#fef3c7; border:2px solid #f59e0b; border-radius:12px; padding:10px 14px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;';
    banner.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
            <i class="fas fa-exclamation-triangle" style="color:#d97706; font-size:1.1rem;"></i>
            <span style="font-size:0.8rem; color:#92400e;">
                <strong>📱 Microphone</strong><br>
                <span style="font-size:0.7rem;">Ouvrez dans Safari pour le micro.</span>
            </span>
        </div>
        <button onclick="window.open(window.location.href.split('?')[0], '_blank')" style="background:#f59e0b; border:none; padding:6px 14px; border-radius:6px; color:#fff; font-weight:600; cursor:pointer; font-size:0.75rem; white-space:nowrap;">
            🌐 Ouvrir
        </button>
    `;
    container.insertBefore(banner, container.firstChild);
}

function posEnrichirItemsAvecPrixAchat(items) {
    return items.map(function(item) {
        var produit = posProductsList.find(function(p) { return p.id === item.id; });
        var prixAchat = (produit && produit.prixAchat != null) ? produit.prixAchat : (item.prixAchat || 0);
        return Object.assign({}, item, { prixAchat: prixAchat });
    });
}

// ==================== CONSTRUCTION DE L'INDEX DE RECHERCHE ====================
function buildProductIndex() {
    if (productIndexBuilt) return;
    productNameIndex = {};
    posProductsList.forEach(function(p) {
        if (!p.nom) return;
        var words = p.nom.toLowerCase().split(' ');
        words.forEach(function(w) {
            if (w.length < 2) return;
            if (!productNameIndex[w]) productNameIndex[w] = [];
            productNameIndex[w].push(p);
        });
    });
    productIndexBuilt = true;
}

// ==================== RECHERCHE RAPIDE AVEC INDEX ====================
function fastSearch(query) {
    if (!query) return posProductsList;
    buildProductIndex();

    var words = query.toLowerCase().split(' ');
    var results = [];
    var seen = {};

    words.forEach(function(w) {
        if (w.length < 2) return;
        var matches = productNameIndex[w] || [];
        matches.forEach(function(p) {
            if (!seen[p.id]) {
                seen[p.id] = true;
                results.push(p);
            }
        });
    });

    if (results.length === 0) {
        return posProductsList.filter(function(p) {
            return (p.nom || '').toLowerCase().indexOf(query) !== -1 ||
                   (p.categorie || '').toLowerCase().indexOf(query) !== -1 ||
                   (p.description || '').toLowerCase().indexOf(query) !== -1;
        });
    }

    return results;
}

// ==================== CHARGEMENT OPTIMISÉ ====================
async function loadPosPage(c) {
    posResetCart(); posStep = 1;
    posCommandesFilterText = '';
    posCommandesSortField = 'createdAt';
    posCommandesSortOrder = 'desc';
    posSearchQuery = '';
    setVoiceMode('search', '🎤 Recherche vocale active', null);
    productIndexBuilt = false;

    posCategoriesList = [];
    posProductsList = [];
    posAllClients = [];
    posFilteredClients = [];

    // ⚡ AFFICHAGE RAPIDE - CHARGER LE CACHE D'ABORD
    try {
        let cachedCategories = await CacheDB.getAll('categories');
        let cachedProducts = await CacheDB.getAll('products');
        let cachedClients = await CacheDB.getAll('clients');

        if (cachedCategories.length) {
            posCategoriesList = cachedCategories.map(cat => ({
                id: cat.id, nom: cat.nom, imageBase64: cat.imageBase64, recette: cat.recette || false
            }));
        }
        if (cachedProducts.length) {
            posProductsList = cachedProducts.filter(p => p.disponible !== false).map(p => ({
                ...p,
                description: p.description || ''
            }));
            productIndexBuilt = false;
        }
        if (cachedClients.length) {
            posAllClients = cachedClients.map(c => ({ id: c.id, nom: c.nom, prenom: c.prenom, telephone: c.telephone }));
            posFilteredClients = [...posAllClients];
        }

        renderPOS();
    } catch(e) {
        console.error('Erreur cache:', e);
    }

    // ⚡ CHARGEMENT FIRESTORE EN ARRIÈRE-PLAN
    setTimeout(async function() {
        try {
            const [cs, ps, cl] = await Promise.all([
                db.collection('categories').get(),
                db.collection('products').get(),
                db.collection('clients').limit(500).get()
            ]);

            posCategoriesList = [];
            cs.forEach(d => {
                let cat = { id: d.id, nom: d.data().nom, imageBase64: d.data().imageBase64, recette: d.data().recette || false };
                posCategoriesList.push(cat);
                CacheDB.set('categories', d.id, cat);
            });

            posProductsList = [];
            ps.forEach(d => {
                const dd = d.data();
                if (dd.disponible !== false) {
                    let prod = {
                        id: d.id,
                        nom: dd.nom || '',
                        description: dd.description || '',
                        prixVente: dd.prixVente||0,
                        prixPromo: dd.prixPromo||0,
                        prixAchat: dd.prixAchat||0,
                        stock: dd.stock,
                        categorie: dd.categorie||'',
                        imageBase64: dd.imageBase64||''
                    };
                    posProductsList.push(prod);
                    CacheDB.set('products', d.id, prod);
                }
            });
            productIndexBuilt = false;

            posAllClients = [];
            cl.forEach(d => {
                let cli = { id: d.id, nom: d.data().nom, prenom: d.data().prenom, telephone: d.data().telephone };
                posAllClients.push(cli);
                CacheDB.set('clients', d.id, cli);
            });
            posFilteredClients = [...posAllClients];

            renderPOS();

        } catch(e) {
            console.error('Erreur chargement Firestore:', e);
        }
    }, 300);

    await posChargerCommandesTables();
    await posChargerCommandesEnLigneCount();

    var commandeData = localStorage.getItem('posCommandeData');
    var payerVenteData = localStorage.getItem('posPayerVente');
    if (commandeData) {
        var cmd = JSON.parse(commandeData);
        localStorage.removeItem('posCommandeData');
        posCart = [];
        if (cmd.items) {
            var enriched = posEnrichirItemsAvecPrixAchat(cmd.items);
            enriched.forEach(function(item) {
                posCart.push({
                    id: item.id, nom: item.nom,
                    prixUnitaire: item.prixVente || item.prixUnitaire || 0,
                    prixAchat: item.prixAchat || 0,
                    prixPromo: item.prixPromo || 0,
                    prixVente: item.prixVente || item.prixUnitaire || 0,
                    quantite: item.quantite || 1,
                    categorie: item.categorie || '', imageBase64: item.imageBase64 || '',
                    sauces: item.sauces || [], interdits: item.interdits || [],
                    epice: item.epice || 'Normal', sel: item.sel || 'Normal'
                });
            });
        }
        if (cmd.clientId && cmd.clientName) { posCurrentClient = {id: cmd.clientId, name: cmd.clientName}; }
        posCurrentTable = cmd.table || '';
        posStep = 2; posDiscountMAD = 0; posPaymentMethod = 'espece';
        window.posCommandeId = cmd.commandeId;
        renderPOS();
        return;
    }
    if (payerVenteData) {
        var v = JSON.parse(payerVenteData);
        localStorage.removeItem('posPayerVente');
        posCart = [];
        if (v.items) {
            var enriched = posEnrichirItemsAvecPrixAchat(v.items);
            enriched.forEach(function(item) {
                posCart.push({
                    id: item.id, nom: item.nom,
                    prixUnitaire: item.prixVente || 0,
                    prixAchat: item.prixAchat || 0,
                    prixPromo: item.prixPromo || 0,
                    prixVente: item.prixVente || 0,
                    quantite: item.quantite || 1,
                    categorie: '', imageBase64: '',
                    sauces: item.sauces || [], interdits: item.interdits || [],
                    epice: item.epice || 'Normal', sel: item.sel || 'Normal'
                });
            });
        }
        if (v.clientId && v.clientName) { posCurrentClient = {id: v.clientId, name: v.clientName}; }
        posCurrentTable = v.table || '';
        posStep = 2; posDiscountMAD = 0; posPaymentMethod = 'espece';
        window.posVenteId = v.venteId;
        renderPOS();
        return;
    }

    renderPOS();
    if (isIOSStandalone()) {
        showSafariBanner();
    }
}

// ==================== RECHERCHE DE PRODUITS AVEC DÉBOUNCE ====================
function posSearchProducts(query) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(function() {
        posSearchQuery = query.toLowerCase().trim();
        filterProductGrid();
    }, 150);
}

// ==================== FILTRER LA GRILLE ====================
function filterProductGrid() {
    var grid = document.getElementById('posProductGrid');
    if (!grid) {
        grid = document.querySelector('.pos-products-grid');
    }
    if (!grid) return;

    var f = fastSearch(posSearchQuery);

    if (posSelectedCategory !== 'all') {
        f = f.filter(function(p) { return p.categorie === posSelectedCategory; });
    }

    f.sort(function(a, b) {
        return (a.nom || '').localeCompare(b.nom || '');
    });

    var html = '';

    if (f.length === 0) {
        var message = posSearchQuery ? 'Aucun produit trouvé pour "' + escapeHtml(posSearchQuery) + '"' : 'Aucun produit disponible';
        html += '<div style="grid-column:1/-1;text-align:center;padding:40px 10px;">';
        html += '<i class="fas fa-search" style="font-size:2.5rem;color:#94a3b8;display:block;margin-bottom:10px;"></i>';
        html += '<p style="color:#94a3b8;font-size:0.95rem;">' + message + '</p>';
        if (posSearchQuery) {
            html += '<button class="btn-add" onclick="document.getElementById(\'posSearchInput\').value=\'\'; posSearchProducts(\'\');" style="margin-top:10px; padding:6px 14px; font-size:0.8rem;"><i class="fas fa-times"></i> Effacer</button>';
        }
        html += '</div>';
    } else {
        if (posSearchQuery) {
            html += '<div style="grid-column:1/-1;text-align:left;padding:3px 8px;font-size:0.75rem;color:#94a3b8;">';
            html += f.length + ' résultat' + (f.length > 1 ? 's' : '') + ' trouvé' + (f.length > 1 ? 's' : '');
            html += '</div>';
        }

        for (var j = 0; j < f.length; j++) {
            var p = f[j];
            var pr = p.prixPromo && p.prixPromo > 0 ? p.prixPromo : p.prixVente;
            var hp = p.prixPromo && p.prixPromo > 0;
            var sc = '', stt = '';
            if (p.stock !== undefined) {
                if (p.stock <= 0) { sc = 'pos-out-of-stock'; stt = ' (Rupture)'; }
                else if (p.stock <= 5) { stt = ' (' + p.stock + ' rest.)'; }
            }

            var displayName = escapeHtml(p.nom);
            if (posSearchQuery) {
                var regex = new RegExp('(' + posSearchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
                displayName = displayName.replace(regex, '<mark style="background:#fef3c7; border-radius:3px; padding:0 2px;">$1</mark>');
            }

            html += '<div class="pos-product-card ' + sc + '" onclick="posAddToCartOrOpenOptions(\'' + p.id + '\')">';
            if (p.imageBase64) html += '<div class="pos-product-img"><img src="' + escapeHtml(p.imageBase64) + '" alt=""></div>';
            else html += '<div class="pos-product-img pos-product-placeholder"><i class="fas fa-box"></i></div>';
            html += '<div class="pos-product-info"><span class="pos-product-name">' + displayName + stt + '</span><span class="pos-product-price">';
            if (hp) html += '<span class="pos-old-price">' + p.prixVente.toFixed(2) + '</span> <span class="pos-promo-price">' + pr.toFixed(2) + ' MAD</span>';
            else html += pr.toFixed(2) + ' MAD';
            html += '</span></div></div>';
        }
    }
    grid.innerHTML = html;
}

// ==================== DÉTECTION DU MODE DE PAIEMENT ====================
function detectPaymentMode(text) {
    text = text.toLowerCase().trim();

    for (var mode in paymentKeywords) {
        for (var i = 0; i < paymentKeywords[mode].length; i++) {
            if (text.indexOf(paymentKeywords[mode][i]) !== -1) {
                return mode;
            }
        }
    }
    if (text === 'espece' || text === 'especes' || text === 'cash') return 'espece';
    if (text === 'credit' || text === 'credit') return 'credit';
    if (text === 'partiel' || text === 'partial') return 'partiel';

    return null;
}

// ==================== COMMANDES VOCALES COMPLÈTES ====================
function parseVoiceCommand(transcript) {
    transcript = transcript.toLowerCase().trim();
    var now = Date.now();
    if (now - lastVoiceCommandTime < 500) {
        return { type: 'ignore' };
    }
    lastVoiceCommandTime = now;

    // ========== RECHERCHE DE CLIENT DANS LES LISTES ==========
    var currentPage = document.getElementById('pageTitle')?.textContent || '';

    // Si on est sur la page Ventes
    if (currentPage === 'Ventes') {
        var clientMatch = transcript.match(/client\s+([a-z]+(?:\s+[a-z]+)*)/i);
        var searchMatch = transcript.match(/rechercher\s+([a-z]+(?:\s+[a-z]+)*)/i);
        var directMatch = transcript.match(/^([a-z]+(?:\s+[a-z]+)*)$/);
        
        var clientName = null;
        if (clientMatch) clientName = clientMatch[1];
        else if (searchMatch) clientName = searchMatch[1];
        else if (directMatch && directMatch[1].length > 2) {
            var name = directMatch[1].toLowerCase();
            var found = posAllClients.some(function(c) {
                var fullName = (c.nom + ' ' + c.prenom).toLowerCase();
                return fullName.indexOf(name) !== -1 || 
                       c.nom.toLowerCase().indexOf(name) !== -1 || 
                       c.prenom.toLowerCase().indexOf(name) !== -1;
            });
            if (found) clientName = directMatch[1];
        }
        
        if (clientName) {
            return { type: 'search_client_in_ventes', clientName: clientName };
        }
    }

    // Si on est sur la page Crédits
    if (currentPage === 'Crédits') {
        var clientMatch2 = transcript.match(/client\s+([a-z]+(?:\s+[a-z]+)*)/i);
        var searchMatch2 = transcript.match(/rechercher\s+([a-z]+(?:\s+[a-z]+)*)/i);
        var directMatch2 = transcript.match(/^([a-z]+(?:\s+[a-z]+)*)$/);
        
        var clientName2 = null;
        if (clientMatch2) clientName2 = clientMatch2[1];
        else if (searchMatch2) clientName2 = searchMatch2[1];
        else if (directMatch2 && directMatch2[1].length > 2) {
            var name2 = directMatch2[1].toLowerCase();
            var found2 = posAllClients.some(function(c) {
                var fullName = (c.nom + ' ' + c.prenom).toLowerCase();
                return fullName.indexOf(name2) !== -1 || 
                       c.nom.toLowerCase().indexOf(name2) !== -1 || 
                       c.prenom.toLowerCase().indexOf(name2) !== -1;
            });
            if (found2) clientName2 = directMatch2[1];
        }
        
        if (clientName2) {
            return { type: 'search_client_in_credits', clientName: clientName2 };
        }

        // ---------- COMMANDES VOCALES POUR CRÉDITS ----------
        
        // 1. Activer le mode sélection
        if (transcript.includes('sélectionner') || transcript.includes('select') || 
            transcript.includes('choisir') || transcript.includes('cocher')) {
            return { type: 'activate_credit_selection' };
        }

        // 2. Sélectionner une ligne : gère "ligne 3", "numéro 3", "trois", ou simplement "3" si mode sélection actif
        // On cherche d'abord "ligne X" ou "numéro X"
        let lineMatch = transcript.match(/(?:ligne|numéro)\s+([a-z0-9]+)/i);
        if (lineMatch) {
            let numStr = lineMatch[1];
            let num = parseInt(numStr);
            if (isNaN(num)) {
                // Convertir les mots en nombres (ex: "deux" -> 2)
                for (var word in numberMap) {
                    if (numStr.toLowerCase() === word) {
                        num = numberMap[word];
                        break;
                    }
                }
            }
            if (!isNaN(num) && num > 0) {
                return { type: 'select_credit_line', lineNumber: num };
            }
        }

        // Si on est en mode sélection, on capture n'importe quel nombre (chiffre ou lettre)
        if (window.creditSelectionMode) {
            // Chercher un nombre dans la phrase (ex: "le 2" ou "deux")
            let anyNumber = transcript.match(/\b(\d+)\b/);
            let num = null;
            if (anyNumber) {
                num = parseInt(anyNumber[1]);
            } else {
                // Chercher un mot correspondant à un nombre (ex: "deux", "trois")
                for (var word in numberMap) {
                    if (transcript.includes(word)) {
                        num = numberMap[word];
                        break;
                    }
                }
            }
            if (num !== null && !isNaN(num) && num > 0) {
                return { type: 'select_credit_line', lineNumber: num };
            }
        }

        // 3. Marquer comme payé
        if (transcript.includes('marquer payé') || transcript.includes('payer') || transcript.includes('régler')) {
            return { type: 'mark_credit_paid' };
        }

        // 4. Saisir un montant : "montant 100" ou "cent"
        let amountMatch = transcript.match(/montant\s+(\d+[.,]?\d*)/i);
        if (amountMatch) {
            let amount = parseFloat(amountMatch[1].replace(',', '.'));
            if (!isNaN(amount) && amount > 0) {
                return { type: 'set_credit_amount', amount: amount };
            }
        } else {
            // Si on est en mode paiement, on peut capturer un nombre seul comme montant
            if (window.creditPaymentStep === 'payment' || window.creditPaymentStep === 'amount') {
                let amountNumber = transcript.match(/\b(\d+[.,]?\d*)\b/);
                if (amountNumber) {
                    let amount = parseFloat(amountNumber[1].replace(',', '.'));
                    if (!isNaN(amount) && amount > 0) {
                        return { type: 'set_credit_amount', amount: amount };
                    }
                }
            }
        }

        // 5. Valider le paiement
        if (transcript.includes('valide') || transcript.includes('confirmer') || transcript.includes('ok')) {
            return { type: 'validate_credit_payment' };
        }

        // 6. Fermer / réinitialiser
        if (transcript.includes('fermer') || transcript.includes('retour')) {
            return { type: 'close_credit_list' };
        }
    }

    // ========== NAVIGATION VOCALE ==========
    
    // ⭐ POINT DE VENTE (POS) - CORRIGÉ
    if (transcript.includes('point de vente') || 
        transcript.includes('point de vente') ||
        transcript.includes('point vente') ||
        transcript.includes('pos') || 
        transcript.includes('caisse') || 
        transcript.includes('retour pos') || 
        transcript.includes('aller au pos') ||
        transcript.includes('retour à la caisse') ||
        transcript.includes('point de vente pos')) {
        
        if (currentPage === 'POS') {
            showVoiceResult('✅ Vous êtes déjà sur le Point de Vente');
            return { type: 'ignore' };
        }
        if (posCart.length > 0 && posStep === 1) {
            if (!confirm('⚠️ Vous avez ' + posCart.length + ' article(s) dans le panier. Voulez-vous les garder ?')) {
                posResetCart();
            }
        }
        showVoiceResult('📋 Retour au Point de Vente...');
        setTimeout(function() {
            navigateTo('pos');
        }, 300);
        return { type: 'ignore' };
    }

    // ⭐ CRÉDITS
    if (transcript.includes('liste des crédits') || transcript.includes('crédits') || 
        transcript.includes('credit') || transcript.includes('liste crédit') ||
        transcript.includes('crédit client') || transcript.includes('impayés')) {
        return { type: 'navigate', page: 'credits' };
    }
    
    // ⭐ VENTES
    if (transcript.includes('liste des ventes') || transcript.includes('ventes') || 
        transcript.includes('vente') || transcript.includes('liste vente') ||
        transcript.includes('historique des ventes')) {
        return { type: 'navigate', page: 'ventes' };
    }
    
    // ⭐ DASHBOARD
    if (transcript.includes('dashboard') || transcript.includes('tableau de bord') || 
        transcript.includes('accueil') || transcript.includes('retour') ||
        transcript.includes('home')) {
        return { type: 'navigate', page: 'dashboard' };
    }
    
    // ⭐ PRODUITS
    if (transcript.includes('produits') || transcript.includes('liste des produits') || 
        transcript.includes('catalogue') || transcript.includes('article')) {
        return { type: 'navigate', page: 'products' };
    }
    
    // ⭐ CLIENTS
    if (transcript.includes('clients') || transcript.includes('liste des clients') ||
        transcript.includes('clientèle')) {
        return { type: 'navigate', page: 'clients' };
    }
    
    // ⭐ COMMANDES
    if (transcript.includes('commandes') || transcript.includes('liste des commandes') ||
        transcript.includes('commande en ligne')) {
        return { type: 'navigate', page: 'commandes' };
    }
    
    // ⭐ CATÉGORIES
    if (transcript.includes('catégories') || transcript.includes('liste des catégories')) {
        return { type: 'navigate', page: 'categories' };
    }

    // Si on est en mode paiement
    if (posStep === 2) {
        var paymentMode = detectPaymentMode(transcript);
        if (paymentMode) {
            return { type: 'payment_mode', mode: paymentMode };
        }
    }
    
    // ========== DÉTECTION DES NOMBRES ==========
    var numberMap = {
        'un': 1, 'une': 1, 'deux': 2, 'trois': 3, 'quatre': 4, 'cinq': 5,
        'six': 6, 'sept': 7, 'huit': 8, 'neuf': 9, 'dix': 10,
        'onze': 11, 'douze': 12, 'douz': 12, 'treize': 13, 'quatorze': 14,
        'quinze': 15, 'seize': 16, 'vingt': 20, 'trente': 30, 'quarante': 40,
        'cinquante': 50, 'soixante': 60, 'cent': 100
    };

    var numberMatch = transcript.match(/\b(\d+)\b/);
    if (numberMatch) {
        return { type: 'number', value: parseInt(numberMatch[1]) };
    }
    for (var word in numberMap) {
        if (transcript.indexOf(word) !== -1) {
            return { type: 'number', value: numberMap[word] };
        }
    }

    // ========== COMMANDES DE NAVIGATION ==========
    if (transcript.includes('passe') || transcript.includes('passer') || transcript.includes('suivant')) {
        return { type: 'next' };
    }
    if (transcript.includes('valide') || transcript.includes('valider') || transcript.includes('confirmer') || transcript.includes('ok')) {
        return { type: 'validate' };
    }
    if (transcript.includes('annule') || transcript.includes('annuler') || transcript.includes('retour')) {
        return { type: 'cancel' };
    }
    if (transcript.includes('efface') || transcript.includes('vider') || transcript.includes('clear')) {
        return { type: 'clear' };
    }
    if (transcript.includes('termine') || transcript.includes('terminer') || transcript.includes('fin') || transcript.includes('finaliser')) {
        return { type: 'finalize' };
    }

    // ========== RECHERCHE DE PRODUIT ==========
    var foundProduct = null;
    var bestMatchLength = 0;
    for (var i = 0; i < posProductsList.length; i++) {
        var prod = posProductsList[i];
        var prodName = prod.nom.toLowerCase();
        if (transcript.includes(prodName) && prodName.length > bestMatchLength) {
            foundProduct = prod;
            bestMatchLength = prodName.length;
        }
    }
    if (foundProduct) {
        return { type: 'product', product: foundProduct };
    }

    // ========== RECHERCHE DE CLIENT ==========
    for (var j = 0; j < posAllClients.length; j++) {
        var client = posAllClients[j];
        var fullName = (client.nom + ' ' + client.prenom).toLowerCase();
        if (transcript.includes(fullName) || transcript.includes(client.nom.toLowerCase()) || transcript.includes(client.prenom.toLowerCase())) {
            return { type: 'client', client: client };
        }
    }

    // ========== MONTANT ==========
    var amountMatch = transcript.match(/\d+[.,]?\d*/);
    if (amountMatch) {
        var amount = parseFloat(amountMatch[0].replace(',', '.'));
        if (amount > 0) {
            return { type: 'amount', value: amount };
        }
    }

    return { type: 'unknown', text: transcript };
}

// ==================== RECHERCHE CLIENT DANS VENTES ====================
function searchClientInVentes(clientName) {
    if (!clientName) return;
    
    var searchInput = document.getElementById('ventesSearchInput');
    if (searchInput) {
        searchInput.value = clientName;
        ventesSearch = clientName;
        currentPages.ventes = 1;
        if (typeof applyVentesFilters === 'function') {
            applyVentesFilters();
        }
        showVoiceResult('🔍 Client trouvé: ' + clientName);
    } else {
        navigateTo('ventes');
        setTimeout(function() {
            var searchInput2 = document.getElementById('ventesSearchInput');
            if (searchInput2) {
                searchInput2.value = clientName;
                ventesSearch = clientName;
                currentPages.ventes = 1;
                if (typeof applyVentesFilters === 'function') {
                    applyVentesFilters();
                }
                showVoiceResult('🔍 Client trouvé: ' + clientName);
            }
        }, 500);
    }
}

// ==================== RECHERCHE CLIENT DANS CRÉDITS ====================
function searchClientInCredits(clientName) {
    if (!clientName) return;
    
    var searchInput = document.getElementById('creditsSearchInput');
    if (searchInput) {
        searchInput.value = clientName;
        creditsSearch = clientName;
        currentPages.credits = 1;
        if (typeof applyCreditsFilters === 'function') {
            applyCreditsFilters();
        }
        showVoiceResult('🔍 Client trouvé: ' + clientName);
    } else {
        navigateTo('credits');
        setTimeout(function() {
            var searchInput2 = document.getElementById('creditsSearchInput');
            if (searchInput2) {
                searchInput2.value = clientName;
                creditsSearch = clientName;
                currentPages.credits = 1;
                if (typeof applyCreditsFilters === 'function') {
                    applyCreditsFilters();
                }
                showVoiceResult('🔍 Client trouvé: ' + clientName);
            }
        }, 500);
    }
}

// ==================== FONCTIONS VOCALES CRÉDITS (appelées par handleVoiceCommand) ====================
function activateCreditSelection() {
    creditSelectionMode = true;
    window.creditSelectionMode = true;
    creditSelectedIndex = -1;
    creditPaymentStep = 'idle';
    if (typeof renderCreditsTable === 'function') {
        renderCreditsTable();
    }
    showVoiceResult('📋 Mode sélection activé. Dites le numéro de la ligne');
}

function selectCreditLine(lineNumber) {
    var data = window.filteredCredits || allCreditsData || [];
    var index = lineNumber - 1;
    if (index < 0 || index >= data.length) {
        showVoiceResult('❌ Ligne ' + lineNumber + ' inexistante. ' + data.length + ' ligne(s) disponible(s)');
        return;
    }
    if (!creditSelectionMode) {
        showVoiceResult('⚠️ Activez d\'abord le mode sélection avec "sélectionner"');
        return;
    }
    creditSelectedIndex = index;
    creditPaymentStep = 'selection';
    creditPaymentAmount = 0;
    if (typeof renderCreditsTable === 'function') {
        renderCreditsTable();
    }
    var credit = data[index];
    var reste = credit.remainingAmount || credit.total || 0;
    showVoiceResult('✅ Ligne ' + lineNumber + ' sélectionnée - ' + (credit.clientName || credit.table || '') + ' - Restant: ' + reste.toFixed(2) + ' MAD');
}

function markCreditForPayment() {
    if (creditSelectedIndex < 0) {
        showVoiceResult('⚠️ Aucune ligne sélectionnée. Dites d\'abord un numéro de ligne');
        return;
    }
    var data = window.filteredCredits || allCreditsData || [];
    var credit = data[creditSelectedIndex];
    if (!credit) {
        showVoiceResult('❌ Crédit introuvable');
        return;
    }
    if (credit.paid) {
        showVoiceResult('⚠️ Ce crédit est déjà payé');
        return;
    }
    creditPaymentStep = 'payment';
    var reste = credit.remainingAmount || credit.total || 0;
    showVoiceResult('💳 Paiement du crédit - Restant: ' + reste.toFixed(2) + ' MAD. Dites "montant [prix]" ou tapez le montant');
    // Afficher la zone de paiement
    var zone = document.getElementById('creditPaymentZone');
    var info = document.getElementById('creditPaymentInfo');
    if (zone) {
        zone.style.display = 'block';
        if (info) {
            info.textContent = 'Client: ' + (credit.clientName || credit.table || 'Inconnu') + ' | Restant: ' + reste.toFixed(2) + ' MAD';
        }
        var input = document.getElementById('creditPaymentAmountInput');
        if (input) {
            input.value = '';
            input.focus();
            input.select();
        }
    }
}

function setCreditPaymentAmount(amount) {
    if (creditSelectedIndex < 0) {
        showVoiceResult('⚠️ Aucun crédit sélectionné');
        return;
    }
    if (amount <= 0) {
        showVoiceResult('❌ Montant invalide');
        return;
    }
    creditPaymentAmount = amount;
    creditPaymentStep = 'amount';
    var input = document.getElementById('creditPaymentAmountInput');
    if (input) input.value = amount;
    showVoiceResult('💰 Montant saisi: ' + amount.toFixed(2) + ' MAD. Dites "valide" pour confirmer');
}

function validateCreditPayment() {
    if (creditSelectedIndex < 0) {
        showVoiceResult('⚠️ Aucun crédit sélectionné');
        return;
    }
    
    var input = document.getElementById('creditPaymentAmountInput');
    var amount = parseFloat(input ? input.value : creditPaymentAmount);
    if (isNaN(amount) || amount <= 0) {
        showVoiceResult('❌ Montant invalide');
        return;
    }
    
    var data = window.filteredCredits || allCreditsData || [];
    var credit = data[creditSelectedIndex];
    if (!credit) {
        showVoiceResult('❌ Crédit introuvable');
        return;
    }
    
    var reste = credit.remainingAmount || credit.total || 0;
    if (amount > reste) {
        showVoiceResult('⚠️ Montant supérieur au reste dû (' + reste.toFixed(2) + ' MAD)');
        return;
    }
    
    var newReste = reste - amount;
    var paid = newReste <= 0.01;
    var updateData = {
        paid: paid,
        remainingAmount: Math.max(0, newReste),
        amountGiven: (credit.amountGiven || 0) + amount,
        paidAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    CacheDB.write('credits', credit.id, updateData, 'update')
        .then(function() {
            if (paid) {
                showVoiceResult('✅ Crédit soldé !');
            } else {
                showVoiceResult('✅ Paiement enregistré. Reste : ' + newReste.toFixed(2) + ' MAD');
            }
            // Réinitialiser
            creditPaymentStep = 'idle';
            creditSelectedIndex = -1;
            creditPaymentAmount = 0;
            creditSelectionMode = false;
            window.creditSelectionMode = false;
            // Masquer la zone de paiement
            var zone = document.getElementById('creditPaymentZone');
            if (zone) zone.style.display = 'none';
            // Recharger
            if (typeof loadCredits === 'function') {
                loadCredits();
            }
            CacheDB.sync();
        })
        .catch(function(e) {
            showVoiceResult('❌ Erreur : ' + e.message);
        });
}

function closeCreditSelection() {
    creditSelectionMode = false;
    window.creditSelectionMode = false;
    creditSelectedIndex = -1;
    creditPaymentAmount = 0;
    creditPaymentStep = 'idle';
    // Masquer la zone de paiement
    var zone = document.getElementById('creditPaymentZone');
    if (zone) zone.style.display = 'none';
    creditsSearch = '';
    currentPages.credits = 1;
    window.filteredCredits = null;
    if (typeof applyCreditsFilters === 'function') {
        applyCreditsFilters();
    }
    showVoiceResult('📋 Liste complète des crédits');
}

// Exposer les fonctions pour admin.js
window.activateCreditSelection = activateCreditSelection;
window.selectCreditLine = selectCreditLine;
window.markCreditForPayment = markCreditForPayment;
window.setCreditPaymentAmount = setCreditPaymentAmount;
window.validateCreditPayment = validateCreditPayment;
window.closeCreditSelection = closeCreditSelection;
window.creditSelectionMode = creditSelectionMode;

// ==================== HANDLER DES COMMANDES VOCALES ====================
function handleVoiceCommand(command) {
    console.log('🎤 Commande vocale:', command);

    switch (command.type) {
        
        // ⭐ RECHERCHE CLIENT DANS VENTES
        case 'search_client_in_ventes':
            var clientName = command.clientName;
            if (typeof searchClientInVentes === 'function') {
                searchClientInVentes(clientName);
            } else {
                showVoiceResult('📋 Recherche du client ' + clientName + ' dans les ventes...');
                navigateTo('ventes');
                setTimeout(function() {
                    var searchInput = document.getElementById('ventesSearchInput');
                    if (searchInput) {
                        searchInput.value = clientName;
                        ventesSearch = clientName;
                        currentPages.ventes = 1;
                        if (typeof applyVentesFilters === 'function') {
                            applyVentesFilters();
                        }
                    }
                }, 500);
            }
            break;
        
        // ⭐ RECHERCHE CLIENT DANS CRÉDITS
        case 'search_client_in_credits':
            var clientName2 = command.clientName;
            if (typeof searchClientInCredits === 'function') {
                searchClientInCredits(clientName2);
            } else {
                showVoiceResult('📋 Recherche du client ' + clientName2 + ' dans les crédits...');
                navigateTo('credits');
                setTimeout(function() {
                    var searchInput = document.getElementById('creditsSearchInput');
                    if (searchInput) {
                        searchInput.value = clientName2;
                        creditsSearch = clientName2;
                        currentPages.credits = 1;
                        if (typeof applyCreditsFilters === 'function') {
                            applyCreditsFilters();
                        }
                    }
                }, 500);
            }
            break;

        // ⭐ ACTIVATION DE LA SÉLECTION (Crédits)
        case 'activate_credit_selection':
            activateCreditSelection();
            break;

        // ⭐ SÉLECTION D'UNE LIGNE (Crédits)
        case 'select_credit_line':
            selectCreditLine(command.lineNumber);
            break;

        // ⭐ MARQUER COMME PAYÉ (Crédits)
        case 'mark_credit_paid':
            markCreditForPayment();
            break;

        // ⭐ SAISIR UN MONTANT (Crédits)
        case 'set_credit_amount':
            setCreditPaymentAmount(command.amount);
            break;

        // ⭐ VALIDER LE PAIEMENT (Crédits)
        case 'validate_credit_payment':
            validateCreditPayment();
            break;

        // ⭐ FERMER / RÉINITIALISER (Crédits)
        case 'close_credit_list':
            closeCreditSelection();
            break;

        // ⭐ NAVIGATION VOCALE
        case 'navigate':
            var page = command.page;
            var currentPage = document.getElementById('pageTitle')?.textContent || '';
            
            var pageTitles = {
                'credits': 'Crédits',
                'ventes': 'Ventes',
                'dashboard': 'Dashboard',
                'products': 'Produits',
                'clients': 'Clients',
                'commandes': 'Commandes en ligne',
                'categories': 'Catégories',
                'pos': 'POS'
            };
            
            if (currentPage === pageTitles[page]) {
                showVoiceResult('✅ Vous êtes déjà sur ' + pageTitles[page]);
                return;
            }
            
            if (posCart.length > 0 && posStep === 1 && page !== 'pos') {
                if (!confirm('⚠️ Vous avez ' + posCart.length + ' article(s) dans le panier. Voulez-vous les garder ?')) {
                    posResetCart();
                }
            }
            
            showVoiceResult('📋 Navigation vers ' + pageTitles[page] + '...');
            setTimeout(function() {
                navigateTo(page);
            }, 500);
            break;

        case 'payment_mode':
            var mode = command.mode;
            if ((mode === 'credit' || mode === 'partiel') && (!posCurrentClient || !posCurrentClient.id)) {
                alert('Client requis pour ' + mode);
                showVoiceResult('⚠️ Client requis pour ' + mode);
                return;
            }
            posSetPaymentMethod(mode);
            showVoiceResult('✅ Paiement en ' + mode + ' sélectionné');
            renderPOS();
            if (mode === 'espece') {
                setTimeout(function() {
                    var amountInput = document.getElementById('posAmountGiven');
                    if (amountInput) amountInput.focus();
                }, 300);
            }
            break;

        case 'product':
            var p = command.product;
            if (p.stock !== undefined && p.stock <= 0) {
                showVoiceResult('⚠️ Rupture de stock: ' + p.nom);
                return;
            }
            var existing = posCart.find(function(x) { return x.id === p.id; });
            if (existing) {
                existing.quantite += 1;
            } else {
                var pr = p.prixPromo && p.prixPromo > 0 ? p.prixPromo : p.prixVente;
                posCart.push({
                    id: p.id, nom: p.nom, prixUnitaire: pr,
                    prixAchat: p.prixAchat || 0, prixPromo: p.prixPromo || 0,
                    prixVente: p.prixVente || 0, quantite: 1,
                    categorie: p.categorie || '', imageBase64: p.imageBase64 || '',
                    sauces: [], interdits: [], epice: 'Normal', sel: 'Normal'
                });
                lastAddedProductId = p.id;
            }
            setVoiceMode('quantity', '🎤 Dites un nombre, "passe" ou "valide"', lastAddedProductId);
            showVoiceResult('✅ ' + p.nom + ' ajouté');
            updateCartOnly();
            showVoiceModeIndicator();
            break;

        case 'number':
            if (voiceMode === 'quantity' && lastAddedProductId) {
                var qty = command.value;
                if (qty < 1) qty = 1;
                var item = posCart.find(function(x) { return x.id === lastAddedProductId; });
                if (item) {
                    var prod = posProductsList.find(function(p) { return p.id === lastAddedProductId; });
                    if (prod && prod.stock !== undefined && qty > prod.stock) {
                        showVoiceResult('⚠️ Stock max: ' + prod.stock);
                        return;
                    }
                    item.quantite = qty;
                    lastAddedProductId = null;
                    setVoiceMode('search', '🎤 Recherche vocale active', null);
                    showVoiceResult('✅ Quantité: ' + qty);
                    updateCartOnly();
                    showVoiceModeIndicator();
                }
            } else if (voiceMode === 'payment' || posStep === 2) {
                posAmountGiven = command.value;
                var changeEl = document.getElementById('posChangeDisplay');
                if (changeEl) {
                    var st = posCalculateTotal();
                    var t = st - posDiscountMAD;
                    var c = posAmountGiven - t;
                    changeEl.innerHTML = c >= 0 ?
                        '<div class="pos-change-positive"><span>Rendu</span><span>' + c.toFixed(2) + ' MAD</span></div>' :
                        '<div class="pos-change-negative"><span>Manquant</span><span>' + Math.abs(c).toFixed(2) + ' MAD</span></div>';
                }
                var amountInput = document.getElementById('posAmountGiven');
                if (amountInput) amountInput.value = posAmountGiven;
                showVoiceResult('💰 Montant: ' + posAmountGiven.toFixed(2) + ' MAD');
            }
            break;

        case 'client':
            posCurrentClient = { id: command.client.id, name: command.client.nom + ' ' + command.client.prenom };
            posCurrentTable = '';
            var clientInput = document.getElementById('posClientSearchInput');
            if (clientInput) clientInput.value = posCurrentClient.name;
            updatePaymentButtons();
            setVoiceMode('payment', '🎤 Dites le montant, "valide" ou mode paiement', null);
            showVoiceResult('👤 Client: ' + posCurrentClient.name);
            renderPOS();
            break;

        case 'amount':
            if (posStep === 2) {
                posAmountGiven = command.value;
                var changeEl2 = document.getElementById('posChangeDisplay');
                if (changeEl2) {
                    var st2 = posCalculateTotal();
                    var t2 = st2 - posDiscountMAD;
                    var c2 = posAmountGiven - t2;
                    changeEl2.innerHTML = c2 >= 0 ?
                        '<div class="pos-change-positive"><span>Rendu</span><span>' + c2.toFixed(2) + ' MAD</span></div>' :
                        '<div class="pos-change-negative"><span>Manquant</span><span>' + Math.abs(c2).toFixed(2) + ' MAD</span></div>';
                }
                var amountInput2 = document.getElementById('posAmountGiven');
                if (amountInput2) amountInput2.value = posAmountGiven;
                showVoiceResult('💰 Montant: ' + posAmountGiven.toFixed(2) + ' MAD');
            }
            break;

        case 'next':
            if (voiceMode === 'quantity') {
                setVoiceMode('search', '🎤 Recherche vocale active', null);
                updateCartOnly();
                showVoiceModeIndicator();
            } else if (posStep === 2) {
                posFinalizeSale();
            } else if (posCart.length > 0 && posStep === 1) {
                posGoToStep2();
            }
            break;

        case 'validate':
            if (voiceMode === 'quantity') {
                setVoiceMode('search', '🎤 Recherche vocale active', null);
                updateCartOnly();
                showVoiceModeIndicator();
            } else if (posStep === 2) {
                posFinalizeSale();
            } else if (posStep === 1 && posCart.length > 0) {
                posGoToStep2();
            }
            break;

        case 'finalize':
            if (posStep === 2) {
                posFinalizeSale();
            }
            break;

        case 'clear':
            posResetCart();
            showVoiceResult('🗑️ Panier vidé');
            renderPOS();
            break;

        case 'cancel':
            if (voiceMode !== 'search') {
                setVoiceMode('search', '🎤 Recherche vocale active', null);
                showVoiceResult('↩️ Retour à la recherche');
                renderPOS();
            }
            break;

        default:
            if (voiceMode === 'search' && command.text) {
                posSearchQuery = command.text;
                filterProductGrid();
            }
            break;
    }
}

// ==================== INDICATEUR DE MODE VOCAL ====================
function showVoiceModeIndicator() {
    var indicator = document.getElementById('voiceModeIndicator');
    if (!indicator) {
        var container = document.querySelector('.pos-products-panel');
        if (!container) return;
        indicator = document.createElement('div');
        indicator.id = 'voiceModeIndicator';
        indicator.style.cssText = 'background:#f0fdf4; border:2px solid #16a34a; border-radius:8px; padding:6px 12px; margin-bottom:8px; font-size:0.8rem; display:flex; align-items:center; gap:8px; color:#14532d;';
        container.insertBefore(indicator, container.firstChild);
    }
    var icon = voiceMode === 'search' ? 'fa-microphone' : (voiceMode === 'quantity' ? 'fa-hashtag' : (voiceMode === 'client' ? 'fa-user' : 'fa-money-bill-wave'));
    var color = voiceMode === 'search' ? '#16a34a' : (voiceMode === 'quantity' ? '#f59e0b' : (voiceMode === 'client' ? '#4f46e5' : '#dc2626'));
    indicator.innerHTML = '<i class="fas ' + icon + '" style="color:' + color + ';"></i> ' +
                          (voiceModeMessage || '🎤 Recherche vocale active') +
                          ' <span style="font-size:0.6rem; color:#94a3b8; margin-left:auto;">' + voiceMode + '</span>';
    indicator.style.borderColor = color;
    indicator.style.background = voiceMode === 'search' ? '#f0fdf4' : '#fefce8';
}

// ==================== AFFICHER RÉSULTAT VOCAL ====================
function showVoiceResult(message) {
    var resultDiv = document.getElementById('voiceResultDisplay');
    if (!resultDiv) {
        resultDiv = document.createElement('div');
        resultDiv.id = 'voiceResultDisplay';
        resultDiv.style.cssText = 'position:fixed; bottom:100px; left:50%; transform:translateX(-50%); background:#2E7D32; color:#fff; padding:12px 24px; border-radius:12px; font-weight:600; font-size:1rem; z-index:9999; box-shadow:0 4px 20px rgba(0,0,0,0.3); transition:all 0.3s ease; display:none; max-width:90%; text-align:center;';
        document.body.appendChild(resultDiv);
    }

    var isError = message.indexOf('⚠️') !== -1 || message.indexOf('❌') !== -1;
    resultDiv.style.background = isError ? '#ef4444' : '#2E7D32';
    resultDiv.textContent = message;
    resultDiv.style.display = 'block';

    clearTimeout(window._voiceResultTimeout);
    window._voiceResultTimeout = setTimeout(function() {
        resultDiv.style.display = 'none';
    }, 2000);
}

// ==================== RECHERCHE VOCALE CONTINUE ====================
function posToggleVoiceSearch() {
    var support = checkVoiceSupport();
    if (!support.supported) {
        alert('⚠️ ' + support.reason);
        return;
    }
    if (!navigator.onLine) {
        alert('⚠️ La recherche vocale nécessite une connexion internet.');
        return;
    }
    var micBtn = document.getElementById('posMicBtn');
    if (isRecording) {
        posStopVoiceSearch();
        return;
    }
    requestMicrophonePermission().then(hasPermission => {
        if (!hasPermission) {
            alert('❌ Accès au microphone refusé.');
            return;
        }
        posStartVoiceRecording();
    });
}

function posStartVoiceRecording() {
    var micBtn = document.getElementById('posMicBtn');
    var searchInput = document.getElementById('posSearchInput');

    if (voiceRecognition) {
        try { voiceRecognition.abort(); } catch(e) {}
        voiceRecognition = null;
    }

    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('❌ Reconnaissance vocale non disponible.');
        return;
    }

    voiceRecognition = new SpeechRecognition();
    voiceRecognition.lang = 'fr-FR';
    voiceRecognition.continuous = true;
    voiceRecognition.interimResults = true;
    voiceRecognition.maxAlternatives = 5;

    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
        voiceRecognition.continuous = true;
        voiceRecognition.interimResults = true;
    }

    if (micBtn) {
        micBtn.classList.add('recording');
        micBtn.innerHTML = '<i class="fas fa-circle" style="color:#ef4444; animation: pulse 0.5s ease-in-out infinite;"></i>';
        micBtn.style.background = '#fee2e2';
        micBtn.style.borderColor = '#ef4444';
        micBtn.style.boxShadow = '0 0 0 4px rgba(239, 68, 68, 0.3)';
        micBtn.style.transform = 'scale(0.95)';
        micBtn.style.border = '3px solid #ef4444';
    }

    if (searchInput) {
        searchInput.placeholder = '🎤 Écoute continue...';
        searchInput.style.background = '#fef2f2';
        searchInput.style.borderColor = '#ef4444';
        searchInput.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.2)';
        searchInput.style.border = '2px solid #ef4444';
    }

    var style = document.getElementById('voiceStyle');
    if (!style) {
        style = document.createElement('style');
        style.id = 'voiceStyle';
        document.head.appendChild(style);
    }
    style.textContent = `
        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.2; transform: scale(1.3); }
        }
        .recording .fa-circle { animation: pulse 0.5s ease-in-out infinite !important; }
    `;

    var finalTranscript = '';
    var lastInterim = '';
    var processing = false;

    voiceRecognition.onresult = function(event) {
        var interimTranscript = '';
        var finalTranscriptTemp = '';

        for (var i = event.resultIndex; i < event.results.length; i++) {
            var transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscriptTemp += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        if (searchInput) {
            if (finalTranscriptTemp) {
                searchInput.value = finalTranscriptTemp;
                finalTranscript = finalTranscriptTemp;
                if (!processing) {
                    processing = true;
                    var command = parseVoiceCommand(finalTranscript);
                    if (command.type !== 'ignore') {
                        handleVoiceCommand(command);
                    }
                    processing = false;
                }
            } else if (interimTranscript && interimTranscript !== lastInterim) {
                searchInput.value = interimTranscript + ' ✍️';
                lastInterim = interimTranscript;
            }
        }
    };

    voiceRecognition.onend = function() {
        if (isRecording) {
            console.log('🔄 Redémarrage du micro...');
            try {
                voiceRecognition.start();
            } catch(e) {
                console.error('❌ Erreur redémarrage:', e);
                posStopVoiceSearch();
            }
        }
    };

    voiceRecognition.onerror = function(event) {
        console.error('🎤 Erreur :', event.error);
        if (event.error === 'aborted' || event.error === 'no-speech') {
            return;
        }
        if (event.error !== 'aborted') {
            alert('Erreur de reconnaissance: ' + event.error + '. Le micro va redémarrer.');
        }
        posStopVoiceSearch();
    };

    try {
        voiceRecognition.start();
        isRecording = true;
        showVoiceModeIndicator();
        console.log('🎤 Micro activé (écoute continue)');
    } catch(e) {
        console.error('Erreur démarrage:', e);
        isRecording = false;
        if (micBtn) {
            micBtn.classList.remove('recording');
            micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            micBtn.style.background = '#dcfce7';
            micBtn.style.borderColor = '#16a34a';
            micBtn.style.boxShadow = 'none';
            micBtn.style.transform = 'scale(1)';
            micBtn.style.border = '3px solid #16a34a';
        }
        if (searchInput) {
            searchInput.placeholder = '🔍 Rechercher...';
            searchInput.style.background = '#fff';
            searchInput.style.borderColor = '#e2e8f0';
            searchInput.style.boxShadow = 'none';
            searchInput.style.border = '2px solid #e2e8f0';
        }
    }
}

function posStopVoiceSearch() {
    if (voiceRecognition) {
        try {
            voiceRecognition.abort();
        } catch(e) {}
        voiceRecognition = null;
    }
    isRecording = false;

    var micBtn = document.getElementById('posMicBtn');
    var searchInput = document.getElementById('posSearchInput');

    if (micBtn) {
        micBtn.classList.remove('recording');
        micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        micBtn.style.background = '#dcfce7';
        micBtn.style.borderColor = '#16a34a';
        micBtn.style.boxShadow = 'none';
        micBtn.style.transform = 'scale(1)';
        micBtn.style.border = '3px solid #16a34a';
    }
    if (searchInput) {
        searchInput.placeholder = '🔍 Rechercher...';
        searchInput.style.background = '#fff';
        searchInput.style.borderColor = '#e2e8f0';
        searchInput.style.boxShadow = 'none';
        searchInput.style.border = '2px solid #e2e8f0';
    }

    var styleEl = document.getElementById('voiceStyle');
    if (styleEl) styleEl.remove();
    var indicator = document.getElementById('voiceModeIndicator');
    if (indicator) indicator.remove();
}

// ========== CHARGEMENT DES COMMANDES TABLES ==========
async function posChargerCommandesTables() {
    try {
        var snap = await db.collection('commandes')
            .where('statut', '==', 'en_attente')
            .where('source', '==', 'menu_tactile')
            .get();
        posCommandesTables = [];
        snap.forEach(function(doc) {
            var data = doc.data();
            data.id = doc.id;
            posCommandesTables.push(data);
        });
        posCommandesTables.sort((a, b) => {
            let da = a.createdAt?.seconds || 0;
            let db = b.createdAt?.seconds || 0;
            return db - da;
        });
        posCommandesTablesCount = posCommandesTables.length;
    } catch(e) {
        console.error('Erreur chargement commandes tables', e);
        posCommandesTablesCount = 0;
    }
}

// ========== CHARGEMENT DES COMMANDES EN LIGNE ==========
async function posChargerCommandesEnLigneCount() {
    try {
        var snap = await db.collection('commandes')
            .where('statut', '==', 'en_attente')
            .where('source', '==', 'client')
            .get();
        posCommandesEnLigneCount = snap.size;
        console.log('🛒 Commandes en ligne :', posCommandesEnLigneCount);
    } catch(e) {
        console.warn('Fallback chargement commandes en ligne', e);
        try {
            var allSnap = await db.collection('commandes').get();
            let count = 0;
            allSnap.forEach(doc => {
                const data = doc.data();
                if (data.statut === 'en_attente' && data.source === 'client') count++;
            });
            posCommandesEnLigneCount = count;
            console.log('🛒 Commandes en ligne (fallback) :', posCommandesEnLigneCount);
        } catch(err) {
            console.error('Erreur fallback', err);
            posCommandesEnLigneCount = 0;
        }
    }
}

// ========== TRI ET FILTRE DES COMMANDES TABLES ==========
function posTriCommandesTables(field) {
    if (posCommandesSortField === field) {
        posCommandesSortOrder = posCommandesSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        posCommandesSortField = field;
        posCommandesSortOrder = 'asc';
    }
    posAfficherCommandesTables();
}

function posApplyCommandesFilter(value) {
    posCommandesFilterText = value;
    posAfficherCommandesTables();
}

function posAfficherCommandesTables() {
    if (posCommandesTables.length === 0) {
        alert('Aucune commande table en attente.');
        return;
    }

    let filteredData = posCommandesTables.slice();
    if (posCommandesFilterText.trim() !== '') {
        const q = posCommandesFilterText.toLowerCase().trim();
        filteredData = filteredData.filter(cmd => {
            if ((cmd.table || '').toLowerCase().includes(q)) return true;
            if (cmd.items && cmd.items.some(item => (item.nom || '').toLowerCase().includes(q))) return true;
            if (cmd.items && cmd.items.some(item => {
                const opts = [];
                if (item.interdits) opts.push(...item.interdits);
                if (item.epice && item.epice !== 'Normal') opts.push(item.epice);
                if (item.sel && item.sel !== 'Normal') opts.push(item.sel);
                return opts.some(opt => opt.toLowerCase().includes(q));
            })) return true;
            return false;
        });
    }

    filteredData.sort((a, b) => {
        let valA, valB;
        switch (posCommandesSortField) {
            case 'table':
                valA = (a.table || '').toLowerCase();
                valB = (b.table || '').toLowerCase();
                break;
            case 'total':
                valA = a.total || 0;
                valB = b.total || 0;
                break;
            case 'createdAt':
                valA = a.createdAt?.seconds || 0;
                valB = b.createdAt?.seconds || 0;
                break;
            default:
                valA = 0;
                valB = 0;
        }
        if (valA < valB) return posCommandesSortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return posCommandesSortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    function renderSortableHeader(label, field) {
        let icon = '';
        if (posCommandesSortField === field) {
            icon = posCommandesSortOrder === 'asc' ? ' ▲' : ' ▼';
        }
        return `<th style="cursor:pointer;" onclick="posTriCommandesTables('${field}')">${label}${icon}</th>`;
    }

    var html = `
    <div style="margin-bottom:12px; display:flex; gap:8px; align-items:center;">
        <input type="text" id="posCmdFilterInput" placeholder="🔍 Filtrer (table, produit, option)..."
        style="flex:1; padding:8px 12px; border:2px solid #e2e8f0; border-radius:30px; font-size:0.8rem;"
        value="${escapeHtml(posCommandesFilterText)}"
        onkeyup="posApplyCommandesFilter(this.value)">
        <button class="btn-add" onclick="posApplyCommandesFilter('')" style="padding:6px 14px; font-size:0.7rem;">❌ Réinitialiser</button>
    </div>
    <div style="max-height:60vh; overflow-y:auto;">
    <table class="data-table" style="width:100%; font-size:0.7rem;">
    <thead><tr>
        ${renderSortableHeader('Table', 'table')}
        <th>Produits</th>
        <th>Options</th>
        ${renderSortableHeader('Total', 'total')}
        ${renderSortableHeader('Date/Heure', 'createdAt')}
        <th>Actions</th>
    </tr></thead>
    <tbody>`;

    if (filteredData.length === 0) {
        html += '<tr><td colspan="6" style="text-align:center; padding:20px;">Aucune commande correspondante</td></tr>';
    } else {
        filteredData.forEach(function(cmd) {
            var table = cmd.table || '?';
            var dateHeure = cmd.createdAt ? new Date(cmd.createdAt.seconds * 1000).toLocaleString('fr-FR') : 'N/A';
            var produits = cmd.items ? cmd.items.map(function(it) {
                return '<strong>' + it.quantite + 'x</strong> ' + escapeHtml(it.nom);
            }).join('<br>') : '-';
            var options = cmd.items ? cmd.items.map(function(it) {
                var opts = [];
                if (it.interdits && it.interdits.length > 0) opts.push('<span style="color:#ef4444;">🚫 ' + escapeHtml(it.interdits.join(', ')) + '</span>');
                if (it.epice && it.epice !== 'Normal') opts.push('<span style="color:#d97706;">🌶️ ' + escapeHtml(it.epice) + '</span>');
                if (it.sel && it.sel !== 'Normal') opts.push('<span style="color:#4f46e5;">🧂 ' + escapeHtml(it.sel) + '</span>');
                return opts.length > 0 ? opts.join(' | ') : '<span style="color:#94a3b8;">-</span>';
            }).join('<br>') : '<span style="color:#94a3b8;">-</span>';

            html += '<tr>';
            html += '<td><strong>🍽️ ' + escapeHtml(table) + '</strong></td>';
            html += '<td>' + produits + '</td>';
            html += '<td><small>' + options + '</small></td>';
            html += '<td><strong style="color:#2E7D32;">' + cmd.total.toFixed(2) + ' MAD</strong></td>';
            html += '<td><small>' + dateHeure + '</small></td>';
            html += '<td style="white-space:nowrap;">' +
                '<button class="btn-add" style="padding:3px 6px;font-size:0.65rem;margin-right:3px;" onclick="posChargerCommandeTable(\'' + cmd.id + '\')"><i class="fas fa-check"></i> Accepter</button>' +
                '<button class="btn-save" style="padding:3px 6px;font-size:0.65rem;" onclick="posPayerCommandeTable(\'' + cmd.id + '\')"><i class="fas fa-money-bill-wave"></i> Payé</button>' +
                '</td>';
            html += '</tr>';
        });
    }

    html += '</tbody></table></div>';
    openModal('🛎️ Commandes tables en attente (' + filteredData.length + ')', html);
    setTimeout(function() {
        var modal = document.getElementById('modalOverlay');
        if (modal) modal.classList.add('modal-wide');
    }, 50);
}

function posChargerCommandeTable(commandeId) {
    var cmd = posCommandesTables.find(function(c) { return c.id === commandeId; });
    if (!cmd) return;
    posCart = [];
    var enrichedItems = posEnrichirItemsAvecPrixAchat(cmd.items);
    enrichedItems.forEach(function(item) {
        posCart.push({
            id: item.id, nom: item.nom,
            prixUnitaire: item.prixUnitaire || item.prixVente || 0,
            prixAchat: item.prixAchat || 0, prixPromo: item.prixPromo || 0,
            prixVente: item.prixVente || item.prixUnitaire || 0,
            quantite: item.quantite || 1,
            categorie: item.categorie || '', imageBase64: item.imageBase64 || '',
            sauces: [], interdits: item.interdits || [],
            epice: item.epice || 'Normal', sel: item.sel || 'Normal'
        });
    });
    posCurrentTable = 'Table ' + (cmd.table || '?');
    posCurrentClient = null;
    posPaymentMethod = 'espece';
    posDiscountMAD = 0;
    window.posCommandeId = commandeId;
    closeModal();
    posStep = 2;
    renderPOS();
}

async function posPayerCommandeTable(commandeId) {
    if (!confirm('Marquer cette commande comme payée ?')) return;
    try {
        await CacheDB.write('commandes', commandeId, { statut: 'payé', paidAt: firebase.firestore.FieldValue.serverTimestamp() }, 'update');
        alert('✅ Commande table marquée comme payée !');
        await posChargerCommandesTables();
        closeModal();
        renderPOS();
        CacheDB.sync();
    } catch(e) { alert('❌ Erreur: ' + e.message); }
}

// ==================== POS RESET CART ====================
function posResetCart() {
    posCart = [];
    posStep = 1;
    posSelectedCategory = 'all';
    posCurrentClient = null;
    posCurrentTable = '';
    posPaymentMethod = 'espece';
    posAmountGiven = 0;
    posDiscountMAD = 0;
    posSearchQuery = '';
    posFilteredClients = posAllClients.slice();
    
    setVoiceMode('search', '🎤 Recherche vocale active', null);
    
    delete window.posCommandeId;
    delete window.posVenteId;
    
    var searchInput = document.getElementById('posSearchInput');
    if (searchInput) searchInput.value = '';
    
    if (voiceRecognition) {
        try { voiceRecognition.abort(); } catch(e) {}
        voiceRecognition = null;
        isRecording = false;
    }
    if (voiceTimeout) {
        clearTimeout(voiceTimeout);
        voiceTimeout = null;
    }
    
    var micBtn = document.getElementById('posMicBtn');
    if (micBtn) {
        micBtn.classList.remove('recording');
        micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        micBtn.style.background = '#dcfce7';
        micBtn.style.borderColor = '#16a34a';
        micBtn.style.boxShadow = 'none';
        micBtn.style.transform = 'scale(1)';
        micBtn.style.border = '3px solid #16a34a';
    }
    
    var styleEl = document.getElementById('voiceStyle');
    if (styleEl) styleEl.remove();
    var indicator = document.getElementById('voiceModeIndicator');
    if (indicator) indicator.remove();
}

function posSearchClient(query) {
    var q = query.toLowerCase().trim(); posCurrentClient = null;
    if (!q) {
        posFilteredClients = posAllClients.slice();
        var d = document.getElementById('posClientDropdown'); if(d) d.style.display='none';
    } else {
        posFilteredClients = posAllClients.filter(function(c) {
            return (c.nom||'').toLowerCase().indexOf(q)!==-1 || (c.prenom||'').toLowerCase().indexOf(q)!==-1 || (c.telephone||'').toLowerCase().indexOf(q)!==-1;
        });
        renderClientDropdown();
    }
}

function renderClientDropdown() {
    var d = document.getElementById('posClientDropdown');
    if(!d) return;
    var h = '';
    if(posFilteredClients.length === 0) {
        h = '<div style="padding:8px;color:#94a3b8;text-align:center;">Aucun</div>';
    } else {
        posFilteredClients.forEach(function(c) {
            h += '<div onclick="posSelectClientFromDropdown(\'' + c.id + '\',\'' + escapeHtml(c.nom) + ' ' + escapeHtml(c.prenom) + '\')" style="padding:8px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:0.85rem;">' + escapeHtml(c.nom) + ' ' + escapeHtml(c.prenom) + ' <span style="color:#94a3b8;font-size:0.65rem;">(' + (c.telephone||'') + ')</span></div>';
        });
    }
    d.innerHTML = h;
    d.style.display = 'block';
}

function posSelectClientFromDropdown(cid, cn) {
    posCurrentClient = {id: cid, name: cn};
    posCurrentTable = '';
    var s = document.getElementById('posClientSearchInput'),
        t = document.getElementById('posTableNum'),
        d = document.getElementById('posClientDropdown');
    if(s) s.value = cn;
    if(t) t.value = '';
    if(d) d.style.display = 'none';
    updatePaymentButtons();
    setVoiceMode('payment', '🎤 Dites le montant, "valide" ou mode paiement', null);
    renderPOS();
}

document.addEventListener('click', function(e) {
    var d = document.getElementById('posClientDropdown'),
        s = document.getElementById('posClientSearchInput');
    if(d && s && !s.contains(e.target) && !d.contains(e.target)) d.style.display = 'none';
});

function updatePaymentButtons() {
    setTimeout(function() {
        var cb = document.getElementById('posCreditBtn'),
            pb = document.getElementById('posPartielBtn'),
            cc = posCurrentClient && posCurrentClient.id;
        if(cb) {
            cb.disabled = !cc;
            cb.style.opacity = cc ? '1' : '0.4';
            cb.style.cursor = cc ? 'pointer' : 'not-allowed';
        }
        if(pb) {
            pb.disabled = !cc;
            pb.style.opacity = cc ? '1' : '0.4';
            pb.style.cursor = cc ? 'pointer' : 'not-allowed';
        }
    }, 300);
}

function posSetTable(v) {
    posCurrentTable = v.trim();
    if(posCurrentTable) {
        posCurrentClient = null;
        posPaymentMethod = 'espece';
        var s = document.getElementById('posClientSearchInput');
        if(s) s.value = '';
    }
}

// ==================== AJOUT AU PANIER ====================
function posAddToCartOrOpenOptions(pid) {
    var p = posProductsList.find(function(x) { return x.id === pid; });
    if (!p) return;
    if (p.stock !== undefined && p.stock <= 0) {
        alert('Rupture de stock');
        return;
    }
    var cat = posCategoriesList.find(function(c) { return c.nom === p.categorie; });
    var isRecette = cat && cat.recette === true;

    if (isRecette) {
        posCurrentProductId = pid;
        posOpenOptionsModal(pid);
    } else {
        var existing = posCart.find(function(x) { return x.id === pid; });
        if (existing) {
            if (p.stock !== undefined && existing.quantite >= p.stock) {
                alert('Stock insuffisant');
                return;
            }
            existing.quantite += 1;
        } else {
            var pr = p.prixPromo && p.prixPromo > 0 ? p.prixPromo : p.prixVente;
            posCart.push({
                id: p.id, nom: p.nom, prixUnitaire: pr,
                prixAchat: p.prixAchat || 0, prixPromo: p.prixPromo || 0,
                prixVente: p.prixVente || 0, quantite: 1,
                categorie: p.categorie || '', imageBase64: p.imageBase64 || '',
                sauces: [], interdits: [], epice: 'Normal', sel: 'Normal'
            });
            lastAddedProductId = p.id;
        }
        setVoiceMode('quantity', '🎤 Dites un nombre, "passe" ou "valide"', lastAddedProductId);
        updateCartOnly();
        showVoiceModeIndicator();
    }
}

async function posOpenOptionsModal(pid) {
    var p = posProductsList.find(function(x) { return x.id === pid; });
    if (!p) return;
    if (p.stock !== undefined && p.stock <= 0) { alert('Rupture'); return; }

    if (typeof allStockData === 'undefined' || allStockData.length === 0) {
        try {
            const snap = await db.collection('stock').orderBy('nom').get();
            allStockData = [];
            snap.forEach(d => { let dd = d.data(); dd.id = d.id; allStockData.push(dd); });
        } catch(e) { console.error(e); }
    }

    try {
        const doc = await db.collection('products').doc(pid).get();
        if (doc.exists) {
            var productData = doc.data();
            posCurrentProductIngredients = productData.ingredients || [];
        } else {
            posCurrentProductIngredients = [];
        }
    } catch(e) {
        posCurrentProductIngredients = [];
    }

    var grouped = {};
    posCurrentProductIngredients.forEach(function(ing) {
        var stockItem = allStockData.find(function(s) { return s.id === ing.idStock; });
        var cat = stockItem ? stockItem.categorie : 'Autre';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(ing.nom);
    });

    var order = ['Sauces', 'Légumes', 'Fruits', 'Viande', 'Poulet', 'Poisson'];
    var sortedCats = Object.keys(grouped).sort(function(a, b) {
        var idxA = order.indexOf(a), idxB = order.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });

    posCurrentProductId = pid;
    var h = '<h4>' + escapeHtml(p.nom) + '</h4>';

    if (sortedCats.length === 0) {
        h += '<div style="margin-bottom:10px;color:#94a3b8;font-size:0.8rem;">Aucun ingrédient à exclure</div>';
    } else {
        sortedCats.forEach(function(cat) {
            h += '<div style="margin-bottom:10px;">';
            h += '<label style="font-weight:600;font-size:0.8rem;">🥫 ' + escapeHtml(cat) + '</label>';
            h += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
            grouped[cat].forEach(function(ingredient) {
                h += '<label style="display:flex;align-items:center;gap:3px;padding:4px 6px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.7rem;">';
                h += '<input type="checkbox" class="pos-interdit-check" value="' + escapeHtml(ingredient) + '"> ' + escapeHtml(ingredient);
                h += '</label>';
            });
            h += '</div></div>';
        });
    }

    h += '<div style="margin-bottom:10px;"><label style="font-weight:600;font-size:0.8rem;">🌶️ Épices:</label><div style="display:flex;flex-wrap:wrap;gap:4px;">';
    posEpicesList.forEach(function(s, idx) {
        h += '<label style="display:flex;align-items:center;gap:3px;padding:4px 6px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.7rem;"><input type="radio" name="pos-epice" value="' + s + '" ' + (idx === 0 ? 'checked' : '') + '> ' + s + '</label>';
    });
    h += '</div></div>';
    h += '<div style="margin-bottom:10px;"><label style="font-weight:600;font-size:0.8rem;">🧂 Sel:</label><div style="display:flex;flex-wrap:wrap;gap:4px;">';
    posSelList.forEach(function(s, idx) {
        h += '<label style="display:flex;align-items:center;gap:3px;padding:4px 6px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.7rem;"><input type="radio" name="pos-sel" value="' + s + '" ' + (idx === 0 ? 'checked' : '') + '> ' + s + '</label>';
    });
    h += '</div></div>';

    h += '<div style="text-align:right;"><button class="btn-cancel" onclick="closeModal()" style="font-size:0.85rem;padding:8px 18px;float:none;margin-right:8px;">Annuler</button><button class="btn-save" onclick="posConfirmOptions()" style="font-size:0.85rem;padding:8px 18px;float:none;">Ajouter</button></div>';
    openModal('Personnaliser', h);
}

function posConfirmOptions() {
    var interdits = []; document.querySelectorAll('.pos-interdit-check:checked').forEach(function(cb) { interdits.push(cb.value); });
    var epice = document.querySelector('input[name="pos-epice"]:checked'); epice = epice ? epice.value : 'Normal';
    var sel = document.querySelector('input[name="pos-sel"]:checked'); sel = sel ? sel.value : 'Normal';
    var p = posProductsList.find(function(x) { return x.id === posCurrentProductId; });
    if (!p) { closeModal(); return; }
    var ex = posCart.find(function(x) { return x.id === posCurrentProductId; });
    if (ex) {
        if (p.stock !== undefined && ex.quantite >= p.stock) { alert('Stock insuffisant'); closeModal(); return; }
        ex.quantite += 1;
    } else {
        var pr = p.prixPromo && p.prixPromo > 0 ? p.prixPromo : p.prixVente;
        posCart.push({
            id: p.id, nom: p.nom, prixUnitaire: pr,
            prixAchat: p.prixAchat || 0, prixPromo: p.prixPromo || 0,
            prixVente: p.prixVente || 0, quantite: 1,
            categorie: p.categorie || '', imageBase64: p.imageBase64 || '',
            sauces: [],
            interdits: interdits,
            epice: epice, sel: sel
        });
        lastAddedProductId = p.id;
    }
    setVoiceMode('quantity', '🎤 Dites un nombre, "passe" ou "valide"', lastAddedProductId);
    closeModal();
    updateCartOnly();
    showVoiceModeIndicator();
}

// ==================== MISE À JOUR CIBLÉE DU PANIER ====================
function updateCartOnly() {
    var cartItems = document.querySelector('.pos-cart-items');
    if (!cartItems) return;
    var html = '';
    if (posCart.length === 0) {
        html = '<div class="pos-cart-empty"><i class="fas fa-shopping-basket"></i><p>Panier vide</p></div>';
    } else {
        for (var k = 0; k < posCart.length; k++) {
            var it = posCart[k];
            var opts = '';
            if (it.interdits && it.interdits.length > 0) opts += ' <span style="color:#ef4444;font-size:0.6rem;">🚫' + escapeHtml(it.interdits.join(',')) + '</span>';
            if (it.epice && it.epice !== 'Normal') opts += ' <span style="color:#d97706;font-size:0.6rem;">🌶️' + escapeHtml(it.epice) + '</span>';
            if (it.sel && it.sel !== 'Normal') opts += ' <span style="color:#4f46e5;font-size:0.6rem;">🧂' + escapeHtml(it.sel) + '</span>';
            html += '<div class="pos-cart-item"><div class="pos-cart-item-info"><span class="pos-cart-item-name">' + escapeHtml(it.nom) + opts + '</span><span class="pos-cart-item-price">' + it.prixUnitaire.toFixed(2) + ' MAD/u</span></div><div class="pos-cart-item-actions"><button class="pos-qty-btn" onclick="posUpdateQty(' + k + ',-1)"><i class="fas fa-minus"></i></button><span class="pos-qty-value">' + it.quantite + '</span><button class="pos-qty-btn" onclick="posUpdateQty(' + k + ',1)"><i class="fas fa-plus"></i></button><button class="pos-remove-btn" onclick="posRemoveItem(' + k + ')"><i class="fas fa-times"></i></button></div><span class="pos-cart-item-total">' + (it.prixUnitaire * it.quantite).toFixed(2) + ' MAD</span></div>';
        }
    }
    cartItems.innerHTML = html;
    var badge = document.querySelector('.pos-cart-badge');
    if (badge) badge.textContent = posCart.length;
    var totalRow = document.querySelector('.pos-cart-total-row span:last-child');
    if (totalRow) {
        var st = posCalculateTotal();
        var t = st - posDiscountMAD;
        totalRow.textContent = t.toFixed(2) + ' MAD';
    }
    var validateBtn = document.querySelector('.pos-validate-btn');
    if (validateBtn) {
        validateBtn.disabled = posCart.length === 0;
    }
}

// ==================== NUMÉRO DE FACTURE (LOCAL) ====================
function getNextFactureNum() {
    factureCounter = parseInt(localStorage.getItem('factureCounter')) || 0;
    factureCounter++;
    localStorage.setItem('factureCounter', factureCounter);
    return 'FACT-' + new Date().getFullYear() + '-' + String(factureCounter).padStart(5, '0');
}

// ==================== RENDER POS OPTIMISÉ AVEC RESET ====================
function renderPOS() {
    var c = document.getElementById('dynamicContent'); 
    if (!c) return;

    if (posCart.length === 0 && posStep === 1) {
        var indicator = document.getElementById('voiceModeIndicator');
        if (indicator) indicator.remove();
        buildFullPOS(c);
        return;
    }

    if (document.querySelector('.pos-container') && posStep === 1 && posCart.length > 0) {
        updateCartOnly();
        filterProductGrid();
        var totalRow = document.querySelector('.pos-cart-total-row span:last-child');
        if (totalRow) {
            var st = posCalculateTotal();
            var t = st - posDiscountMAD;
            totalRow.textContent = t.toFixed(2) + ' MAD';
        }
        if (isRecording || voiceMode !== 'search') {
            showVoiceModeIndicator();
        }
        return;
    }

    buildFullPOS(c);
}

// ==================== CONSTRUCTION COMPLÈTE DU POS ====================
function buildFullPOS(c) {
    if (posProductsList.length === 0 && posCategoriesList.length === 0) {
        c.innerHTML = '<div style="text-align:center;padding:40px;">' +
            '<i class="fas fa-spinner fa-spin" style="font-size:2rem;color:#2E7D32;"></i>' +
            '<p style="margin-top:12px;">Chargement du POS...</p>' +
            '</div>';
        return;
    }

    var st = posCalculateTotal(); 
    var t = st - posDiscountMAD;
    var h = '<div class="pos-container"><div class="pos-products-panel">';

    // Barre de recherche + micro
    h += '<div style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;">';
    h += '<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">';
    h += '<div style="flex:1; min-width:160px; position:relative; display:flex; align-items:center; background:#fff; border:2px solid #e2e8f0; border-radius:40px; padding:2px 12px; transition:all 0.3s ease;">';
    h += '<i class="fas fa-search" style="color:#94a3b8; margin-right:6px; font-size:0.9rem;"></i>';
    h += '<input type="text" id="posSearchInput" placeholder="🔍 Rechercher..." value="' + escapeHtml(posSearchQuery) + '" ';
    h += 'onkeyup="posSearchProducts(this.value)" style="border:none; outline:none; padding:8px 0; width:100%; font-size:0.85rem; background:transparent;">';
    if (posSearchQuery) {
        h += '<button onclick="document.getElementById(\'posSearchInput\').value=\'\'; posSearchProducts(\'\');" style="background:none; border:none; color:#94a3b8; cursor:pointer; padding:2px 6px; font-size:0.9rem;">';
        h += '<i class="fas fa-times-circle"></i></button>';
    }
    h += '</div>';

    var support = checkVoiceSupport();
    var isSupported = support.supported;
    var isOnline = navigator.onLine;
    var isActive = isSupported && isOnline && !isIOSStandalone();

    h += '<button id="posMicBtn" title="' + (isActive ? 'Cliquez pour l\'écoute continue' : (isIOSStandalone() ? 'Ouvrir dans Safari' : 'Non disponible')) + '" style="background:' + (isActive ? '#dcfce7' : (isIOSStandalone() ? '#fef3c7' : '#e2e8f0')) + '; border:3px solid ' + (isActive ? '#16a34a' : (isIOSStandalone() ? '#f59e0b' : '#94a3b8')) + '; border-radius:50%; width:46px; height:46px; cursor:' + (isActive ? 'pointer' : (isIOSStandalone() ? 'pointer' : 'not-allowed')) + '; font-size:1.2rem; color:' + (isActive ? '#16a34a' : (isIOSStandalone() ? '#d97706' : '#94a3b8')) + '; transition:all 0.3s; display:flex; align-items:center; justify-content:center; user-select:none; touch-action:manipulation; flex-shrink:0; box-shadow:0 2px 8px rgba(0,0,0,0.08);"';
    h += ' onclick="' + (isActive ? 'posToggleVoiceSearch()' : (isIOSStandalone() ? 'window.open(window.location.href.split(\'?\')[0],\'_blank\')' : '')) + '"';
    h += '><i class="fas fa-' + (isActive ? (isRecording ? 'circle' : 'microphone') : (isIOSStandalone() ? 'exclamation-triangle' : 'microphone-slash')) + '" style="' + (isRecording ? 'color:#ef4444; animation: pulse 0.5s ease-in-out infinite;' : '') + '"></i></button>';

    // Boutons Tables et En ligne
    h += '<div style="display:flex; gap:4px; flex-wrap:wrap;">';
    h += '<button onclick="posAfficherCommandesTables()" style="position:relative; background:#fff; border:2px solid #e2e8f0; border-radius:50px; padding:5px 12px; cursor:pointer; font-weight:600; font-size:0.7rem; color:#1e293b; display:flex; align-items:center; gap:4px; white-space:nowrap;">';
    h += '<i class="fas fa-utensils"></i> Tables';
    h += '<span style="background:#ef4444; color:#fff; border-radius:20px; padding:1px 6px; font-size:0.55rem; margin-left:2px;">' + posCommandesTablesCount + '</span>';
    h += '</button>';
    h += '<button onclick="navigateTo(\'commandes\')" style="position:relative; background:#fff; border:2px solid #e2e8f0; border-radius:50px; padding:5px 12px; cursor:pointer; font-weight:600; font-size:0.7rem; color:#1e293b; display:flex; align-items:center; gap:4px; white-space:nowrap;">';
    h += '<i class="fas fa-globe"></i> En ligne';
    h += '<span style="background:#ef4444; color:#fff; border-radius:20px; padding:1px 6px; font-size:0.55rem; margin-left:2px;">' + posCommandesEnLigneCount + '</span>';
    h += '</button>';
    h += '</div>';
    h += '</div>';

    // Catégories
    h += '<div class="pos-categories-bar" style="margin-bottom:6px;">';
    h += '<button class="pos-cat-btn ' + (posSelectedCategory === 'all' ? 'active' : '') + '" onclick="posFilterCategory(\'all\')"><i class="fas fa-th-large"></i> Tous</button>';
    for (var i = 0; i < posCategoriesList.length; i++) {
        var ca = posCategoriesList[i];
        var ac = posSelectedCategory === ca.nom ? 'active' : '';
        var ih = ca.imageBase64 ? '<img src="' + escapeHtml(ca.imageBase64) + '" alt="">' : '<i class="fas fa-folder"></i>';
        h += '<button class="pos-cat-btn ' + ac + '" onclick="posFilterCategory(\'' + escapeHtml(ca.nom).replace(/'/g, "\\'") + '\')">' + ih + ' ' + escapeHtml(ca.nom) + '</button>';
    }
    h += '</div>';
    h += '</div>';

    // Grille produits
    h += '<div class="pos-products-grid" id="posProductGrid">';
    h += '</div></div>';

    // ===== PANIER =====
    h += '<div class="pos-cart-panel">';
    if (posStep === 1) {
        h += '<div class="pos-cart-header"><h3><i class="fas fa-shopping-cart"></i> Panier <span class="pos-cart-badge">' + posCart.length + '</span></h3><button class="pos-clear-btn" onclick="posResetCart()"><i class="fas fa-trash-alt"></i> Vider</button></div><div class="pos-cart-items">';
        if (posCart.length === 0) { h += '<div class="pos-cart-empty"><i class="fas fa-shopping-basket"></i><p>Panier vide</p></div>'; }
        else {
            for (var k = 0; k < posCart.length; k++) {
                var it = posCart[k];
                var opts = '';
                if (it.interdits && it.interdits.length > 0) opts += ' <span style="color:#ef4444;font-size:0.6rem;">🚫' + escapeHtml(it.interdits.join(',')) + '</span>';
                if (it.epice && it.epice !== 'Normal') opts += ' <span style="color:#d97706;font-size:0.6rem;">🌶️' + escapeHtml(it.epice) + '</span>';
                if (it.sel && it.sel !== 'Normal') opts += ' <span style="color:#4f46e5;font-size:0.6rem;">🧂' + escapeHtml(it.sel) + '</span>';
                h += '<div class="pos-cart-item"><div class="pos-cart-item-info"><span class="pos-cart-item-name">' + escapeHtml(it.nom) + opts + '</span><span class="pos-cart-item-price">' + it.prixUnitaire.toFixed(2) + ' MAD/u</span></div><div class="pos-cart-item-actions"><button class="pos-qty-btn" onclick="posUpdateQty(' + k + ',-1)"><i class="fas fa-minus"></i></button><span class="pos-qty-value">' + it.quantite + '</span><button class="pos-qty-btn" onclick="posUpdateQty(' + k + ',1)"><i class="fas fa-plus"></i></button><button class="pos-remove-btn" onclick="posRemoveItem(' + k + ')"><i class="fas fa-times"></i></button></div><span class="pos-cart-item-total">' + (it.prixUnitaire * it.quantite).toFixed(2) + ' MAD</span></div>';
            }
        }
        h += '</div>';
        h += '<div style="padding:8px 0;display:flex;gap:8px;align-items:center;font-size:0.8rem;"><label>Remise (MAD):</label><input type="number" id="posDiscountMAD" value="' + posDiscountMAD + '" min="0" step="0.01" onchange="posUpdateDiscountMAD(this.value)" style="width:80px;padding:4px 8px;border:2px solid #e2e8f0;border-radius:6px;font-size:0.85rem;"></div>';
        h += '<div class="pos-cart-footer">';
        if (posDiscountMAD > 0) h += '<div style="display:flex;justify-content:space-between;font-size:0.8rem;"><span>Sous-total</span><span>' + st.toFixed(2) + '</span></div><div style="display:flex;justify-content:space-between;font-size:0.8rem;color:#ef4444;"><span>Remise</span><span>-' + posDiscountMAD.toFixed(2) + '</span></div>';
        h += '<div class="pos-cart-total-row"><span>Total</span><span>' + t.toFixed(2) + ' MAD</span></div><button class="pos-validate-btn" onclick="posGoToStep2()" ' + (posCart.length === 0 ? 'disabled' : '') + '><i class="fas fa-check-circle"></i> Valider</button></div>';
    } else if (posStep === 2) {
        var canCredit = posCurrentClient && posCurrentClient.id;
        h += '<div class="pos-cart-header"><h3><i class="fas fa-credit-card"></i> Paiement</h3><button class="pos-back-btn" onclick="posGoToStep1()"><i class="fas fa-arrow-left"></i> Retour</button></div>';
        h += '<div class="pos-payment-form" style="display:flex; flex-direction:column; gap:6px; padding:0; overflow:hidden;">';
        h += '<div class="pos-payment-section" style="margin-bottom:4px;"><label style="font-size:0.75rem; margin-bottom:2px;">Client</label><div style="position:relative;"><input type="text" id="posClientSearchInput" placeholder="🔍 Cliquez et tapez..." onkeyup="posSearchClient(this.value)" onfocus="if(this.value)posSearchClient(this.value)" autocomplete="off" value="' + (posCurrentClient ? escapeHtml(posCurrentClient.name) : '') + '" style="width:100%;padding:8px 12px;border:2px solid #e2e8f0;border-radius:8px;font-size:0.85rem;"><div id="posClientDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:2px solid #e2e8f0;border-radius:0 0 8px 8px;max-height:150px;overflow-y:auto;z-index:50;box-shadow:0 5px 15px rgba(0,0,0,0.1);"></div></div></div>';
        h += '<div class="pos-or-divider" style="margin:2px 0;font-size:0.7rem;">— OU —</div>';
        h += '<div class="pos-payment-section" style="margin-bottom:4px;"><label style="font-size:0.75rem; margin-bottom:2px;">Table</label><input type="text" id="posTableNum" value="' + escapeHtml(posCurrentTable) + '" onchange="posSetTable(this.value)" style="width:100%;padding:8px 12px;border:2px solid #e2e8f0;border-radius:8px;font-size:0.85rem;"></div>';
        h += '<div class="pos-payment-section" style="margin-bottom:4px;"><div class="pos-summary-box" style="padding:8px 12px;"><div class="pos-summary-row" style="font-size:0.8rem;margin-bottom:2px;"><span>Articles</span><span>' + posCart.length + '</span></div>';
        if (posDiscountMAD > 0) h += '<div class="pos-summary-row" style="font-size:0.8rem;margin-bottom:2px;color:#ef4444;"><span>Remise</span><span>-' + posDiscountMAD.toFixed(2) + '</span></div>';
        h += '<div class="pos-summary-total" style="font-size:1.1rem;margin-top:2px;"><span>Total</span><span>' + t.toFixed(2) + ' MAD</span></div></div></div>';
        h += '<div class="pos-payment-section" style="margin-bottom:4px;"><label style="font-size:0.75rem; margin-bottom:2px;">Vendeur</label><input type="text" id="posVendeur" value="' + (window.currentUserData ? escapeHtml(window.currentUserData.userData.prenom + ' ' + window.currentUserData.userData.nom) : '') + '" style="width:100%;padding:8px 12px;border:2px solid #e2e8f0;border-radius:8px;font-size:0.85rem;"></div>';
        h += '<div class="pos-payment-section" style="margin-bottom:4px;"><label style="font-size:0.75rem; margin-bottom:2px;">Paiement</label><div class="pos-payment-methods" style="gap:6px;"><button class="pos-payment-btn ' + (posPaymentMethod === 'espece' ? 'active' : '') + '" onclick="posSetPaymentMethod(\'espece\')" style="padding:6px 0;font-size:0.75rem;"><i class="fas fa-money-bill-wave"></i> Espèces</button><button class="pos-payment-btn ' + (posPaymentMethod === 'credit' ? 'active' : '') + '" onclick="posSetPaymentMethod(\'credit\')" id="posCreditBtn" ' + (canCredit ? '' : 'disabled style="opacity:0.4;cursor:not-allowed;"') + ' style="padding:6px 0;font-size:0.75rem;"><i class="fas fa-credit-card"></i> Crédit</button><button class="pos-payment-btn ' + (posPaymentMethod === 'partiel' ? 'active' : '') + '" onclick="posSetPaymentMethod(\'partiel\')" id="posPartielBtn" ' + (canCredit ? '' : 'disabled style="opacity:0.4;cursor:not-allowed;"') + ' style="padding:6px 0;font-size:0.75rem;"><i class="fas fa-hand-holding-usd"></i> Partiel</button></div></div>';
        if (posPaymentMethod === 'espece' || posPaymentMethod === 'partiel') {
            h += '<div class="pos-payment-section" style="margin-bottom:4px;"><label style="font-size:0.75rem; margin-bottom:2px;">Montant donné</label><input type="number" id="posAmountGiven" placeholder="0.00" value="' + (posAmountGiven > 0 ? posAmountGiven : '') + '" onkeyup="posCalculateChange()" style="width:100%;padding:8px 12px;border:2px solid #e2e8f0;border-radius:8px;font-size:0.9rem;"><div id="posChangeDisplay"></div></div>';
        }
        h += '<button class="pos-finalize-btn" onclick="posFinalizeSale()" style="padding:10px;font-size:0.9rem;margin-top:4px;"><i class="fas fa-check-circle"></i> Finaliser</button>';
        h += '</div>';
    }
    h += '</div></div>';
    c.innerHTML = h;

    filterProductGrid();
    if (posStep === 2) setTimeout(posCalculateChange, 200);
    
    if (isRecording || voiceMode !== 'search') {
        showVoiceModeIndicator();
    } else {
        var indicator = document.getElementById('voiceModeIndicator');
        if (indicator) indicator.remove();
    }
}

// ==================== FONCTIONS MÉTIER ====================
function posFilterCategory(ca) {
    posSelectedCategory = ca;
    var searchInput = document.getElementById('posSearchInput');
    if (searchInput) {
        posSearchQuery = searchInput.value.toLowerCase().trim();
    }
    filterProductGrid();
}

function posUpdateDiscountMAD(v) { posDiscountMAD = parseFloat(v) || 0; if (posDiscountMAD < 0) posDiscountMAD = 0; renderPOS(); }

function posUpdateQty(i, ch) {
    var it = posCart[i]; if (!it) return;
    var p = posProductsList.find(function(x) { return x.id === it.id; });
    var nq = it.quantite + ch;
    if (nq <= 0) posCart.splice(i, 1);
    else {
        if (p && p.stock !== undefined && nq > p.stock) { alert('Max: ' + p.stock); return; }
        it.quantite = nq;
    }
    updateCartOnly();
}

function posRemoveItem(i) { posCart.splice(i, 1); updateCartOnly(); }

function posCalculateTotal() {
    var t = 0;
    for (var i = 0; i < posCart.length; i++) t += posCart[i].prixUnitaire * posCart[i].quantite;
    return t;
}

function posGoToStep2() {
    if (posCart.length === 0) { alert('Panier vide'); return; }
    posStep = 2;
    renderPOS();
}

function posGoToStep1() {
    posStep = 1;
    delete window.posCommandeId;
    delete window.posVenteId;
    renderPOS();
}

function posSetPaymentMethod(m) {
    if ((m === 'credit' || m === 'partiel') && (!posCurrentClient || !posCurrentClient.id)) {
        alert('Client requis pour crédit/partiel.');
        return;
    }
    posPaymentMethod = m;
    posAmountGiven = 0;
    renderPOS();
}

function posCalculateChange() {
    var ai = document.getElementById('posAmountGiven'), cd = document.getElementById('posChangeDisplay');
    if (!ai || !cd) return;
    var st = posCalculateTotal();
    var t = st - posDiscountMAD;
    posAmountGiven = parseFloat(ai.value) || 0;
    var c = posAmountGiven - t;
    if (posAmountGiven > 0) {
        cd.innerHTML = c >= 0 ? '<div class="pos-change-positive"><span>Rendu</span><span>' + c.toFixed(2) + ' MAD</span></div>' : '<div class="pos-change-negative"><span>Manquant</span><span>' + Math.abs(c).toFixed(2) + ' MAD</span></div>';
    } else {
        cd.innerHTML = '';
    }
}

// ==================== FIDÉLITÉ ASYNCHRONE ====================
async function updateClientFidelityAsync(clientId, total, profitTotal) {
    try {
        if (!fideliteSettingsCache) {
            try {
                var fDoc = await db.collection('settings').doc('fidelite').get();
                fideliteSettingsCache = fDoc.exists ? fDoc.data() : { active: true, pointsParVente: 1 };
            } catch(e) {
                fideliteSettingsCache = { active: true, pointsParVente: 1 };
            }
        }
        if (!fideliteSettingsCache.active) return;
        var cr = await db.collection('clients').doc(clientId).get();
        if (!cr.exists) return;
        var cd = cr.data();
        var points = parseInt(fideliteSettingsCache.pointsParVente) || 1;
        await CacheDB.write('clients', clientId, {
            ca: (cd.ca || 0) + total,
            profit: (cd.profit || 0) + profitTotal,
            pointsFidelite: (cd.pointsFidelite || 0) + points,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, 'update');
        console.log('⭐ Fidélité: +' + points + ' points');
    } catch(e) { 
        console.warn('Erreur fidélité:', e); 
    }
}

// ==================== FINALISATION AVEC RESET COMPLET ====================
async function posFinalizeSale() {
    var st = posCalculateTotal(); 
    var t = st - posDiscountMAD;
    
    if (!posCurrentClient && !posCurrentTable) { alert('Client ou table requis.'); return; }
    if (posCurrentTable && (posPaymentMethod === 'credit' || posPaymentMethod === 'partiel')) { alert('Table = espèces uniquement.'); return; }
    if ((posPaymentMethod === 'credit' || posPaymentMethod === 'partiel') && !posCurrentClient) { alert('Client requis pour crédit/partiel.'); return; }
    if (posPaymentMethod === 'espece') { 
        posAmountGiven = parseFloat(document.getElementById('posAmountGiven').value) || 0; 
        if (posAmountGiven < t) { alert('Montant insuffisant.'); return; } 
    }
    
    var vendeur = document.getElementById('posVendeur').value.trim() || 
                  (window.currentUserData ? window.currentUserData.userData.prenom + ' ' + window.currentUserData.userData.nom : '');

    try {
        var fn = getNextFactureNum();

        var remaining = 0, paid = true, statutPaiement = 'payé', change = 0;
        if (posPaymentMethod === 'credit') { paid = false; remaining = t; statutPaiement = 'crédit'; }
        else if (posPaymentMethod === 'partiel') { posAmountGiven = parseFloat(document.getElementById('posAmountGiven').value) || 0; remaining = t - posAmountGiven; paid = false; statutPaiement = 'partiel'; change = Math.max(0, posAmountGiven - t); }
        else { posAmountGiven = parseFloat(document.getElementById('posAmountGiven').value) || 0; change = posAmountGiven - t; paid = true; statutPaiement = 'payé'; }
        if (posCurrentTable && !posCurrentClient) { paid = false; statutPaiement = 'en_attente'; remaining = t; }

        var profitTotal = 0;
        var itemsDetail = posCart.map(function(it) {
            var pa = it.prixAchat || 0, pvn = it.prixVente || 0, pp = it.prixPromo || 0, pvr = (pp > 0) ? pp : pvn;
            var prof = (pvr - pa) * it.quantite;
            profitTotal += prof;
            return { id: it.id, nom: it.nom, quantite: it.quantite, prixVente: pvr, prixAchat: pa, prixPromo: pp, profit: prof, sauces: [], interdits: it.interdits || [], epice: it.epice || 'Normal', sel: it.sel || 'Normal' };
        });

        var sd = {
            factureNum: fn, items: itemsDetail, subtotal: st, discountMAD: posDiscountMAD, total: t,
            clientId: posCurrentClient ? posCurrentClient.id : null,
            clientName: posCurrentClient ? posCurrentClient.name : null,
            table: posCurrentTable || null,
            vendeur: vendeur,
            paymentMethod: posPaymentMethod,
            statutPaiement: statutPaiement,
            amountGiven: posAmountGiven,
            change: change,
            paid: paid,
            remainingAmount: remaining,
            profitTotal: profitTotal,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        var batch = db.batch();
        var ventesRef = db.collection('ventes').doc();
        batch.set(ventesRef, sd);
        if (!paid) { var creditsRef = db.collection('credits').doc(); batch.set(creditsRef, sd); }
        if (window.posCommandeId) { var cmdRef = db.collection('commandes').doc(window.posCommandeId); batch.update(cmdRef, { statut: 'payé', paidAt: firebase.firestore.FieldValue.serverTimestamp(), factureNum: fn }); delete window.posCommandeId; }
        if (window.posVenteId) { var ventRef = db.collection('ventes').doc(window.posVenteId); batch.update(ventRef, { paid: true, statutPaiement: 'payé', remainingAmount: 0, paidAt: firebase.firestore.FieldValue.serverTimestamp() }); delete window.posVenteId; }
        for (var i = 0; i < posCart.length; i++) { var it = posCart[i]; var prodRef = db.collection('products').doc(it.id); batch.update(prodRef, { stock: firebase.firestore.FieldValue.increment(-it.quantite), vendues: firebase.firestore.FieldValue.increment(it.quantite), ca: firebase.firestore.FieldValue.increment(it.prixUnitaire * it.quantite) }); }
        await batch.commit();

        if (posCurrentClient && posCurrentClient.id && paid) {
            updateClientFidelityAsync(posCurrentClient.id, t, profitTotal);
        }

        var msg = '✅ Vente: ' + fn + '\n💰 Total: ' + t.toFixed(2) + ' MAD';
        if (posPaymentMethod === 'espece' && posAmountGiven > t) msg += '\n💵 Rendu: ' + change.toFixed(2) + ' MAD';
        if (statutPaiement === 'crédit') msg += '\n📋 Crédit enregistré.';
        if (statutPaiement === 'partiel') msg += '\n📋 Reste: ' + remaining.toFixed(2) + ' MAD';
        if (statutPaiement === 'en_attente') msg += '\n⏳ En attente de paiement.';
        alert(msg);

        // ⚡ RESET COMPLET
        posCart = [];
        posStep = 1;
        posSelectedCategory = 'all';
        posCurrentClient = null;
        posCurrentTable = '';
        posPaymentMethod = 'espece';
        posAmountGiven = 0;
        posDiscountMAD = 0;
        posSearchQuery = '';
        posFilteredClients = posAllClients.slice();
        setVoiceMode('search', '🎤 Recherche vocale active', null);
        delete window.posCommandeId;
        delete window.posVenteId;
        
        var searchInput = document.getElementById('posSearchInput');
        if (searchInput) searchInput.value = '';
        
        if (voiceRecognition) { try { voiceRecognition.abort(); } catch(e) {} voiceRecognition = null; isRecording = false; }
        if (voiceTimeout) { clearTimeout(voiceTimeout); voiceTimeout = null; }
        
        var micBtn = document.getElementById('posMicBtn');
        if (micBtn) {
            micBtn.classList.remove('recording');
            micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            micBtn.style.background = '#dcfce7';
            micBtn.style.borderColor = '#16a34a';
            micBtn.style.boxShadow = 'none';
            micBtn.style.transform = 'scale(1)';
            micBtn.style.border = '3px solid #16a34a';
        }
        
        var styleEl = document.getElementById('voiceStyle');
        if (styleEl) styleEl.remove();
        var indicator = document.getElementById('voiceModeIndicator');
        if (indicator) indicator.remove();

        renderPOS();

        if (navigator.onLine) {
            setTimeout(function() { CacheDB.sync().catch(function(e) {}); }, 500);
        }

    } catch(e) { alert('Erreur: ' + e.message); }
}

// ==================== RETOUR VERS LE POS ====================
function goBackToPOS() {
    if (window.currentUserData && (window.currentUserData.userData.role === 'caissier' || window.currentUserData.userData.role === 'admin')) {
        if (posCart.length > 0 && posStep === 1) {
            if (!confirm('⚠️ Vous avez ' + posCart.length + ' article(s) dans le panier. Voulez-vous les garder ?')) {
                posResetCart();
            }
        }
        navigateTo('pos');
    }
}

// ⚡ RACCOURCIS CLAVIER
document.addEventListener('keydown', function(event) {
    // Échap pour retourner au POS
    if (event.key === 'Escape') {
        var currentPage = document.getElementById('pageTitle')?.textContent || '';
        if (currentPage !== 'POS' && currentPage !== 'Dashboard' && currentPage !== '') {
            goBackToPOS();
        }
    }
    // Ctrl + P pour aller au POS
    if (event.ctrlKey && (event.key === 'p' || event.key === 'P')) {
        event.preventDefault();
        var currentPage = document.getElementById('pageTitle')?.textContent || '';
        if (currentPage !== 'POS') {
            navigateTo('pos');
            showVoiceResult('📋 Navigation vers le POS');
        }
    }
});

console.log('⚡ Mixmax Minimarket - POS COMPLET (point de vente → POS)');
