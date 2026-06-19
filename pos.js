// ==================== POS.JS - MIXMAX MINIMARKET (COMPLET - RECHERCHE VOCALE SANS AJOUT) ====================
var posCart = [], posStep = 1, posCategoriesList = [], posProductsList = [], posSelectedCategory = 'all';
var posCurrentClient = null, posCurrentTable = '', posPaymentMethod = 'espece', posAmountGiven = 0, posDiscountMAD = 0;
var posAllClients = [], posFilteredClients = [], posCurrentProductId = null;
var posSearchQuery = ''; // Variable pour la recherche de produits

// Commandes tables
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

// ==================== UTILITAIRE ÉCHAPPEMENT HTML ====================
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function posEnrichirItemsAvecPrixAchat(items) {
    return items.map(function(item) {
        var produit = posProductsList.find(function(p) { return p.id === item.id; });
        var prixAchat = (produit && produit.prixAchat != null) ? produit.prixAchat : (item.prixAchat || 0);
        return Object.assign({}, item, { prixAchat: prixAchat });
    });
}

async function loadPosPage(c) {
    posResetCart(); posStep = 1;
    posCommandesFilterText = '';
    posCommandesSortField = 'createdAt';
    posCommandesSortOrder = 'desc';
    posSearchQuery = '';

    // Forcer le chargement depuis Firestore
    posCategoriesList = [];
    posProductsList = [];
    posAllClients = [];
    posFilteredClients = [];
    
    // Afficher un message de chargement
    if (c) {
        c.innerHTML = '<div style="text-align:center;padding:60px;"><i class="fas fa-spinner fa-spin" style="font-size:2rem;color:#2E7D32;"></i><p style="margin-top:15px;">Chargement du POS...</p></div>';
    }

    try {
        const [cs, ps, cl] = await Promise.all([
            db.collection('categories').get(),
            db.collection('products').get(),
            db.collection('clients').limit(500).get()
        ]);
        
        // Catégories
        posCategoriesList = [];
        cs.forEach(d => {
            let cat = { id: d.id, nom: d.data().nom, imageBase64: d.data().imageBase64, recette: d.data().recette || false };
            posCategoriesList.push(cat);
            CacheDB.set('categories', d.id, cat);
        });
        
        // Produits
        posProductsList = [];
        ps.forEach(d => {
            const dd = d.data();
            if (dd.disponible !== false) {
                let prod = {
                    id: d.id, nom: dd.nom, prixVente: dd.prixVente||0, prixPromo: dd.prixPromo||0,
                    prixAchat: dd.prixAchat||0, stock: dd.stock, categorie: dd.categorie||'',
                    imageBase64: dd.imageBase64||''
                };
                posProductsList.push(prod);
                CacheDB.set('products', d.id, prod);
            }
        });
        
        // Clients
        posAllClients = [];
        cl.forEach(d => {
            let cli = { id: d.id, nom: d.data().nom, prenom: d.data().prenom, telephone: d.data().telephone };
            posAllClients.push(cli);
            CacheDB.set('clients', d.id, cli);
        });
        posFilteredClients = [...posAllClients];
        
    } catch(e) {
        console.error('Erreur chargement POS:', e);
        // Fallback vers le cache si Firestore échoue
        let cachedCategories = await CacheDB.getAll('categories');
        let cachedProducts = await CacheDB.getAll('products');
        let cachedClients = await CacheDB.getAll('clients');
        if (cachedCategories.length) posCategoriesList = cachedCategories.map(cat => ({
            id: cat.id, nom: cat.nom, imageBase64: cat.imageBase64, recette: cat.recette || false
        }));
        if (cachedProducts.length) posProductsList = cachedProducts.filter(p => p.disponible !== false);
        if (cachedClients.length) {
            posAllClients = cachedClients.map(c => ({ id: c.id, nom: c.nom, prenom: c.prenom, telephone: c.telephone }));
            posFilteredClients = [...posAllClients];
        }
    }

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
}

// ==================== RECHERCHE DE PRODUITS ====================
function posSearchProducts(query) {
    posSearchQuery = query.toLowerCase().trim();
    filterProductGrid();
}

// ==================== RECHERCHE VOCALE STABLE (SANS AJOUT AUTOMATIQUE) ====================
function posStartVoiceSearch() {
    // Vérifier le support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('❌ Votre navigateur ne supporte pas la recherche vocale.\nUtilisez Chrome, Edge ou Safari.');
        return;
    }

    var searchInput = document.getElementById('posSearchInput');
    var audioBtn = document.querySelector('.btn-audio') || document.getElementById('posAudioBtn');
    var statusSpan = document.getElementById('microStatus');
    
    // ⭐ FORCER L'ARRÊT DE TOUTE INSTANCE PRÉCÉDENTE
    if (window._recognitionActive) {
        try {
            window._recognitionActive.abort();
            window._recognitionActive = null;
        } catch(e) {}
    }
    
    // ⭐ NETTOYER LES TIMEOUTS EXISTANTS
    if (window._voiceTimeout) {
        clearTimeout(window._voiceTimeout);
        window._voiceTimeout = null;
    }
    
    // Vérifier qu'il y a des produits
    if (posProductsList.length === 0) {
        alert('❌ Aucun produit disponible dans la liste.');
        return;
    }

    var recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;

    // ⭐ DÉMARRER LE TIMEOUT DE SÉCURITÉ (5 secondes)
    window._voiceTimeout = setTimeout(function() {
        console.log('⏱️ Timeout sécurité - Arrêt du micro');
        if (window._recognitionActive) {
            try {
                window._recognitionActive.abort();
            } catch(e) {}
            window._recognitionActive = null;
        }
        cleanUp();
        showVoiceResult('⏱️ Temps écoulé, réessayez');
    }, 6000); // 6 secondes max

    // Activer l'indicateur visuel
    if (searchInput) {
        searchInput.placeholder = '🎤 Écoute en cours...';
        searchInput.style.borderColor = '#ef4444';
        searchInput.style.backgroundColor = '#fef2f2';
        searchInput.classList.add('listening');
    }
    if (audioBtn) {
        audioBtn.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
        audioBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> Arrêter';
        audioBtn.style.animation = 'pulse-audio 1s ease-in-out infinite';
    }
    if (statusSpan) {
        statusSpan.textContent = '🔴 Écoute...';
        statusSpan.style.color = '#ef4444';
    }

    window._recognitionActive = recognition;

    try {
        recognition.start();
        console.log('🎤 Micro démarré');
    } catch(e) {
        console.warn('Erreur démarrage micro:', e);
        window._recognitionActive = null;
        cleanUp();
        showVoiceResult('❌ Erreur micro: ' + e.message);
        return;
    }

    // ⭐ RÉSULTATS
    recognition.onresult = function(event) {
        // Réinitialiser le timeout à chaque résultat
        if (window._voiceTimeout) {
            clearTimeout(window._voiceTimeout);
            window._voiceTimeout = setTimeout(function() {
                if (window._recognitionActive) {
                    try { window._recognitionActive.abort(); } catch(e) {}
                    window._recognitionActive = null;
                }
                cleanUp();
                showVoiceResult('⏱️ Temps écoulé');
            }, 5000);
        }
        
        var transcript = '';
        var allAlternatives = [];
        
        for (var i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                transcript = event.results[i][0].transcript;
                for (var alt = 0; alt < event.results[i].length; alt++) {
                    allAlternatives.push(event.results[i][alt].transcript.toLowerCase().trim());
                }
                break;
            } else {
                transcript = event.results[i][0].transcript;
                if (searchInput) {
                    searchInput.value = transcript;
                    posSearchProducts(transcript);
                }
            }
        }

        if (transcript) {
            var cleanText = transcript.toLowerCase().trim();
            cleanText = cleanText.replace(/[.,;:!?]+$/, '');
            
            var foundProduct = null;
            var matchType = '';
            
            // Recherche EXACTE
            var exactMatch = posProductsList.find(function(p) {
                return p.nom.toLowerCase() === cleanText;
            });
            if (exactMatch) {
                foundProduct = exactMatch;
                matchType = 'EXACT';
            }
            
            // Recherche PARTIELLE
            if (!foundProduct) {
                var partialMatch = posProductsList.find(function(p) {
                    return p.nom.toLowerCase().indexOf(cleanText) !== -1 && cleanText.length > 2;
                });
                if (partialMatch) {
                    foundProduct = partialMatch;
                    matchType = 'PARTIEL';
                }
            }
            
            // Recherche MOTS-CLÉS
            if (!foundProduct) {
                var words = cleanText.split(/\s+/);
                var bestMatch = null;
                var bestScore = 0;
                
                for (var p = 0; p < posProductsList.length; p++) {
                    var productName = posProductsList[p].nom.toLowerCase();
                    var score = 0;
                    
                    for (var w = 0; w < words.length; w++) {
                        var word = words[w];
                        if (word.length < 2) continue;
                        if (productName.indexOf(word) !== -1) score += 10;
                        if (word.indexOf(productName) !== -1 && productName.length > 2) score += 15;
                        if (productName.indexOf(word) === 0) score += 20;
                    }
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = posProductsList[p];
                    }
                }
                
                if (bestMatch && bestScore >= 20) {
                    foundProduct = bestMatch;
                    matchType = 'MOTS-CLÉS';
                }
            }
            
            // SI PRODUIT TROUVÉ
            if (foundProduct) {
                // ⭐ AFFICHER DANS LA BARRE DE RECHERCHE UNIQUEMENT ⭐
                if (searchInput) {
                    searchInput.value = foundProduct.nom;
                    posSearchProducts(foundProduct.nom);
                }
                console.log('🎤 Produit trouvé:', foundProduct.nom, '(' + matchType + ')');
                showVoiceResult('🔍 ' + foundProduct.nom + ' trouvé !');
                
                // ❌ SUPPRIMER L'AJOUT AUTOMATIQUE
                // posAddToCartOrOpenOptions(foundProduct.id);
                
                cleanUp();
                return;
            }
            
            // AUCUN PRODUIT
            if (searchInput) {
                searchInput.value = cleanText;
                posSearchProducts(cleanText);
            }
            showVoiceResult('❌ Aucun produit trouvé pour "' + cleanText + '"');
            cleanUp();
        }
    };

    // ⭐ FIN DE L'ÉCOUTE
    recognition.onend = function() {
        console.log('🎤 Écoute terminée');
        cleanUp();
    };

    // ⭐ GESTION DES ERREURS
    recognition.onerror = function(event) {
        console.warn('🎤 Erreur:', event.error);
        cleanUp();
        if (event.error === 'aborted' || event.error === 'no-speech') {
            if (event.error === 'no-speech') {
                showVoiceResult('⏳ Aucune parole détectée');
            }
            return;
        }
        if (event.error === 'not-allowed') {
            showVoiceResult('❌ Accès au micro refusé');
            alert('❌ Veuillez autoriser l\'accès au microphone dans les paramètres du navigateur.');
            return;
        }
        showVoiceResult('❌ Erreur: ' + event.error);
    };
    
    // ===== FONCTION DE NETTOYAGE =====
    function cleanUp() {
        window._recognitionActive = null;
        if (window._voiceTimeout) {
            clearTimeout(window._voiceTimeout);
            window._voiceTimeout = null;
        }
        
        var searchInput = document.getElementById('posSearchInput');
        var audioBtn = document.querySelector('.btn-audio') || document.getElementById('posAudioBtn');
        var statusSpan = document.getElementById('microStatus');
        
        if (searchInput) {
            searchInput.placeholder = '🔍 Rechercher un produit...';
            searchInput.style.borderColor = '#e2e8f0';
            searchInput.style.backgroundColor = '#fff';
            searchInput.classList.remove('listening');
        }
        if (audioBtn) {
            audioBtn.style.background = 'linear-gradient(135deg, #2E7D32, #1B5E20)';
            audioBtn.innerHTML = '<i class="fas fa-microphone"></i> Audio';
            audioBtn.style.animation = 'none';
        }
        if (statusSpan) {
            statusSpan.textContent = '⚪ Micro prêt';
            statusSpan.style.color = '#94a3b8';
        }
    }
    
    // ===== AFFICHER UN RÉSULTAT TEMPORAIRE =====
    function showVoiceResult(message) {
        var resultDiv = document.getElementById('voiceResultDisplay');
        if (!resultDiv) {
            resultDiv = document.createElement('div');
            resultDiv.id = 'voiceResultDisplay';
            resultDiv.style.cssText = 'position:fixed; bottom:100px; left:50%; transform:translateX(-50%); background:#2E7D32; color:#fff; padding:12px 24px; border-radius:12px; font-weight:600; font-size:1rem; z-index:9999; box-shadow:0 4px 20px rgba(0,0,0,0.3); transition:all 0.3s ease; display:none; max-width:90%; text-align:center;';
            document.body.appendChild(resultDiv);
        }
        
        var isError = message.indexOf('❌') !== -1 || message.indexOf('⏱️') !== -1;
        var isInfo = message.indexOf('🔍') !== -1;
        
        if (isInfo) {
            resultDiv.style.background = '#2196F3'; // Bleu pour info
        } else if (isError) {
            resultDiv.style.background = '#ef4444';
        } else {
            resultDiv.style.background = '#2E7D32';
        }
        
        resultDiv.textContent = message;
        resultDiv.style.display = 'block';
        
        clearTimeout(window._voiceResultTimeout);
        window._voiceResultTimeout = setTimeout(function() {
            resultDiv.style.display = 'none';
        }, 2500);
    }
}

// ==================== RÉINITIALISER LE MICROPHONE ====================
function resetMicrophone() {
    console.log('🔄 Réinitialisation du microphone...');
    
    if (window._recognitionActive) {
        try {
            window._recognitionActive.abort();
        } catch(e) {}
        window._recognitionActive = null;
    }
    
    if (window._voiceTimeout) {
        clearTimeout(window._voiceTimeout);
        window._voiceTimeout = null;
    }
    
    var searchInput = document.getElementById('posSearchInput');
    var audioBtn = document.querySelector('.btn-audio') || document.getElementById('posAudioBtn');
    var statusSpan = document.getElementById('microStatus');
    
    if (searchInput) {
        searchInput.placeholder = '🔍 Rechercher un produit...';
        searchInput.style.borderColor = '#e2e8f0';
        searchInput.style.backgroundColor = '#fff';
        searchInput.classList.remove('listening');
    }
    if (audioBtn) {
        audioBtn.style.background = 'linear-gradient(135deg, #2E7D32, #1B5E20)';
        audioBtn.innerHTML = '<i class="fas fa-microphone"></i> Audio';
        audioBtn.style.animation = 'none';
    }
    if (statusSpan) {
        statusSpan.textContent = '⚪ Micro prêt';
        statusSpan.style.color = '#94a3b8';
    }
    
    var resultDiv = document.getElementById('voiceResultDisplay');
    if (resultDiv) {
        resultDiv.style.background = '#2E7D32';
        resultDiv.textContent = '🔄 Micro réinitialisé';
        resultDiv.style.display = 'block';
        setTimeout(function() {
            resultDiv.style.display = 'none';
        }, 2000);
    }
    
    console.log('✅ Micro réinitialisé');
}

// ==================== RACCOURCI CLAVIER ====================
document.addEventListener('keydown', function(event) {
    if ((event.ctrlKey && event.shiftKey && (event.key === 'a' || event.key === 'A')) ||
        (event.ctrlKey && event.altKey && (event.key === 'a' || event.key === 'A'))) {
        event.preventDefault();
        posStartVoiceSearch();
    }
    
    if (event.ctrlKey && (event.key === 'f' || event.key === 'F')) {
        event.preventDefault();
        var searchInput = document.getElementById('posSearchInput');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }
});

console.log('🎤 Raccourcis: Ctrl+Shift+A = Recherche vocale, Ctrl+F = Focus recherche');

// ==================== FILTRER UNIQUEMENT LA GRILLE ====================
function filterProductGrid() {
    var grid = document.getElementById('posProductGrid');
    if (!grid) {
        grid = document.querySelector('.pos-products-grid');
    }
    if (!grid) return;
    
    var f = posProductsList;
    if (posSelectedCategory !== 'all') {
        f = f.filter(function(p) { return p.categorie === posSelectedCategory; });
    }
    if (posSearchQuery) {
        f = f.filter(function(p) {
            return (p.nom || '').toLowerCase().indexOf(posSearchQuery) !== -1 ||
                   (p.categorie || '').toLowerCase().indexOf(posSearchQuery) !== -1;
        });
    }
    
    f.sort(function(a, b) {
        return (a.nom || '').localeCompare(b.nom || '');
    });
    
    var html = '';
    
    if (f.length === 0) { 
        var message = posSearchQuery ? 'Aucun produit trouvé pour "' + escapeHtml(posSearchQuery) + '"' : 'Aucun produit disponible';
        html += '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;">';
        html += '<i class="fas fa-search" style="font-size:3rem;color:#94a3b8;display:block;margin-bottom:15px;"></i>';
        html += '<p style="color:#94a3b8;font-size:1.1rem;">' + message + '</p>';
        if (posSearchQuery) {
            html += '<button class="btn-add" onclick="document.getElementById(\'posSearchInput\').value=\'\'; posSearchProducts(\'\');" style="margin-top:15px;"><i class="fas fa-times"></i> Effacer la recherche</button>';
        }
        html += '</div>'; 
    } else {
        if (posSearchQuery) {
            html += '<div style="grid-column:1/-1;text-align:left;padding:5px 10px;font-size:0.85rem;color:#94a3b8;">';
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
    <div style="margin-bottom:15px; display:flex; gap:10px; align-items:center;">
        <input type="text" id="posCmdFilterInput" placeholder="🔍 Filtrer (table, produit, option)..." 
               style="flex:1; padding:10px 14px; border:2px solid #e2e8f0; border-radius:40px; font-size:0.9rem;"
               value="${escapeHtml(posCommandesFilterText)}"
               onkeyup="posApplyCommandesFilter(this.value)">
        <button class="btn-add" onclick="posApplyCommandesFilter('')" style="padding:8px 20px;">❌ Réinitialiser</button>
    </div>
    <div style="max-height:65vh; overflow-y:auto;">
    <table class="data-table" style="width:100%; font-size:0.75rem;">
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
        html += '<tr><td colspan="6" style="text-align:center; padding:30px;">Aucune commande correspondante</td></tr>';
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
                '<button class="btn-add" style="padding:4px 8px;font-size:0.7rem;margin-right:4px;" onclick="posChargerCommandeTable(\'' + cmd.id + '\')"><i class="fas fa-check"></i> Accepter</button>' +
                '<button class="btn-save" style="padding:4px 8px;font-size:0.7rem;" onclick="posPayerCommandeTable(\'' + cmd.id + '\')"><i class="fas fa-money-bill-wave"></i> Payé</button>' +
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

function posResetCart() {
    posCart = []; posStep = 1; posSelectedCategory = 'all';
    posCurrentClient = null; posCurrentTable = '';
    posPaymentMethod = 'espece'; posAmountGiven = 0; posDiscountMAD = 0;
    posFilteredClients = posAllClients.slice();
    posSearchQuery = '';
    delete window.posCommandeId; delete window.posVenteId;
    var searchInput = document.getElementById('posSearchInput');
    if (searchInput) searchInput.value = '';
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
        h = '<div style="padding:10px;color:#94a3b8;text-align:center;">Aucun</div>';
    } else {
        posFilteredClients.forEach(function(c) {
            h += '<div onclick="posSelectClientFromDropdown(\'' + c.id + '\',\'' + escapeHtml(c.nom) + ' ' + escapeHtml(c.prenom) + '\')" style="padding:10px;cursor:pointer;border-bottom:1px solid #f1f5f9;">' + escapeHtml(c.nom) + ' ' + escapeHtml(c.prenom) + ' <span style="color:#94a3b8;font-size:0.7rem;">(' + (c.telephone||'') + ')</span></div>';
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

// ==================== AJOUT AU PANIER / OPTIONS ====================
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
        }
        renderPOS();
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
        h += '<div style="margin-bottom:12px;color:#94a3b8;font-size:0.85rem;">Aucun ingrédient à exclure</div>';
    } else {
        sortedCats.forEach(function(cat) {
            h += '<div style="margin-bottom:12px;">';
            h += '<label style="font-weight:600;">🥫 ' + escapeHtml(cat) + '</label>';
            h += '<div style="display:flex;flex-wrap:wrap;gap:5px;">';
            grouped[cat].forEach(function(ingredient) {
                h += '<label style="display:flex;align-items:center;gap:4px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.75rem;">';
                h += '<input type="checkbox" class="pos-interdit-check" value="' + escapeHtml(ingredient) + '"> ' + escapeHtml(ingredient);
                h += '</label>';
            });
            h += '</div></div>';
        });
    }

    h += '<div style="margin-bottom:12px;"><label style="font-weight:600;">🌶️ Épices:</label><div style="display:flex;flex-wrap:wrap;gap:5px;">';
    posEpicesList.forEach(function(s, idx) {
        h += '<label style="display:flex;align-items:center;gap:4px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.75rem;"><input type="radio" name="pos-epice" value="' + s + '" ' + (idx === 0 ? 'checked' : '') + '> ' + s + '</label>';
    });
    h += '</div></div>';
    h += '<div style="margin-bottom:12px;"><label style="font-weight:600;">🧂 Sel:</label><div style="display:flex;flex-wrap:wrap;gap:5px;">';
    posSelList.forEach(function(s, idx) {
        h += '<label style="display:flex;align-items:center;gap:4px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.75rem;"><input type="radio" name="pos-sel" value="' + s + '" ' + (idx === 0 ? 'checked' : '') + '> ' + s + '</label>';
    });
    h += '</div></div>';

    h += '<div style="text-align:right;"><button class="btn-cancel" onclick="closeModal()" style="float:none;margin-right:8px;">Annuler</button><button class="btn-save" onclick="posConfirmOptions()" style="float:none;">Ajouter</button></div>';
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
    }
    closeModal(); renderPOS();
}

// ==================== RENDER POS AVEC RECHERCHE VOCALE (AFFICHAGE UNIQUEMENT) ====================
function renderPOS() {
    var c = document.getElementById('dynamicContent'); if (!c) return;
    
    if (posProductsList.length === 0 && posCategoriesList.length === 0) {
        c.innerHTML = '<div style="text-align:center;padding:60px;">' +
            '<i class="fas fa-spinner fa-spin" style="font-size:2rem;color:#2E7D32;"></i>' +
            '<p style="margin-top:15px;">Chargement du POS...</p>' +
            '</div>';
        return;
    }
    
    var st = posCalculateTotal(); var t = st - posDiscountMAD;
    var h = '<div class="pos-container"><div class="pos-products-panel">';
    
    h += '<div style="display:flex; flex-direction:column; gap:10px; margin-bottom:10px;">';
    
    h += '<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">';
    h += '<div style="flex:1; min-width:200px; position:relative; display:flex; align-items:center; background:#fff; border:2px solid #e2e8f0; border-radius:50px; padding:4px 16px; transition:all 0.3s ease;">';
    h += '<i class="fas fa-search" style="color:#94a3b8; margin-right:8px;"></i>';
    h += '<input type="text" id="posSearchInput" placeholder="🔍 Rechercher un produit..." value="' + escapeHtml(posSearchQuery) + '" ';
    h += 'onkeyup="posSearchProducts(this.value)" style="border:none; outline:none; padding:10px 0; width:100%; font-size:0.95rem; background:transparent;">';
    if (posSearchQuery) {
        h += '<button onclick="document.getElementById(\'posSearchInput\').value=\'\'; posSearchProducts(\'\');" style="background:none; border:none; color:#94a3b8; cursor:pointer; padding:4px 8px; font-size:1rem;">';
        h += '<i class="fas fa-times-circle"></i></button>';
    }
    h += '</div>';
    
    h += '<button class="btn-audio" id="posAudioBtn" onclick="posStartVoiceSearch()" style="background: linear-gradient(135deg, #2E7D32, #1B5E20); border: none; border-radius:50px; padding:10px 20px; cursor:pointer; display:flex; align-items:center; gap:8px; color:#fff; font-weight:600; font-size:0.85rem; transition:all 0.3s ease; white-space:nowrap;">';
    h += '<i class="fas fa-microphone" style="font-size:1.1rem;"></i> Audio';
    h += '</button>';
    
    // Indicateur d'état du micro
    h += '<span id="microStatus" style="font-size:0.65rem; color:#94a3b8; margin-left:2px; white-space:nowrap;">⚪ Micro prêt</span>';
    
    // Bouton reset micro
    h += '<button onclick="resetMicrophone()" style="background:#ff9800; border:none; border-radius:50px; padding:4px 10px; cursor:pointer; color:#fff; font-weight:600; font-size:0.6rem; margin-left:2px; white-space:nowrap;" title="Réinitialiser le microphone">🔄 Reset</button>';
    
    h += '<div style="display:flex; gap:6px; flex-wrap:wrap;">';
    h += '<button onclick="posAfficherCommandesTables()" style="position:relative; background:#fff; border:2px solid #e2e8f0; border-radius:50px; padding:8px 16px; cursor:pointer; font-weight:600; color:#1e293b; display:flex; align-items:center; gap:6px; white-space:nowrap;">';
    h += '<i class="fas fa-utensils"></i> Tables';
    h += '<span style="background:#ef4444; color:#fff; border-radius:20px; padding:2px 8px; font-size:0.7rem; margin-left:4px;">' + posCommandesTablesCount + '</span>';
    h += '</button>';
    h += '<button onclick="navigateTo(\'commandes\')" style="position:relative; background:#fff; border:2px solid #e2e8f0; border-radius:50px; padding:8px 16px; cursor:pointer; font-weight:600; color:#1e293b; display:flex; align-items:center; gap:6px; white-space:nowrap;">';
    h += '<i class="fas fa-globe"></i> En ligne';
    h += '<span style="background:#ef4444; color:#fff; border-radius:20px; padding:2px 8px; font-size:0.7rem; margin-left:4px;">' + posCommandesEnLigneCount + '</span>';
    h += '</button>';
    h += '</div>';
    h += '</div>';
    
    h += '<div class="pos-categories-bar" style="margin-bottom:0;">';
    h += '<button class="pos-cat-btn ' + (posSelectedCategory === 'all' ? 'active' : '') + '" onclick="posFilterCategory(\'all\')"><i class="fas fa-th-large"></i> Tous</button>';
    for (var i = 0; i < posCategoriesList.length; i++) {
        var ca = posCategoriesList[i];
        var ac = posSelectedCategory === ca.nom ? 'active' : '';
        var ih = ca.imageBase64 ? '<img src="' + escapeHtml(ca.imageBase64) + '" alt="">' : '<i class="fas fa-folder"></i>';
        h += '<button class="pos-cat-btn ' + ac + '" onclick="posFilterCategory(\'' + escapeHtml(ca.nom).replace(/'/g, "\\'") + '\')">' + ih + ' ' + escapeHtml(ca.nom) + '</button>';
    }
    h += '</div>';
    h += '</div>';
    
    h += '<div class="pos-products-grid" id="posProductGrid">';
    h += '</div></div>';
    
    h += '<div class="pos-cart-panel" style="max-height: none; height: auto; min-height: 180px;">';
    if (posStep === 1) {
        h += '<div class="pos-cart-header" style="padding: 6px 0 8px 0; margin-bottom: 6px; border-bottom: 1px solid #f1f5f9;">';
        h += '<h3 style="font-size: 0.9rem; margin: 0; display:flex; align-items:center; gap:6px;"><i class="fas fa-shopping-cart" style="font-size:0.8rem;"></i> Panier <span class="pos-cart-badge" style="font-size: 0.65rem; padding: 1px 8px; border-radius: 30px; background: #2E7D32; color: #fff;">' + posCart.length + '</span></h3>';
        h += '<button class="pos-clear-btn" onclick="posResetCart()" style="font-size: 0.7rem; padding: 3px 10px; background: none; border: none; color: #6c757d; cursor: pointer;"><i class="fas fa-trash-alt"></i> Vider</button>';
        h += '</div>';
        
        h += '<div class="pos-cart-items" style="max-height: none; overflow: visible; margin-bottom: 6px;">';
        if (posCart.length === 0) { 
            h += '<div class="pos-cart-empty" style="padding: 15px; text-align:center; color:#94a3b8; font-size:0.75rem;"><i class="fas fa-shopping-basket" style="font-size:1.5rem; display:block; margin-bottom:5px;"></i>Panier vide</div>'; 
        } else {
            for (var k = 0; k < posCart.length; k++) {
                var it = posCart[k];
                var opts = '';
                if (it.interdits && it.interdits.length > 0) opts += ' <span style="color:#ef4444;font-size:0.5rem;">🚫' + escapeHtml(it.interdits.join(',')) + '</span>';
                if (it.epice && it.epice !== 'Normal') opts += ' <span style="color:#d97706;font-size:0.5rem;">🌶️' + escapeHtml(it.epice) + '</span>';
                if (it.sel && it.sel !== 'Normal') opts += ' <span style="color:#4f46e5;font-size:0.5rem;">🧂' + escapeHtml(it.sel) + '</span>';
                
                h += '<div class="pos-cart-item" style="display:flex; align-items:center; padding:4px 6px; border-bottom:1px solid #f1f5f9; gap:4px;">';
                h += '<div class="pos-cart-item-info" style="flex:1; min-width:60px;">';
                h += '<span class="pos-cart-item-name" style="font-size:0.7rem; font-weight:600; display:block; line-height:1.2;">' + escapeHtml(it.nom) + opts + '</span>';
                h += '<span class="pos-cart-item-price" style="font-size:0.55rem; color:#6c757d;">' + it.prixUnitaire.toFixed(2) + ' MAD/u</span>';
                h += '</div>';
                h += '<div class="pos-cart-item-actions" style="display:flex; align-items:center; gap:3px; flex-shrink:0;">';
                h += '<button class="pos-qty-btn" onclick="posUpdateQty(' + k + ',-1)" style="width:20px; height:20px; border-radius:50%; border:1px solid #e2e8f0; background:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:0.5rem;"><i class="fas fa-minus"></i></button>';
                h += '<span class="pos-qty-value" style="font-size:0.7rem; min-width:18px; text-align:center; font-weight:700;">' + it.quantite + '</span>';
                h += '<button class="pos-qty-btn" onclick="posUpdateQty(' + k + ',1)" style="width:20px; height:20px; border-radius:50%; border:1px solid #e2e8f0; background:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:0.5rem;"><i class="fas fa-plus"></i></button>';
                h += '<button class="pos-remove-btn" onclick="posRemoveItem(' + k + ')" style="width:20px; height:20px; border-radius:50%; border:none; background:#fee2e2; cursor:pointer; color:#ef4444; display:flex; align-items:center; justify-content:center; font-size:0.5rem; margin-left:2px;"><i class="fas fa-times"></i></button>';
                h += '</div>';
                h += '<span class="pos-cart-item-total" style="font-size:0.7rem; font-weight:700; min-width:50px; text-align:right; flex-shrink:0;">' + (it.prixUnitaire * it.quantite).toFixed(2) + ' MAD</span>';
                h += '</div>';
            }
        }
        h += '</div>';
        
        h += '<div style="padding:3px 0 5px 0; display:flex; gap:4px; align-items:center; flex-wrap:wrap;">';
        h += '<label style="font-size:0.65rem; font-weight:600; color:#495057;">Remise (MAD):</label>';
        h += '<input type="number" id="posDiscountMAD" value="' + posDiscountMAD + '" min="0" step="0.01" onchange="posUpdateDiscountMAD(this.value)" style="width:70px; padding:3px 6px; border:2px solid #e2e8f0; border-radius:4px; font-size:0.7rem;">';
        h += '</div>';
        
        h += '<div class="pos-cart-footer" style="padding-top:6px; border-top:1px solid #e2e8f0;">';
        if (posDiscountMAD > 0) {
            h += '<div style="display:flex; justify-content:space-between; font-size:0.65rem; color:#495057;"><span>Sous-total</span><span>' + st.toFixed(2) + ' MAD</span></div>';
            h += '<div style="display:flex; justify-content:space-between; font-size:0.65rem; color:#ef4444;"><span>Remise</span><span>-' + posDiscountMAD.toFixed(2) + ' MAD</span></div>';
        }
        h += '<div class="pos-cart-total-row" style="display:flex; justify-content:space-between; align-items:center; font-size:1rem; font-weight:700; margin-bottom:6px; padding-top:4px;">';
        h += '<span>Total</span><span style="font-size:1.1rem; color:#2E7D32;">' + t.toFixed(2) + ' MAD</span>';
        h += '</div>';
        h += '<button class="pos-validate-btn" onclick="posGoToStep2()" ' + (posCart.length === 0 ? 'disabled' : '') + ' style="width:100%; padding:8px; border:none; border-radius:6px; background:linear-gradient(135deg,#2E7D32,#1B5E20); color:#fff; font-weight:700; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;"><i class="fas fa-check-circle"></i> Valider</button>';
        h += '</div>';
        
    } else if (posStep === 2) {
        var canCredit = posCurrentClient && posCurrentClient.id;
        h += '<div class="pos-cart-header" style="padding: 6px 0 8px 0; margin-bottom: 6px; border-bottom: 1px solid #f1f5f9;">';
        h += '<h3 style="font-size: 0.9rem; margin: 0; display:flex; align-items:center; gap:6px;"><i class="fas fa-credit-card" style="font-size:0.8rem;"></i> Paiement</h3>';
        h += '<button class="pos-back-btn" onclick="posGoToStep1()" style="font-size: 0.7rem; padding: 3px 10px; background: none; border: none; color: #6c757d; cursor: pointer;"><i class="fas fa-arrow-left"></i> Retour</button>';
        h += '</div>';
        
        h += '<div class="pos-payment-form" style="font-size: 0.85rem;">';
        
        h += '<div class="pos-payment-section" style="margin-bottom: 8px;">';
        h += '<label style="font-size: 0.7rem; font-weight:600; display:block; margin-bottom:3px;">Client</label>';
        h += '<div style="position:relative;">';
        h += '<input type="text" id="posClientSearchInput" placeholder="🔍 Rechercher..." onkeyup="posSearchClient(this.value)" onfocus="if(this.value)posSearchClient(this.value)" autocomplete="off" value="' + (posCurrentClient ? escapeHtml(posCurrentClient.name) : '') + '" style="width:100%; padding:6px 10px; border:2px solid #e2e8f0; border-radius:6px; font-size:0.8rem;">';
        h += '<div id="posClientDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:2px solid #e2e8f0;border-radius:0 0 6px 6px;max-height:150px;overflow-y:auto;z-index:50;box-shadow:0 10px 30px rgba(0,0,0,0.15);"></div>';
        h += '</div></div>';
        
        h += '<div class="pos-or-divider" style="margin:4px 0; font-size:0.65rem; color:#94a3b8; text-align:center;">— OU —</div>';
        
        h += '<div class="pos-payment-section" style="margin-bottom: 8px;">';
        h += '<label style="font-size: 0.7rem; font-weight:600; display:block; margin-bottom:3px;">Table</label>';
        h += '<input type="text" id="posTableNum" value="' + escapeHtml(posCurrentTable) + '" onchange="posSetTable(this.value)" style="width:100%; padding:6px 10px; border:2px solid #e2e8f0; border-radius:6px; font-size:0.8rem;">';
        h += '</div>';
        
        h += '<div class="pos-payment-section" style="margin-bottom: 8px;">';
        h += '<div class="pos-summary-box" style="padding: 8px 12px; border-radius:6px; background:#f8fafc;">';
        h += '<div class="pos-summary-row" style="display:flex; justify-content:space-between; font-size:0.7rem; margin-bottom:2px;"><span>Articles</span><span>' + posCart.length + '</span></div>';
        if (posDiscountMAD > 0) h += '<div class="pos-summary-row" style="display:flex; justify-content:space-between; font-size:0.7rem; margin-bottom:2px;"><span>Remise</span><span style="color:#ef4444;">-' + posDiscountMAD.toFixed(2) + '</span></div>';
        h += '<div class="pos-summary-total" style="display:flex; justify-content:space-between; font-size:1rem; font-weight:700;"><span>Total</span><span style="font-size:1.1rem; color:#2E7D32;">' + t.toFixed(2) + ' MAD</span></div>';
        h += '</div></div>';
        
        h += '<div class="pos-payment-section" style="margin-bottom: 8px;">';
        h += '<label style="font-size: 0.7rem; font-weight:600; display:block; margin-bottom:3px;">Vendeur</label>';
        h += '<input type="text" id="posVendeur" value="' + (window.currentUserData ? escapeHtml(window.currentUserData.userData.prenom + ' ' + window.currentUserData.userData.nom) : '') + '" style="width:100%; padding:6px 10px; border:2px solid #e2e8f0; border-radius:6px; font-size:0.8rem;">';
        h += '</div>';
        
        h += '<div class="pos-payment-section" style="margin-bottom: 8px;">';
        h += '<label style="font-size: 0.7rem; font-weight:600; display:block; margin-bottom:3px;">Paiement</label>';
        h += '<div class="pos-payment-methods" style="display:flex; gap:4px; flex-wrap:wrap;">';
        h += '<button class="pos-payment-btn ' + (posPaymentMethod === 'espece' ? 'active' : '') + '" onclick="posSetPaymentMethod(\'espece\')" style="padding:4px 8px; font-size:0.65rem; border-radius:4px; flex:1; min-width:50px; border:2px solid #e2e8f0; background:#fff; cursor:pointer;"><i class="fas fa-money-bill-wave"></i> Espèces</button>';
        h += '<button class="pos-payment-btn ' + (posPaymentMethod === 'credit' ? 'active' : '') + '" onclick="posSetPaymentMethod(\'credit\')" id="posCreditBtn" ' + (canCredit ? '' : 'disabled style="opacity:0.4;cursor:not-allowed;"') + ' style="padding:4px 8px; font-size:0.65rem; border-radius:4px; flex:1; min-width:50px; border:2px solid #e2e8f0; background:#fff; cursor:pointer;"><i class="fas fa-credit-card"></i> Crédit</button>';
        h += '<button class="pos-payment-btn ' + (posPaymentMethod === 'partiel' ? 'active' : '') + '" onclick="posSetPaymentMethod(\'partiel\')" id="posPartielBtn" ' + (canCredit ? '' : 'disabled style="opacity:0.4;cursor:not-allowed;"') + ' style="padding:4px 8px; font-size:0.65rem; border-radius:4px; flex:1; min-width:50px; border:2px solid #e2e8f0; background:#fff; cursor:pointer;"><i class="fas fa-hand-holding-usd"></i> Partiel</button>';
        h += '</div></div>';
        
        if (posPaymentMethod === 'espece' || posPaymentMethod === 'partiel') {
            h += '<div class="pos-payment-section" style="margin-bottom: 8px;">';
            h += '<label style="font-size: 0.7rem; font-weight:600; display:block; margin-bottom:3px;">Montant donné</label>';
            h += '<input type="number" id="posAmountGiven" placeholder="0.00" value="' + (posAmountGiven > 0 ? posAmountGiven : '') + '" onkeyup="posCalculateChange()" style="width:100%; padding:6px 10px; border:2px solid #e2e8f0; border-radius:6px; font-size:0.9rem;">';
            h += '<div id="posChangeDisplay"></div>';
            h += '</div>';
        }
        
        h += '<button class="pos-finalize-btn" onclick="posFinalizeSale()" style="width:100%; padding:8px; border:none; border-radius:6px; background:linear-gradient(135deg,#2E7D32,#1B5E20); color:#fff; font-weight:700; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; margin-top:4px;"><i class="fas fa-check-circle"></i> Finaliser</button>';
        h += '</div>';
    }
    h += '</div></div>';
    c.innerHTML = h;
    
    filterProductGrid();
    
    if (posStep === 2) setTimeout(posCalculateChange, 200);
}

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
    renderPOS(); 
}

function posRemoveItem(i) { posCart.splice(i, 1); renderPOS(); }

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
        cd.innerHTML = c >= 0 ? '<div class="pos-change-positive" style="background:#dcfce7; color:#166534; padding:6px 10px; border-radius:4px; margin-top:4px; font-weight:700; display:flex; justify-content:space-between; align-items:center; font-size:0.85rem;"><span>Rendu</span><span>' + c.toFixed(2) + ' MAD</span></div>' : '<div class="pos-change-negative" style="background:#fee2e2; color:#991b1b; padding:6px 10px; border-radius:4px; margin-top:4px; font-weight:700; display:flex; justify-content:space-between; align-items:center; font-size:0.85rem;"><span>Manquant</span><span>' + Math.abs(c).toFixed(2) + ' MAD</span></div>'; 
    } else { 
        cd.innerHTML = ''; 
    } 
}

// ==================== FINALISATION ====================
async function posFinalizeSale() {
    var st = posCalculateTotal(); var t = st - posDiscountMAD;
    if (!posCurrentClient && !posCurrentTable) { alert('Client ou table requis.'); return; }
    if (posCurrentTable && (posPaymentMethod === 'credit' || posPaymentMethod === 'partiel')) { alert('Table = espèces uniquement.'); return; }
    if ((posPaymentMethod === 'credit' || posPaymentMethod === 'partiel') && !posCurrentClient) { alert('Client requis pour crédit/partiel.'); return; }
    if (posPaymentMethod === 'espece') { posAmountGiven = parseFloat(document.getElementById('posAmountGiven').value) || 0; if (posAmountGiven < t) { alert('Montant insuffisant.'); return; } }
    var vendeur = document.getElementById('posVendeur').value.trim() || (window.currentUserData ? window.currentUserData.userData.prenom + ' ' + window.currentUserData.userData.nom : '');
    try {
        var fcs = await db.collection('ventes').get(); var fn = 'FACT-' + new Date().getFullYear() + '-' + String(fcs.size + 1).padStart(5, '0');
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
            return {
                id: it.id, nom: it.nom, quantite: it.quantite, prixVente: pvr, prixAchat: pa, prixPromo: pp,
                profit: prof, sauces: [], interdits: it.interdits || [],
                epice: it.epice || 'Normal', sel: it.sel || 'Normal'
            };
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
        await CacheDB.write('ventes', null, sd, 'add');
        if (!paid) await CacheDB.write('credits', null, sd, 'add');
        if (window.posCommandeId) {
            await CacheDB.write('commandes', window.posCommandeId, { statut: 'payé', paidAt: firebase.firestore.FieldValue.serverTimestamp(), factureNum: fn }, 'update');
            delete window.posCommandeId;
        }
        if (window.posVenteId) {
            await CacheDB.write('ventes', window.posVenteId, { paid: true, statutPaiement: 'payé', remainingAmount: 0, paidAt: firebase.firestore.FieldValue.serverTimestamp() }, 'update');
            var venteDoc = await db.collection('ventes').doc(window.posVenteId).get();
            if (venteDoc.exists) {
                var creditSnap = await db.collection('credits').where('factureNum', '==', venteDoc.data().factureNum).get();
                creditSnap.forEach(function(cd) { CacheDB.write('credits', cd.id, { paid: true, remainingAmount: 0 }, 'update'); });
            }
            delete window.posVenteId;
        }

        for (var i = 0; i < posCart.length; i++) {
            var it = posCart[i];
            try {
                var productDoc = await db.collection('products').doc(it.id).get();
                if (productDoc.exists) {
                    var productData = productDoc.data();
                    if (productData.ingredients && productData.ingredients.length > 0) {
                        var interditsItem = it.interdits || [];
                        for (var j = 0; j < productData.ingredients.length; j++) {
                            var ing = productData.ingredients[j];
                            if (interditsItem.indexOf(ing.nom) !== -1) continue;
                            var stockDoc = await db.collection('stock').doc(ing.idStock).get();
                            if (stockDoc.exists) {
                                var stockData = stockDoc.data();
                                var qteUtilisee = ing.quantite * it.quantite;
                                var newQte = Math.max(0, (stockData.quantite || 0) - qteUtilisee);
                                await CacheDB.write('stock', ing.idStock, {
                                    quantite: newQte,
                                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                                }, 'update');
                            }
                        }
                    } else {
                        var pr = await db.collection('products').doc(it.id).get();
                        if (pr.exists) {
                            var pd = pr.data();
                            await CacheDB.write('products', it.id, {
                                stock: Math.max(0, (pd.stock || 0) - it.quantite),
                                vendues: (pd.vendues || 0) + it.quantite,
                                ca: (pd.ca || 0) + (it.prixUnitaire * it.quantite),
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            }, 'update');
                        }
                    }
                }
            } catch(e) {}
        }

        if (posCurrentClient && posCurrentClient.id && paid) {
            try {
                var cr = await db.collection('clients').doc(posCurrentClient.id).get();
                if (cr.exists) {
                    var cd = cr.data();
                    var updateData = {
                        ca: (cd.ca || 0) + t,
                        profit: (cd.profit || 0) + profitTotal,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    var fideliteActive = true;
                    var pointsParVente = 1;
                    try {
                        const fDoc = await db.collection('settings').doc('fidelite').get();
                        if (fDoc.exists) {
                            fideliteActive = fDoc.data().active === true;
                            pointsParVente = fDoc.data().pointsParVente || 1;
                        } else {
                            var storedActive = localStorage.getItem('fidelite_active');
                            fideliteActive = storedActive === null ? true : storedActive === 'true';
                            var storedPoints = localStorage.getItem('fidelite_points');
                            pointsParVente = storedPoints ? parseInt(storedPoints) || 1 : 1;
                        }
                    } catch(e) {
                        var storedActive = localStorage.getItem('fidelite_active');
                        fideliteActive = storedActive === null ? true : storedActive === 'true';
                        var storedPoints = localStorage.getItem('fidelite_points');
                        pointsParVente = storedPoints ? parseInt(storedPoints) || 1 : 1;
                    }
                    if (fideliteActive) {
                        updateData.pointsFidelite = (cd.pointsFidelite || 0) + pointsParVente;
                    }
                    await CacheDB.write('clients', posCurrentClient.id, updateData, 'update');
                }
            } catch(e) { console.error('Erreur fidélité :', e); }
        }

        var msg = '✅ Vente: ' + fn + '\n💰 Total: ' + t.toFixed(2) + ' MAD';
        if (posPaymentMethod === 'espece' && posAmountGiven > t) msg += '\n💵 Rendu: ' + change.toFixed(2) + ' MAD';
        if (statutPaiement === 'crédit') msg += '\n📋 Crédit enregistré.';
        if (statutPaiement === 'partiel') msg += '\n📋 Reste: ' + remaining.toFixed(2) + ' MAD';
        if (statutPaiement === 'en_attente') msg += '\n⏳ En attente de paiement.';
        alert(msg); posResetCart(); renderPOS(); CacheDB.sync();
    } catch(e) { alert('Erreur: ' + e.message); }
}

console.log('🛒 Mixmax Minimarket - POS JS prêt (recherche vocale sans ajout automatique)');
