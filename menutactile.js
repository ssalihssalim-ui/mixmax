// ==================== MENU TACTILE - ALMA COFFEE SHOP ====================
var menuTableNum = null;
var menuCart = [];
var menuCategories = [];
var menuProducts = [];
var menuSelectedCategory = 'all';
var menuCurrentProductId = null;

var menuEpices = ['Normal', 'Moins épicé', 'Très épicé', 'Sans épice'];
var menuSel = ['Normal', 'Moins de sel', 'Sans sel'];

var allStockData = [];

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function closeMenuTactile() {
    window.location.href = window.location.pathname;
}

function requestFullscreen() {
    const elem = document.documentElement;
    const method = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.msRequestFullscreen;
    if (method) {
        method.call(elem).catch(err => console.log(err));
    } else {
        alert("Ajouter à l'écran d'accueil pour le plein écran.");
    }
}

async function loadMenuData() {
    console.log('📱 Chargement des données du menu tactile...');
    
    var content = document.getElementById('menuTactileContent');
    if (!content) {
        console.error('Conteneur menuTactileContent non trouvé');
        return;
    }
    
    content.innerHTML = '<div style="text-align:center;padding:60px;"><i class="fas fa-spinner fa-spin" style="font-size:3rem;color:#A67C52;"></i><p>Chargement du menu...</p></div>';
    
    try {
        // Charger les catégories
        const catSnap = await db.collection('categories').get();
        menuCategories = [];
        catSnap.forEach(d => {
            menuCategories.push({
                id: d.id,
                nom: d.data().nom || 'Sans nom',
                imageBase64: d.data().imageBase64 || '',
                recette: d.data().recette || false
            });
        });
        console.log('✅ Catégories chargées:', menuCategories.length);
        
        // Charger les produits
        const prodSnap = await db.collection('products').get();
        menuProducts = [];
        prodSnap.forEach(d => {
            const dd = d.data();
            if (dd.disponible !== false) {
                menuProducts.push({
                    id: d.id,
                    nom: dd.nom || 'Sans nom',
                    prixVente: dd.prixVente || 0,
                    prixPromo: dd.prixPromo || 0,
                    stock: dd.stock,
                    categorie: dd.categorie || '',
                    imageBase64: dd.imageBase64 || ''
                });
            }
        });
        console.log('✅ Produits chargés:', menuProducts.length);
        
        // Charger le stock pour les ingrédients
        const stockSnap = await db.collection('stock').get();
        allStockData = [];
        stockSnap.forEach(d => {
            let dd = d.data();
            dd.id = d.id;
            allStockData.push(dd);
        });
        
        renderMenuTactile();
        
    } catch (e) {
        console.error('Erreur chargement menu:', e);
        content.innerHTML = '<div style="text-align:center;padding:50px;"><i class="fas fa-exclamation-circle" style="font-size:3rem;color:#ef4444;"></i><p>Erreur de chargement</p><button class="btn-add" onclick="loadMenuData()">Réessayer</button></div>';
    }
}

function renderMenuTactile() {
    var content = document.getElementById('menuTactileContent');
    if (!content) return;
    
    var total = menuCart.reduce((sum, item) => sum + (item.prixUnitaire * item.quantite), 0);
    var html = '';
    
    // En-tête
    html += '<div style="position:sticky; top:0; z-index:20; background:linear-gradient(135deg,#A67C52,#6F4E37); color:#fff; border-radius:0 0 24px 24px; margin-bottom:15px; text-align:center; padding:20px 15px;">';
    html += '<button onclick="closeMenuTactile()" style="position:absolute; top:10px; right:15px; background:rgba(0,0,0,0.3); border:none; color:white; font-size:1.8rem; width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;">&times;</button>';
    html += '<img src="logo.png" style="width:70px;height:70px;border-radius:50%;border:3px solid #fff;object-fit:cover;margin-bottom:8px;" onerror="this.style.display=\'none\'">';
    html += '<h1 style="margin:0;font-size:1.4rem;">Alma <span style="color:#fff;">Coffee</span></h1>';
    html += '<p style="margin:5px 0 0;">☕ Table n° ' + menuTableNum + '</p></div>';
    
    // Catégories
    html += '<div style="overflow-x:auto;white-space:nowrap;padding:10px 10px 5px 10px;">';
    html += '<button onclick="menuFilterCategory(\'all\')" style="display:inline-block;padding:8px 16px;margin:0 4px;border-radius:50px;border:2px solid ' + (menuSelectedCategory === 'all' ? '#A67C52' : '#e2e8f0') + ';background:' + (menuSelectedCategory === 'all' ? '#A67C52' : '#fff') + ';color:' + (menuSelectedCategory === 'all' ? '#fff' : '#1e293b') + ';font-weight:600;">📋 Tous</button>';
    for (var i = 0; i < menuCategories.length; i++) {
        var cat = menuCategories[i];
        var active = menuSelectedCategory === cat.nom;
        html += '<button onclick="menuFilterCategory(\'' + escapeHtml(cat.nom).replace(/'/g, "\\'") + '\')" style="display:inline-block;padding:8px 16px;margin:0 4px;border-radius:50px;border:2px solid ' + (active ? '#A67C52' : '#e2e8f0') + ';background:' + (active ? '#A67C52' : '#fff') + ';color:' + (active ? '#fff' : '#1e293b') + ';font-weight:600;">' + escapeHtml(cat.nom) + '</button>';
    }
    html += '</div>';
    
    // Produits
    var filtered = menuProducts;
    if (menuSelectedCategory !== 'all') {
        filtered = menuProducts.filter(p => p.categorie === menuSelectedCategory);
    }
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(140px, 1fr));gap:10px;padding:10px;">';
    if (filtered.length === 0) {
        html += '<div style="grid-column:1/-1;text-align:center;padding:30px;">Aucun produit</div>';
    } else {
        for (var j = 0; j < filtered.length; j++) {
            var p = filtered[j];
            var price = (p.prixPromo && p.prixPromo > 0) ? p.prixPromo : p.prixVente;
            var outOfStock = p.stock !== undefined && p.stock <= 0;
            html += '<div onclick="' + (outOfStock ? '' : 'menuAddToCartOrOpenOptions(\'' + p.id + '\')') + '" style="background:#fff;border:2px solid ' + (outOfStock ? '#fecaca' : '#e2e8f0') + ';border-radius:16px;padding:10px;cursor:' + (outOfStock ? 'not-allowed' : 'pointer') + ';opacity:' + (outOfStock ? '0.5' : '1') + ';text-align:center;">';
            if (p.imageBase64) {
                html += '<div style="height:100px;border-radius:12px;overflow:hidden;margin-bottom:6px;"><img src="' + escapeHtml(p.imageBase64) + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.src=\'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23A67C52\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M3 3h18v18H3z\'/%3E%3C/svg%3E\'"></div>';
            } else {
                html += '<div style="height:100px;border-radius:12px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:2rem;">☕</div>';
            }
            html += '<div style="font-weight:600;font-size:0.9rem;">' + escapeHtml(p.nom) + '</div>';
            html += '<div style="font-weight:700;color:#A67C52;">' + price.toFixed(2) + ' MAD</div>';
            if (outOfStock) html += '<div style="font-size:0.7rem;color:#ef4444;">Rupture</div>';
            html += '</div>';
        }
    }
    html += '</div>';
    
    // Panier
    html += '<div style="position:sticky;bottom:0;background:#fff;padding:12px;border-radius:20px 20px 0 0;box-shadow:0 -2px 15px rgba(0,0,0,0.1);margin-top:10px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><strong>🛒 Mon panier</strong><span style="background:#A67C52;color:#fff;padding:2px 10px;border-radius:20px;">' + menuCart.length + ' article(s)</span></div>';
    if (menuCart.length === 0) {
        html += '<p style="text-align:center;color:#94a3b8;margin:5px 0;">Cliquez sur un produit</p>';
    } else {
        html += '<div style="max-height:130px;overflow-y:auto;margin-bottom:8px;">';
        for (var k = 0; k < menuCart.length; k++) {
            var it = menuCart[k];
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f1f5f9;">';
            html += '<span style="font-size:0.85rem;">' + it.quantite + 'x ' + escapeHtml(it.nom) + '</span>';
            html += '<div><button onclick="menuUpdateQty(' + k + ',-1)" style="width:26px;height:26px;border-radius:50%;border:1px solid #ccc;">-</button> <span style="min-width:24px;text-align:center;">' + it.quantite + '</span> <button onclick="menuUpdateQty(' + k + ',1)" style="width:26px;height:26px;border-radius:50%;border:1px solid #ccc;">+</button> <span style="min-width:65px;text-align:right;">' + (it.prixUnitaire * it.quantite).toFixed(2) + '</span></div>';
            html += '</div>';
        }
        html += '</div>';
    }
    html += '<div style="display:flex;justify-content:space-between;font-weight:700;font-size:1.1rem;margin:8px 0;"><span>Total</span><span style="color:#A67C52;">' + total.toFixed(2) + ' MAD</span></div>';
    html += '<button onclick="menuValiderCommande()" ' + (menuCart.length === 0 ? 'disabled' : '') + ' style="width:100%;padding:12px;border:none;border-radius:12px;background:' + (menuCart.length === 0 ? '#cbd5e1' : 'linear-gradient(135deg,#A67C52,#6F4E37)') + ';color:#fff;font-weight:700;">✅ Commander</button>';
    if (menuCart.length > 0) html += '<button onclick="menuClearCart()" style="width:100%;margin-top:8px;padding:6px;border:1px solid #ccc;background:#fff;border-radius:12px;">🗑️ Vider</button>';
    html += '</div>';
    
    // Bouton plein écran
    html += '<button onclick="requestFullscreen()" style="position:fixed;bottom:20px;right:20px;background:#A67C52;color:white;border:none;border-radius:50%;width:45px;height:45px;font-size:20px;box-shadow:0 2px 8px rgba(0,0,0,0.2);cursor:pointer;z-index:1000;">⛶</button>';
    
    content.innerHTML = html;
}

function menuFilterCategory(cat) {
    menuSelectedCategory = cat;
    renderMenuTactile();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function menuUpdateQty(idx, delta) {
    if (!menuCart[idx]) return;
    var nq = menuCart[idx].quantite + delta;
    if (nq <= 0) {
        menuCart.splice(idx, 1);
    } else {
        menuCart[idx].quantite = nq;
    }
    renderMenuTactile();
}

function menuClearCart() {
    if (confirm('Vider le panier ?')) {
        menuCart = [];
        renderMenuTactile();
    }
}

function menuAddToCartOrOpenOptions(pid) {
    var p = menuProducts.find(x => x.id === pid);
    if (!p) return;
    if (p.stock !== undefined && p.stock <= 0) {
        alert('⚠️ Rupture de stock.');
        return;
    }
    var cat = menuCategories.find(c => c.nom === p.categorie);
    var isRecette = cat && cat.recette === true;
    
    if (isRecette) {
        menuCurrentProductId = pid;
        menuOpenOptions(pid);
    } else {
        var existing = menuCart.find(x => x.id === pid);
        if (existing) {
            if (p.stock !== undefined && existing.quantite >= p.stock) {
                alert('Stock insuffisant');
                return;
            }
            existing.quantite++;
        } else {
            var price = (p.prixPromo && p.prixPromo > 0) ? p.prixPromo : p.prixVente;
            menuCart.push({
                id: p.id,
                nom: p.nom,
                prixUnitaire: price,
                quantite: 1,
                sauces: [],
                interdits: [],
                epice: 'Normal',
                sel: 'Normal'
            });
        }
        renderMenuTactile();
    }
}

async function menuOpenOptions(pid) {
    var p = menuProducts.find(x => x.id === pid);
    if (!p) return;
    if (p.stock !== undefined && p.stock <= 0) {
        alert('⚠️ Rupture');
        return;
    }
    
    // Récupérer les ingrédients du produit
    var productIngredients = [];
    try {
        const doc = await db.collection('products').doc(pid).get();
        if (doc.exists) {
            productIngredients = doc.data().ingredients || [];
        }
    } catch (e) {
        console.error(e);
    }
    
    // Regrouper par catégorie
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
    
    menuCurrentProductId = pid;
    var h = '<h4>' + escapeHtml(p.nom) + '</h4>';
    
    if (sortedCats.length === 0) {
        h += '<div style="margin-bottom:12px;color:#94a3b8;">Aucun ingrédient à exclure</div>';
    } else {
        sortedCats.forEach(function(cat) {
            h += '<div style="margin-bottom:12px;">';
            h += '<label style="font-weight:600;">🥫 ' + escapeHtml(cat) + '</label>';
            h += '<div style="display:flex;flex-wrap:wrap;gap:5px;">';
            grouped[cat].forEach(function(ing) {
                h += '<label style="display:flex;align-items:center;gap:4px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.75rem;">';
                h += '<input type="checkbox" class="menu-interdit-check" value="' + escapeHtml(ing) + '"> ' + escapeHtml(ing);
                h += '</label>';
            });
            h += '</div></div>';
        });
    }
    
    h += '<div style="margin-bottom:12px;"><label style="font-weight:600;">🌶️ Épices:</label><div style="display:flex;flex-wrap:wrap;gap:5px;">';
    menuEpices.forEach(function(s, idx) {
        h += '<label style="display:flex;align-items:center;gap:4px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.75rem;"><input type="radio" name="menu-epice" value="' + s + '" ' + (idx === 0 ? 'checked' : '') + '> ' + s + '</label>';
    });
    h += '</div></div>';
    h += '<div style="margin-bottom:12px;"><label style="font-weight:600;">🧂 Sel:</label><div style="display:flex;flex-wrap:wrap;gap:5px;">';
    menuSel.forEach(function(s, idx) {
        h += '<label style="display:flex;align-items:center;gap:4px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:0.75rem;"><input type="radio" name="menu-sel" value="' + s + '" ' + (idx === 0 ? 'checked' : '') + '> ' + s + '</label>';
    });
    h += '</div></div>';
    
    h += '<div style="text-align:right;margin-top:15px;"><button class="btn-cancel" onclick="closeModal()">Annuler</button> <button class="btn-save" onclick="menuConfirmOptions()">Ajouter</button></div>';
    openModal('Personnaliser - ' + escapeHtml(p.nom), h);
}

function menuConfirmOptions() {
    var interdits = Array.from(document.querySelectorAll('.menu-interdit-check:checked')).map(cb => cb.value);
    var epice = document.querySelector('input[name="menu-epice"]:checked')?.value || 'Normal';
    var sel = document.querySelector('input[name="menu-sel"]:checked')?.value || 'Normal';
    var p = menuProducts.find(x => x.id === menuCurrentProductId);
    if (!p) {
        closeModal();
        return;
    }
    var existing = menuCart.find(x => x.id === p.id);
    if (existing) {
        if (p.stock !== undefined && existing.quantite >= p.stock) {
            alert('Stock insuffisant');
            closeModal();
            return;
        }
        existing.quantite++;
    } else {
        var price = (p.prixPromo && p.prixPromo > 0) ? p.prixPromo : p.prixVente;
        menuCart.push({
            id: p.id,
            nom: p.nom,
            prixUnitaire: price,
            quantite: 1,
            sauces: [],
            interdits: interdits,
            epice: epice,
            sel: sel
        });
    }
    closeModal();
    renderMenuTactile();
}

async function menuValiderCommande() {
    if (menuCart.length === 0) {
        alert('⚠️ Panier vide.');
        return;
    }
    var total = menuCart.reduce((sum, item) => sum + (item.prixUnitaire * item.quantite), 0);
    if (!confirm('📋 Confirmer la commande ?\nTable ' + menuTableNum + '\nTotal: ' + total.toFixed(2) + ' MAD')) return;
    
    try {
        await db.collection('commandes').add({
            items: JSON.parse(JSON.stringify(menuCart)),
            total: total,
            table: menuTableNum,
            clientName: 'Table ' + menuTableNum,
            statut: 'en_attente',
            source: 'menu_tactile',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('✅ Commande envoyée !');
        menuCart = [];
        renderMenuTactile();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
        alert('❌ Erreur: ' + e.message);
    }
}

// Point d'entrée pour l'initialisation
function initMenuTactile(tableNum) {
    console.log('🍽️ Démarrage menu tactile pour la table:', tableNum);
    menuTableNum = tableNum;
    
    // S'assurer que la page est visible
    const menuPage = document.getElementById('menuTactilePage');
    if (menuPage) {
        menuPage.classList.remove('hidden');
        menuPage.style.display = 'block';
    }
    
    // Créer le conteneur si nécessaire
    let content = document.getElementById('menuTactileContent');
    if (!content) {
        content = document.createElement('div');
        content.id = 'menuTactileContent';
        content.style.padding = '20px';
        content.style.paddingBottom = '100px';
        if (menuPage) menuPage.appendChild(content);
    }
    
    // Charger les données
    loadMenuData();
}

console.log('☕ Menu tactile Alma Coffee Shop prêt');
