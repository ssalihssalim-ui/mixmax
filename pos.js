// ==================== POS.JS - MIXMAX MINIMARKET (AVEC RECHERCHE VOCALE) ====================
var posCart = [], posStep = 1, posCategoriesList = [], posProductsList = [], posSelectedCategory = 'all';
var posCurrentClient = null, posCurrentTable = '', posPaymentMethod = 'espece', posAmountGiven = 0, posDiscountMAD = 0;
var posAllClients = [], posFilteredClients = [], posCurrentProductId = null;
var posSearchQuery = ''; // Variable pour la recherche de produits
var voiceRecognition = null; // Variable pour la recherche vocale

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

// ==================== RECHERCHE DE PRODUITS (Version corrigée - sans perte de focus) ====================
function posSearchProducts(query) {
posSearchQuery = query.toLowerCase().trim();
filterProductGrid();
}

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

// Trier les produits (alphabétique)
f.sort(function(a, b) {
return (a.nom || '').localeCompare(b.nom || '');
});

// Générer uniquement la grille
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

// Mettre en évidence le texte recherché
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

// ==================== RECHERCHE VOCALE (STYLE WHATSAPP) ====================
function posStartVoiceSearch() {
    // Vérifier si le navigateur supporte la reconnaissance vocale
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('❌ La reconnaissance vocale n\'est pas supportée par votre navigateur.\nUtilisez Chrome ou Edge.');
        return;
    }

    var micBtn = document.getElementById('posMicBtn');
    if (micBtn && micBtn.classList.contains('recording')) return;

    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    voiceRecognition = new SpeechRecognition();
    voiceRecognition.lang = 'fr-FR';
    voiceRecognition.continuous = false;
    voiceRecognition.interimResults = true;

    var searchInput = document.getElementById('posSearchInput');

    // Activer le mode enregistrement
    if (micBtn) {
        micBtn.classList.add('recording');
        micBtn.innerHTML = '<i class="fas fa-circle" style="color:#ef4444; animation: pulse 0.5s ease-in-out infinite;"></i>';
        micBtn.style.background = '#fee2e2';
        micBtn.style.borderColor = '#ef4444';
        micBtn.style.transform = 'scale(0.95)';
    }
    if (searchInput) {
        searchInput.placeholder = '🎤 Écoute...';
        searchInput.style.background = '#fef2f2';
        searchInput.style.borderColor = '#ef4444';
    }

    // Style d'animation
    var style = document.createElement('style');
    style.id = 'voiceStyle';
    style.textContent = `
        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.3; transform: scale(1.3); }
        }
        .recording .fa-circle { animation: pulse 0.5s ease-in-out infinite !important; }
    `;
    document.head.appendChild(style);

    voiceRecognition.onresult = function(event) {
        var transcript = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        if (searchInput) {
            searchInput.value = transcript;
        }
    };

    voiceRecognition.onend = function() {
        var transcript = searchInput ? searchInput.value.trim() : '';

        // Restaurer le bouton
        if (micBtn) {
            micBtn.classList.remove('recording');
            micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            micBtn.style.background = '#dcfce7';
            micBtn.style.borderColor = '#16a34a';
            micBtn.style.transform = 'scale(1)';
        }
        if (searchInput) {
            searchInput.placeholder = '🔍 Rechercher un produit...';
            searchInput.style.background = '#fff';
            searchInput.style.borderColor = '#e2e8f0';
        }

        var styleEl = document.getElementById('voiceStyle');
        if (styleEl) styleEl.remove();
        voiceRecognition = null;

        // Lancer la recherche si du texte a été reconnu
        if (transcript) {
            posSearchQuery = transcript.toLowerCase().trim();
            filterProductGrid();
            if (searchInput) {
                searchInput.focus();
                var len = searchInput.value.length;
                searchInput.setSelectionRange(len, len);
            }
        }
    };

    voiceRecognition.onerror = function(event) {
        if (event.error === 'no-speech') {
            // Restaurer silencieusement
            if (micBtn) {
                micBtn.classList.remove('recording');
                micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                micBtn.style.background = '#dcfce7';
                micBtn.style.borderColor = '#16a34a';
                micBtn.style.transform = 'scale(1)';
            }
            if (searchInput) {
                searchInput.placeholder = '🔍 Rechercher un produit...';
                searchInput.style.background = '#fff';
                searchInput.style.borderColor = '#e2e8f0';
            }
            var styleEl = document.getElementById('voiceStyle');
            if (styleEl) styleEl.remove();
            voiceRecognition = null;
            return;
        }

        var msg = event.error === 'not-allowed' ? '❌ Microphone refusé' : '❌ Erreur micro';
        if (searchInput) {
            searchInput.placeholder = msg;
            searchInput.style.background = '#fee2e2';
            searchInput.style.borderColor = '#ef4444';
        }
        setTimeout(function() {
            if (micBtn) {
                micBtn.classList.remove('recording');
                micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                micBtn.style.background = '#dcfce7';
                micBtn.style.borderColor = '#16a34a';
                micBtn.style.transform = 'scale(1)';
            }
            if (searchInput) {
                searchInput.placeholder = '🔍 Rechercher un produit...';
                searchInput.style.background = '#fff';
                searchInput.style.borderColor = '#e2e8f0';
            }
            var styleEl = document.getElementById('voiceStyle');
            if (styleEl) styleEl.remove();
            voiceRecognition = null;
        }, 1500);
    };

    voiceRecognition.start();
}

function posCancelVoiceSearch() {
    if (voiceRecognition) {
        try { voiceRecognition.abort(); } catch(e) {}
        voiceRecognition = null;
    }
    var micBtn = document.getElementById('posMicBtn');
    var searchInput = document.getElementById('posSearchInput');
    if (micBtn) {
        micBtn.classList.remove('recording');
        micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        micBtn.style.background = '#dcfce7';
        micBtn.style.borderColor = '#16a34a';
        micBtn.style.transform = 'scale(1)';
    }
    if (searchInput) {
        searchInput.placeholder = '🔍 Rechercher un produit...';
        searchInput.style.background = '#fff';
        searchInput.style.borderColor = '#e2e8f0';
    }
    var styleEl = document.getElementById('voiceStyle');
    if (styleEl) styleEl.remove();
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
// Réinitialiser le micro si actif
if (voiceRecognition) {
try { voiceRecognition.abort(); } catch(e) {}
voiceRecognition = null;
}
var micBtn = document.getElementById('posMicBtn');
if (micBtn) {
micBtn.classList.remove('recording');
micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
micBtn.style.background = '#dcfce7';
micBtn.style.borderColor = '#16a34a';
micBtn.style.transform = 'scale(1)';
}
var styleEl = document.getElementById('voiceStyle');
if (styleEl) styleEl.remove();
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

// ==================== RENDER POS AVEC RECHERCHE (sans perte de focus) ====================
function renderPOS() {
var c = document.getElementById('dynamicContent'); if (!c) return;

// Vérifier si les données sont chargées
if (posProductsList.length === 0 && posCategoriesList.length === 0) {
c.innerHTML = '<div style="text-align:center;padding:60px;">' +
'<i class="fas fa-spinner fa-spin" style="font-size:2rem;color:#2E7D32;"></i>' +
'<p style="margin-top:15px;">Chargement du POS...</p>' +
'</div>';
return;
}

var st = posCalculateTotal(); var t = st - posDiscountMAD;
var h = '<div class="pos-container"><div class="pos-products-panel">';

// ===== BARRE DE RECHERCHE AVEC MICRO =====
h += '<div style="display:flex; flex-direction:column; gap:10px; margin-bottom:10px;">';

// Barre de recherche avec micro
h += '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">';
h += '<div style="flex:1; min-width:180px; position:relative; display:flex; align-items:center; background:#fff; border:2px solid #e2e8f0; border-radius:50px; padding:4px 16px; transition:all 0.3s ease;">';
h += '<i class="fas fa-search" style="color:#94a3b8; margin-right:8px;"></i>';
h += '<input type="text" id="posSearchInput" placeholder="🔍 Rechercher un produit..." value="' + escapeHtml(posSearchQuery) + '" ';
h += 'onkeyup="posSearchProducts(this.value)" style="border:none; outline:none; padding:10px 0; width:100%; font-size:0.95rem; background:transparent;">';
if (posSearchQuery) {
h += '<button onclick="document.getElementById(\'posSearchInput\').value=\'\'; posSearchProducts(\'\');" style="background:none; border:none; color:#94a3b8; cursor:pointer; padding:4px 8px; font-size:1rem;">';
h += '<i class="fas fa-times-circle"></i></button>';
}
h += '</div>';

// Bouton Micro (style WhatsApp - appui long)
h += '<button id="posMicBtn" title="Appuyez et maintenez pour la recherche vocale" style="background:#dcfce7; border:2px solid #16a34a; border-radius:50%; width:42px; height:42px; cursor:pointer; font-size:1.1rem; color:#16a34a; transition:all 0.2s; display:flex; align-items:center; justify-content:center; user-select:none; touch-action:manipulation; flex-shrink:0;"';
h += ' onmousedown="posStartVoiceSearch()" onmouseup="posCancelVoiceSearch()" onmouseleave="posCancelVoiceSearch()"';
h += ' ontouchstart="posStartVoiceSearch()" ontouchend="posCancelVoiceSearch()" ontouchcancel="posCancelVoiceSearch()"';
h += '><i class="fas fa-microphone"></i></button>';

// Boutons Tables et En ligne
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

// Catégories
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

// ===== GRILLE PRODUITS (avec un ID pour le filtrage) =====
h += '<div class="pos-products-grid" id="posProductGrid">';
h += '</div></div>'; // Fermeture de la grille et du products panel

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
h += '<div style="padding:10px 0;display:flex;gap:10px;align-items:center;"><label>Remise (MAD):</label><input type="number" id="posDiscountMAD" value="' + posDiscountMAD + '" min="0" step="0.01" onchange="posUpdateDiscountMAD(this.value)" style="width:100px;padding:8px;border:2px solid #e2e8f0;border-radius:8px;"></div>';
h += '<div class="pos-cart-footer">';
if (posDiscountMAD > 0) h += '<div style="display:flex;justify-content:space-between;font-size:0.85rem;"><span>Sous-total</span><span>' + st.toFixed(2) + '</span></div><div style="display:flex;justify-content:space-between;font-size:0.85rem;color:#ef4444;"><span>Remise</span><span>-' + posDiscountMAD.toFixed(2) + '</span></div>';
h += '<div class="pos-cart-total-row"><span>Total</span><span>' + t.toFixed(2) + ' MAD</span></div><button class="pos-validate-btn" onclick="posGoToStep2()" ' + (posCart.length === 0 ? 'disabled' : '') + '><i class="fas fa-check-circle"></i> Valider</button></div>';
} else if (posStep === 2) {
var canCredit = posCurrentClient && posCurrentClient.id;
h += '<div class="pos-cart-header"><h3><i class="fas fa-credit-card"></i> Paiement</h3><button class="pos-back-btn" onclick="posGoToStep1()"><i class="fas fa-arrow-left"></i> Retour</button></div><div class="pos-payment-form">';
h += '<div class="pos-payment-section"><label>Client</label><div style="position:relative;"><input type="text" id="posClientSearchInput" placeholder="🔍 Cliquez et tapez pour rechercher..." onkeyup="posSearchClient(this.value)" onfocus="if(this.value)posSearchClient(this.value)" autocomplete="off" value="' + (posCurrentClient ? escapeHtml(posCurrentClient.name) : '') + '" style="width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:12px;"><div id="posClientDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:2px solid #e2e8f0;border-radius:0 0 12px 12px;max-height:200px;overflow-y:auto;z-index:50;box-shadow:0 10px 30px rgba(0,0,0,0.15);"></div></div></div>';
h += '<div class="pos-or-divider">— OU —</div>';
h += '<div class="pos-payment-section"><label>Table</label><input type="text" id="posTableNum" value="' + escapeHtml(posCurrentTable) + '" onchange="posSetTable(this.value)" style="width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:12px;"></div>';
h += '<div class="pos-payment-section"><div class="pos-summary-box"><div class="pos-summary-row"><span>Articles</span><span>' + posCart.length + '</span></div>'; if (posDiscountMAD > 0) h += '<div class="pos-summary-row"><span>Remise</span><span style="color:#ef4444;">-' + posDiscountMAD.toFixed(2) + '</span></div>'; h += '<div class="pos-summary-total"><span>Total</span><span>' + t.toFixed(2) + ' MAD</span></div></div></div>';
h += '<div class="pos-payment-section"><label>Vendeur</label><input type="text" id="posVendeur" value="' + (window.currentUserData ? escapeHtml(window.currentUserData.userData.prenom + ' ' + window.currentUserData.userData.nom) : '') + '" style="width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:12px;"></div>';
h += '<div class="pos-payment-section"><label>Paiement</label><div class="pos-payment-methods"><button class="pos-payment-btn ' + (posPaymentMethod === 'espece' ? 'active' : '') + '" onclick="posSetPaymentMethod(\'espece\')"><i class="fas fa-money-bill-wave"></i> Espèces</button><button class="pos-payment-btn ' + (posPaymentMethod === 'credit' ? 'active' : '') + '" onclick="posSetPaymentMethod(\'credit\')" id="posCreditBtn" ' + (canCredit ? '' : 'disabled style="opacity:0.4;cursor:not-allowed;"') + '><i class="fas fa-credit-card"></i> Crédit</button><button class="pos-payment-btn ' + (posPaymentMethod === 'partiel' ? 'active' : '') + '" onclick="posSetPaymentMethod(\'partiel\')" id="posPartielBtn" ' + (canCredit ? '' : 'disabled style="opacity:0.4;cursor:not-allowed;"') + '><i class="fas fa-hand-holding-usd"></i> Partiel</button></div></div>';
if (posPaymentMethod === 'espece' || posPaymentMethod === 'partiel') h += '<div class="pos-payment-section"><label>Montant donné</label><input type="number" id="posAmountGiven" placeholder="0.00" value="' + (posAmountGiven > 0 ? posAmountGiven : '') + '" onkeyup="posCalculateChange()"><div id="posChangeDisplay"></div></div>';
h += '<button class="pos-finalize-btn" onclick="posFinalizeSale()"><i class="fas fa-check-circle"></i> Finaliser</button></div>';
}
h += '</div></div>';
c.innerHTML = h;

// Remplir la grille après avoir créé le HTML
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
cd.innerHTML = c >= 0 ? '<div class="pos-change-positive"><span>Rendu</span><span>' + c.toFixed(2) + ' MAD</span></div>' : '<div class="pos-change-negative"><span>Manquant</span><span>' + Math.abs(c).toFixed(2) + ' MAD</span></div>';
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

// Mise à jour du stock
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

// Fidélité
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

console.log('🛒 Mixmax Minimarket - POS JS avec recherche vocale');
