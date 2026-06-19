// ==================== CLIENT.JS - ALMA COFFEE SHOP ====================
var clientCart = [];
var clientCategoriesList = [];
var clientProductsList = [];
var clientSelectedCategory = 'all';
var clientCurrentProductId = null;

var clientEpicesList = ['Normal', 'Moins épicé', 'Très épicé', 'Sans épice'];
var clientSelList = ['Normal', 'Moins de sel', 'Sans sel'];

var allStockData = [];

function clientNavigate(page) {
    var items = document.querySelectorAll('#clientPage .nav-item');
    items.forEach(function(item) { item.classList.remove('active'); });
    if (page === 'commander' && items[0]) items[0].classList.add('active');
    else if (page === 'historique' && items[1]) items[1].classList.add('active');
    else if (items[2]) items[2].classList.add('active');
    document.getElementById('clientPageTitle').textContent = page === 'commander' ? 'Commander' : page === 'historique' ? 'Mon historique' : 'Paramètres';
    if (page === 'commander') loadClientCommanderPage();
    else if (page === 'historique') loadClientHistoriquePage();
    else loadClientParametresPage();
}

// ==================== PAGE COMMANDER ====================
async function loadClientCommanderPage() {
    var c = document.getElementById('clientDynamicContent'); if (!c) return;
    clientCart = []; clientSelectedCategory = 'all';

    let cachedCategories = await CacheDB.getAll('categories');
    let cachedProducts = await CacheDB.getAll('products');
    if (cachedCategories.length) clientCategoriesList = cachedCategories.map(function(cat) {
        return { id: cat.id, nom: cat.nom, imageBase64: cat.imageBase64, recette: cat.recette || false };
    });
    if (cachedProducts.length) clientProductsList = cachedProducts.filter(p => p.disponible !== false);
    renderClientPOS();

    try {
        const [cs, ps] = await Promise.all([
            db.collection('categories').get(),
            db.collection('products').get()
        ]);
        clientCategoriesList = [];
        cs.forEach(d => {
            let cat = { id: d.id, nom: d.data().nom, imageBase64: d.data().imageBase64, recette: d.data().recette || false };
            clientCategoriesList.push(cat);
            CacheDB.set('categories', d.id, cat);
        });
        clientProductsList = [];
        ps.forEach(d => {
            const dd = d.data();
            if (dd.disponible !== false) {
                let prod = { id: d.id, nom: dd.nom, prixVente: dd.prixVente||0, prixPromo: dd.prixPromo||0, stock: dd.stock, categorie: dd.categorie||'', imageBase64: dd.imageBase64||'' };
                clientProductsList.push(prod);
                CacheDB.set('products', d.id, prod);
            }
        });
        renderClientPOS();
    } catch(e) { console.error('Erreur mise à jour catalogue client', e); }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function clientAddToCartOrOpenOptions(pid) {
    var p = clientProductsList.find(function(x) { return x.id === pid; });
    if (!p) return;
    if (p.stock !== undefined && p.stock <= 0) {
        alert('Rupture de stock');
        return;
    }
    var cat = clientCategoriesList.find(function(c) { return c.nom === p.categorie; });
    var isRecette = cat && cat.recette === true;

    if (isRecette) {
        clientCurrentProductId = pid;
        clientOpenOptionsModal(pid);
    } else {
        var existing = clientCart.find(function(x) { return x.id === pid; });
        if (existing) {
            if (p.stock !== undefined && existing.quantite >= p.stock) { alert('Stock insuffisant'); return; }
            existing.quantite += 1;
        } else {
            var pr = p.prixPromo && p.prixPromo > 0 ? p.prixPromo : p.prixVente;
            clientCart.push({id: p.id, nom: p.nom, prixUnitaire: pr, quantite: 1, categorie: p.categorie||'', sauces: [], interdits: [], epice: 'Normal', sel: 'Normal'});
        }
        renderClientPOS();
    }
}

async function clientOpenOptionsModal(pid) {
    var p = clientProductsList.find(function(x) { return x.id === pid; });
    if (!p) return;
    if (p.stock !== undefined && p.stock <= 0) { alert('Rupture de stock'); return; }

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
            var productIngredients = productData.ingredients || [];
        } else {
            var productIngredients = [];
        }
    } catch(e) { var productIngredients = []; }

    var grouped = {};
    productIngredients.forEach(function(ing) {
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

    clientCurrentProductId = pid;
    var h = '<h4>' + escapeHtml(p.nom) + '</h4>';
    if (sortedCats.length === 0) {
        h += '<div style="margin-bottom:12px;color:#94a3b8;">Aucun ingrédient à exclure</div>';
    } else {
        sortedCats.forEach(function(cat) {
            h += '<div style="margin-bottom:12px;"><label style="font-weight:600;">🥫 ' + escapeHtml(cat) + '</label><div style="display:flex;flex-wrap:wrap;gap:5px;">';
            grouped[cat].forEach(function(ing) {
                h += '<label style="display:flex;align-items:center;gap:4px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.75rem;">';
                h += '<input type="checkbox" class="client-interdit-check" value="' + escapeHtml(ing) + '"> ' + escapeHtml(ing);
                h += '</label>';
            });
            h += '</div></div>';
        });
    }

    h += '<div style="margin-bottom:12px;"><label style="font-weight:600;">🌶️ Épices:</label><div style="display:flex;flex-wrap:wrap;gap:5px;">';
    clientEpicesList.forEach(function(s, idx) {
        h += '<label style="display:flex;align-items:center;gap:4px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.75rem;"><input type="radio" name="client-epice" value="' + s + '" ' + (idx === 0 ? 'checked' : '') + '> ' + s + '</label>';
    });
    h += '</div></div>';
    h += '<div style="margin-bottom:12px;"><label style="font-weight:600;">🧂 Sel:</label><div style="display:flex;flex-wrap:wrap;gap:5px;">';
    clientSelList.forEach(function(s, idx) {
        h += '<label style="display:flex;align-items:center;gap:4px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.75rem;"><input type="radio" name="client-sel" value="' + s + '" ' + (idx === 0 ? 'checked' : '') + '> ' + s + '</label>';
    });
    h += '</div></div>';

    h += '<div style="text-align:right;"><button class="btn-cancel" onclick="closeModal()">Annuler</button><button class="btn-save" onclick="clientConfirmOptions()">Ajouter</button></div>';
    openModal('Personnaliser - ' + escapeHtml(p.nom), h);
}

function clientConfirmOptions() {
    var interdits = []; document.querySelectorAll('.client-interdit-check:checked').forEach(function(cb) { interdits.push(cb.value); });
    var epice = document.querySelector('input[name="client-epice"]:checked'); epice = epice ? epice.value : 'Normal';
    var sel = document.querySelector('input[name="client-sel"]:checked'); sel = sel ? sel.value : 'Normal';
    var p = clientProductsList.find(function(x) { return x.id === clientCurrentProductId; });
    if (!p) { closeModal(); return; }
    var ex = clientCart.find(function(x) { return x.id === clientCurrentProductId; });
    if (ex) {
        if (p.stock !== undefined && ex.quantite >= p.stock) { alert('Stock insuffisant'); closeModal(); return; }
        ex.quantite += 1;
    } else {
        var pr = p.prixPromo && p.prixPromo > 0 ? p.prixPromo : p.prixVente;
        clientCart.push({id: p.id, nom: p.nom, prixUnitaire: pr, quantite: 1, categorie: p.categorie||'', sauces: [], interdits: interdits, epice: epice, sel: sel});
    }
    closeModal(); renderClientPOS();
}

function renderClientPOS() {
    var c = document.getElementById('clientDynamicContent'); if (!c) return;
    var total = clientCalculateTotal();
    var h = '<div class="pos-container"><div class="pos-products-panel"><div class="pos-categories-bar"><button class="pos-cat-btn '+(clientSelectedCategory==='all'?'active':'')+'" onclick="clientFilterCategory(\'all\')"><i class="fas fa-th-large"></i> Tous</button>';
    for (var i = 0; i < clientCategoriesList.length; i++) { var ca = clientCategoriesList[i]; var ac = clientSelectedCategory===ca.nom?'active':''; var ih = ca.imageBase64?'<img src="'+escapeHtml(ca.imageBase64)+'" alt="'+escapeHtml(ca.nom)+'">':'<i class="fas fa-folder"></i>'; h += '<button class="pos-cat-btn '+ac+'" onclick="clientFilterCategory(\''+escapeHtml(ca.nom).replace(/'/g,"\\'")+'\')">'+ih+' '+escapeHtml(ca.nom)+'</button>'; }
    h += '</div><div class="pos-products-grid">';
    var f = clientProductsList; if (clientSelectedCategory!=='all') f = clientProductsList.filter(function(p){return p.categorie===clientSelectedCategory;});
    if (f.length===0) { h += '<div style="grid-column:1/-1;text-align:center;padding:40px;">Aucun produit</div>'; }
    else { for (var j = 0; j < f.length; j++) { var p = f[j]; var pr = p.prixPromo&&p.prixPromo>0?p.prixPromo:p.prixVente; var hp = p.prixPromo&&p.prixPromo>0; h += '<div class="pos-product-card" onclick="clientAddToCartOrOpenOptions(\''+p.id+'\')">'; if (p.imageBase64) h += '<div class="pos-product-img"><img src="'+escapeHtml(p.imageBase64)+'" alt="'+escapeHtml(p.nom)+'"></div>'; else h += '<div class="pos-product-img pos-product-placeholder"><i class="fas fa-coffee"></i></div>'; h += '<div class="pos-product-info"><span class="pos-product-name">'+escapeHtml(p.nom)+'</span><span class="pos-product-price">'; if (hp) h += '<span class="pos-old-price">'+p.prixVente.toFixed(2)+'</span> <span class="pos-promo-price">'+pr.toFixed(2)+' MAD</span>'; else h += pr.toFixed(2)+' MAD'; h += '</span></div></div>'; } }
    h += '</div></div><div class="pos-cart-panel"><div class="pos-cart-header"><h3><i class="fas fa-shopping-cart"></i> Mon Panier <span class="pos-cart-badge">'+clientCart.length+'</span></h3><button class="pos-clear-btn" onclick="clientClearCart()"><i class="fas fa-trash-alt"></i> Vider</button></div><div class="pos-cart-items">';
    if (clientCart.length===0) { h += '<div class="pos-cart-empty"><i class="fas fa-shopping-basket"></i><p>Panier vide</p></div>'; }
    else { for (var k = 0; k < clientCart.length; k++) { var it = clientCart[k]; var opts = ''; if (it.interdits&&it.interdits.length>0) opts += ' <span style="color:#ef4444;font-size:0.6rem;">🚫'+escapeHtml(it.interdits.join(','))+'</span>'; if (it.epice&&it.epice!=='Normal') opts += ' <span style="color:#d97706;font-size:0.6rem;">🌶️'+escapeHtml(it.epice)+'</span>'; if (it.sel&&it.sel!=='Normal') opts += ' <span style="color:#4f46e5;font-size:0.6rem;">🧂'+escapeHtml(it.sel)+'</span>'; h += '<div class="pos-cart-item"><div class="pos-cart-item-info"><span class="pos-cart-item-name">'+escapeHtml(it.nom)+opts+'</span><span class="pos-cart-item-price">'+it.prixUnitaire.toFixed(2)+' MAD/u</span></div><div class="pos-cart-item-actions"><button class="pos-qty-btn" onclick="clientUpdateQty('+k+',-1)"><i class="fas fa-minus"></i></button><span class="pos-qty-value">'+it.quantite+'</span><button class="pos-qty-btn" onclick="clientUpdateQty('+k+',1)"><i class="fas fa-plus"></i></button><button class="pos-remove-btn" onclick="clientRemoveItem('+k+')"><i class="fas fa-times"></i></button></div><span class="pos-cart-item-total">'+(it.prixUnitaire*it.quantite).toFixed(2)+' MAD</span></div>'; } }
    h += '</div><div class="pos-cart-footer"><div class="pos-cart-total-row"><span>Total</span><span>'+total.toFixed(2)+' MAD</span></div><button class="pos-validate-btn" onclick="clientValidateOrder()" '+(clientCart.length===0?'disabled':'')+'><i class="fas fa-check-circle"></i> Commander</button></div></div></div>';
    c.innerHTML = h;
}

function clientFilterCategory(ca) { clientSelectedCategory = ca; renderClientPOS(); }
function clientUpdateQty(i, ch) { var it = clientCart[i]; if (!it) return; var p = clientProductsList.find(function(x) { return x.id === it.id; }); var nq = it.quantite + ch; if (nq <= 0) clientCart.splice(i, 1); else { if (p && p.stock !== undefined && nq > p.stock) { alert('Stock max: ' + p.stock); return; } it.quantite = nq; } renderClientPOS(); }
function clientRemoveItem(i) { clientCart.splice(i, 1); renderClientPOS(); }
function clientCalculateTotal() { var t = 0; for (var i = 0; i < clientCart.length; i++) t += clientCart[i].prixUnitaire * clientCart[i].quantite; return t; }
function clientClearCart() { clientCart = []; renderClientPOS(); }

async function clientValidateOrder() {
    if (clientCart.length === 0) { alert('Votre panier est vide'); return; }
    var total = clientCalculateTotal(); var ud = window.currentUserData ? window.currentUserData.userData : {};
    var orderData = {
        items: JSON.parse(JSON.stringify(clientCart)),
        total: total,
        clientId: window.currentUserData ? window.currentUserData.uid : null,
        clientName: ud.prenom + ' ' + ud.nom,
        clientEmail: ud.email,
        clientTelephone: ud.telephone,
        statut: 'en_attente',
        source: 'client',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await CacheDB.write('commandes', null, orderData, 'add');
    alert('✅ Commande envoyée !\nTotal: ' + total.toFixed(2) + ' MAD');
    clientCart = [];
    renderClientPOS();
    CacheDB.sync();
}
// ==================== CLIENT.JS - ALMA COFFEE SHOP (PARTIE 2) ====================

async function loadClientHistoriquePage() {
    var c = document.getElementById('clientDynamicContent'); if (!c) return;
    c.innerHTML = '<div class="content-card"><div class="card-header"><h3><i class="fas fa-history"></i> Mon historique</h3></div><div id="clientOrdersList" style="text-align:center;padding:20px;">Chargement...</div></div>';
    if (!window.currentUserData) { var cont0 = document.getElementById('clientOrdersList'); if (cont0) cont0.innerHTML = '<p>Non connecté</p>'; return; }
    var uid = window.currentUserData.uid, clientName = (window.currentUserData.userData.prenom + ' ' + window.currentUserData.userData.nom).toLowerCase().trim(), clientEmail = (window.currentUserData.userData.email || '').toLowerCase().trim(), clientTelephone = (window.currentUserData.userData.telephone || '').trim();
    try {
        let cmdSnap, venteSnap;
        try {
            cmdSnap = await db.collection('commandes').where('clientId', '==', uid).get();
            venteSnap = await db.collection('ventes').where('clientId', '==', uid).get();
        } catch(e) {
            cmdSnap = await db.collection('commandes').get();
            venteSnap = await db.collection('ventes').get();
        }
        var all = [];
        cmdSnap.forEach(function(d) { var cmd = d.data(); if (cmd.clientId === uid) all.push({type: 'commande', data: cmd, date: cmd.createdAt}); });
        venteSnap.forEach(function(d) { var v = d.data(); if (v.clientId === uid) all.push({type: 'vente', data: v, date: v.createdAt}); });
        all.sort(function(a, b) { return (b.date?.seconds || 0) - (a.date?.seconds || 0); }); all = all.slice(0, 50);
        var cont = document.getElementById('clientOrdersList'); if (!cont) return;
        if (all.length === 0) { cont.innerHTML = '<p style="padding:40px;color:#94a3b8;"><i class="fas fa-inbox" style="font-size:2rem;display:block;margin-bottom:10px;"></i>Aucun historique</p>'; return; }
        var h = '<div class="table-container"><table class="data-table" style="font-size:0.75rem;"><thead><tr><th>Date</th><th>Type</th><th>N° Facture</th><th>Articles</th><th>Total</th><th>Vendeur</th><th>Paiement</th><th>Statut</th></tr></thead><tbody>';
        all.forEach(function(item) { var d = item.data, date = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleString('fr-FR') : '', type = item.type === 'commande' ? '<span class="status-warning">🛒 Commande</span>' : '<span style="color:#A67C52;">💰 Vente</span>', facture = d.factureNum || '-', arts = d.items ? d.items.map(function(it) { return it.quantite + 'x ' + escapeHtml(it.nom); }).join('<br>') : '-', vendeur = d.vendeur || d.createdBy || '-', paiement = d.paymentMethod === 'espece' ? 'Espèces' : d.paymentMethod === 'credit' ? 'Crédit' : d.paymentMethod === 'partiel' ? 'Partiel' : '-', statut = item.type === 'commande' ? (d.statut === 'valide' ? '✅ Validée' : d.statut === 'payé' ? '💵 Payée' : '⏳ En attente') : (d.paid ? '✅ Payé' : d.statutPaiement === 'crédit' ? '📋 Crédit' : d.statutPaiement === 'partiel' ? '🔶 Partiel' : '⏳ En attente'), sc = (statut.includes('✅') || statut.includes('💵')) ? '#16a34a' : '#d97706'; h += '<tr><td>' + date + '</td><td>' + type + '</td><td><small>' + facture + '</small></td><td><small>' + arts + '</small><td><strong>' + (d.total || 0).toFixed(2) + ' MAD</strong></td><td>' + vendeur + '</td><td>' + paiement + '</td><td><span style="color:' + sc + ';">' + statut + '</span></td></tr>'; });
        h += '</tbody></table></div>'; cont.innerHTML = h;
    } catch(e) { var cont2 = document.getElementById('clientOrdersList'); if (cont2) cont2.innerHTML = '<p style="color:#ef4444;">Erreur</p>'; }
}

async function loadClientParametresPage() {
    var c = document.getElementById('clientDynamicContent');
    if (!c) return;
    if (!window.currentUserData) { c.innerHTML = '<div class="content-card"><p>Non connecté</p></div>'; return; }
    var clientData = null;
    var clientDocId = null;
    var userEmail = window.currentUserData.userData.email;
    try {
        var clientSnap = await db.collection('clients').where('email', '==', userEmail).get();
        if (!clientSnap.empty) { clientDocId = clientSnap.docs[0].id; clientData = clientSnap.docs[0].data(); }
    } catch(e) { console.error('Erreur chargement profil:', e); }
    if (!clientData) clientData = window.currentUserData.userData;
    var dateCreated = clientData.createdAt ? new Date(clientData.createdAt.seconds * 1000).toLocaleString('fr-FR') : 'N/A';
    var h = '<div class="content-card"><div class="card-header"><h3><i class="fas fa-user-circle"></i> Mon Profil</h3></div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.9rem;">';
    h += '<div><strong>ID:</strong> ' + (clientDocId ? clientDocId.substring(0, 8) : 'N/A') + '</div>';
    h += '<div><strong>Nom:</strong> ' + escapeHtml(clientData.nom || '') + '</div>';
    h += '<div><strong>Prénom:</strong> ' + escapeHtml(clientData.prenom || '') + '</div>';
    h += '<div><strong>Username:</strong> @' + escapeHtml(clientData.username || '') + '</div>';
    h += '<div><strong>Genre:</strong> ' + escapeHtml(clientData.genre || '-') + '</div>';
    h += '<div><strong>Adresse:</strong> ' + escapeHtml(clientData.adresse || '-') + '</div>';
    h += '<div><strong>Email:</strong> ' + escapeHtml(clientData.email || '') + '</div>';
    h += '<div><strong>Tél:</strong> ' + escapeHtml(clientData.telephone || '-') + '</div>';
    h += '<div><strong>WhatsApp:</strong> ' + escapeHtml(clientData.whatsapp || '-') + '</div>';
    h += '<div><strong>Facebook:</strong> ' + escapeHtml(clientData.facebook || '-') + '</div>';
    h += '<div><strong>Instagram:</strong> ' + escapeHtml(clientData.instagram || '-') + '</div>';
    h += '<div><strong>Points Fidélité:</strong> ' + (clientData.pointsFidelite || 0) + '</div>';
    h += '<div><strong>Allergies:</strong> ' + (clientData.allergies ? clientData.allergies.join(', ') : '-') + '</div>';
    h += '<div><strong>Aime:</strong> ' + (clientData.aime ? clientData.aime.join(', ') : '-') + '</div>';
    h += '<div><strong>Déteste:</strong> ' + (clientData.deteste ? clientData.deteste.join(', ') : '-') + '</div>';
    h += '<div><strong>Date créé:</strong> ' + dateCreated + '</div>';
    h += '</div>';
    h += '<div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;">';
    h += '<button class="btn-add" onclick="clientOpenEditProfile()"><i class="fas fa-edit"></i> Modifier mon profil</button>';
    h += '<button class="btn-save" onclick="clientOpenChangePassword()"><i class="fas fa-lock"></i> Changer mot de passe</button>';
    h += '</div>';
    h += '</div>';
    c.innerHTML = h;
    window.clientProfileData = clientData;
    window.clientProfileDocId = clientDocId;
}

function clientOpenEditProfile() {
    var data = window.clientProfileData || window.currentUserData.userData;
    var h = '';
    h += '<div class="form-row"><div class="form-group"><label>Nom *</label><input type="text" id="clientEditNom" value="' + escapeHtml(data.nom || '') + '" required></div><div class="form-group"><label>Prénom *</label><input type="text" id="clientEditPrenom" value="' + escapeHtml(data.prenom || '') + '" required></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Genre</label><select id="clientEditGenre"><option value="">-</option><option value="M" ' + (data.genre === 'M' ? 'selected' : '') + '>M</option><option value="F" ' + (data.genre === 'F' ? 'selected' : '') + '>F</option></select></div><div class="form-group"><label>Adresse</label><input type="text" id="clientEditAdresse" value="' + escapeHtml(data.adresse || '') + '"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Téléphone</label><input type="text" id="clientEditTel" value="' + escapeHtml(data.telephone || '') + '"></div><div class="form-group"><label>WhatsApp</label><input type="text" id="clientEditWhatsapp" value="' + escapeHtml(data.whatsapp || '') + '"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Facebook</label><input type="text" id="clientEditFacebook" value="' + escapeHtml(data.facebook || '') + '"></div><div class="form-group"><label>Instagram</label><input type="text" id="clientEditInstagram" value="' + escapeHtml(data.instagram || '') + '"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Allergies (virgules)</label><input type="text" id="clientEditAllergies" value="' + (data.allergies ? data.allergies.join(', ') : '') + '" placeholder="gluten, lactose"></div><div class="form-group"><label>Aime (virgules)</label><input type="text" id="clientEditAime" value="' + (data.aime ? data.aime.join(', ') : '') + '" placeholder="café, thé"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Déteste (virgules)</label><input type="text" id="clientEditDeteste" value="' + (data.deteste ? data.deteste.join(', ') : '') + '" placeholder="oignon, tomate"></div></div>';
    h += '<button class="btn-cancel" onclick="closeModal()">Annuler</button><button class="btn-save" onclick="clientSaveProfile()">Enregistrer</button>';
    openModal('✏️ Modifier mon profil', h);
}

async function clientSaveProfile() {
    var nom = document.getElementById('clientEditNom').value.trim();
    var prenom = document.getElementById('clientEditPrenom').value.trim();
    if (!nom || !prenom) { alert('Nom et Prénom obligatoires'); return; }
    var updatedData = {
        nom: nom, prenom: prenom,
        genre: document.getElementById('clientEditGenre').value,
        adresse: document.getElementById('clientEditAdresse').value,
        telephone: document.getElementById('clientEditTel').value,
        whatsapp: document.getElementById('clientEditWhatsapp').value,
        facebook: document.getElementById('clientEditFacebook').value,
        instagram: document.getElementById('clientEditInstagram').value,
        allergies: document.getElementById('clientEditAllergies').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean),
        aime: document.getElementById('clientEditAime').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean),
        deteste: document.getElementById('clientEditDeteste').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
        var docId = window.clientProfileDocId;
        if (docId) {
            await CacheDB.write('clients', docId, updatedData, 'update');
            await CacheDB.write('users', window.currentUserData.uid, { nom: nom, prenom: prenom, telephone: updatedData.telephone }, 'update');
        } else {
            updatedData.email = window.currentUserData.userData.email;
            updatedData.username = window.currentUserData.userData.username;
            updatedData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            var newDocId = await CacheDB.write('clients', null, updatedData, 'add');
            window.clientProfileDocId = newDocId;
        }
        window.currentUserData.userData.nom = nom;
        window.currentUserData.userData.prenom = prenom;
        window.clientProfileData = updatedData;
        alert('✅ Profil mis à jour !');
        closeModal();
        loadClientParametresPage();
        CacheDB.sync();
    } catch(e) { alert('Erreur: ' + e.message); }
}

function clientOpenChangePassword() {
    var h = '<div class="form-row"><div class="form-group"><label>Mot de passe actuel</label><input type="password" id="clientOldPassword" required></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Nouveau mot de passe</label><input type="password" id="clientNewPassword" required minlength="6"></div></div>';
    h += '<div class="form-row"><div class="form-group"><label>Confirmer nouveau mot de passe</label><input type="password" id="clientConfirmPassword" required minlength="6"></div></div>';
    h += '<button class="btn-cancel" onclick="closeModal()">Annuler</button><button class="btn-save" onclick="clientChangePassword()">Changer le mot de passe</button>';
    openModal('🔒 Changer mot de passe', h);
}

async function clientChangePassword() {
    var oldPass = document.getElementById('clientOldPassword').value;
    var newPass = document.getElementById('clientNewPassword').value;
    var confirmPass = document.getElementById('clientConfirmPassword').value;
    if (!oldPass || !newPass || !confirmPass) { alert('Tous les champs sont obligatoires'); return; }
    if (newPass.length < 6) { alert('Le nouveau mot de passe doit contenir au moins 6 caractères'); return; }
    if (newPass !== confirmPass) { alert('Les mots de passe ne correspondent pas'); return; }
    var user = auth.currentUser;
    if (!user) { alert('Vous n\'êtes pas connecté'); return; }
    var credential = firebase.auth.EmailAuthProvider.credential(user.email, oldPass);
    try {
        await user.reauthenticateWithCredential(credential);
        await user.updatePassword(newPass);
        alert('✅ Mot de passe changé avec succès !');
        closeModal();
    } catch(e) {
        if (e.code === 'auth/wrong-password') alert('❌ Mot de passe actuel incorrect');
        else alert('Erreur: ' + e.message);
    }
}

console.log('☕ Alma Coffee Shop - Client JS prêt');
