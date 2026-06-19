// ==================== INDEXEDDB CACHE + PENDING OPERATIONS ====================
const DB_NAME = 'AlmaCoffeeDB';
const DB_VERSION = 1;
const CACHE_STORE = 'firestore_cache';
const PENDING_STORE = 'pending_operations';

let dbInstance = null;

function openDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance && dbInstance.name === DB_NAME) {
            resolve(dbInstance);
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(CACHE_STORE)) {
                const cacheStore = db.createObjectStore(CACHE_STORE, { keyPath: 'id' });
                cacheStore.createIndex('collection', 'collection', { unique: false });
                cacheStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
            if (!db.objectStoreNames.contains(PENDING_STORE)) {
                const pendingStore = db.createObjectStore(PENDING_STORE, { keyPath: 'id' });
                pendingStore.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };
    });
}

async function cacheSet(collection, docId, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, 'readwrite');
        const store = tx.objectStore(CACHE_STORE);
        const record = {
            id: `${collection}_${docId}`,
            collection,
            docId,
            data,
            updatedAt: Date.now()
        };
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function cacheGet(collection, docId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, 'readonly');
        const store = tx.objectStore(CACHE_STORE);
        const request = store.get(`${collection}_${docId}`);
        request.onsuccess = () => resolve(request.result ? request.result.data : null);
        request.onerror = () => reject(request.error);
    });
}

async function cacheGetAll(collection) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, 'readonly');
        const store = tx.objectStore(CACHE_STORE);
        const index = store.index('collection');
        const request = index.getAll(collection);
        request.onsuccess = () => {
            const results = request.result;
            resolve(results.map(r => ({ id: r.docId, ...r.data })));
        };
        request.onerror = () => reject(request.error);
    });
}

async function cacheDelete(collection, docId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, 'readwrite');
        const store = tx.objectStore(CACHE_STORE);
        const request = store.delete(`${collection}_${docId}`);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function cacheClear() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, 'readwrite');
        const store = tx.objectStore(CACHE_STORE);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

let isProcessing = false;

function addPendingOperation(operation) {
    return new Promise(async (resolve, reject) => {
        const db = await openDB();
        const tx = db.transaction(PENDING_STORE, 'readwrite');
        const store = tx.objectStore(PENDING_STORE);
        const id = Date.now() + '-' + Math.random().toString(36).substr(2, 6);
        const record = { id, ...operation, createdAt: Date.now() };
        const request = store.add(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getAllPendingOperations() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PENDING_STORE, 'readonly');
        const store = tx.objectStore(PENDING_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function removePendingOperation(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PENDING_STORE, 'readwrite');
        const store = tx.objectStore(PENDING_STORE);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function processPendingOperations() {
    if (isProcessing) return;
    isProcessing = true;
    try {
        const pending = await getAllPendingOperations();
        for (const op of pending) {
            try {
                let ref;
                if (op.type === 'add') {
                    ref = await db.collection(op.collection).add(op.data);
                    const newDoc = { id: ref.id, ...op.data };
                    await cacheSet(op.collection, ref.id, newDoc);
                } else if (op.type === 'set') {
                    await db.collection(op.collection).doc(op.docId).set(op.data, { merge: true });
                    const newDoc = { id: op.docId, ...op.data };
                    await cacheSet(op.collection, op.docId, newDoc);
                } else if (op.type === 'update') {
                    await db.collection(op.collection).doc(op.docId).update(op.data);
                    const existing = await cacheGet(op.collection, op.docId);
                    const updated = { ...existing, ...op.data };
                    await cacheSet(op.collection, op.docId, updated);
                } else if (op.type === 'delete') {
                    await db.collection(op.collection).doc(op.docId).delete();
                    await cacheDelete(op.collection, op.docId);
                }
                await removePendingOperation(op.id);
            } catch (err) {
                console.warn('Échec synchro (réessaiera plus tard)', op, err);
            }
        }
    } finally {
        isProcessing = false;
    }
}

window.addEventListener('online', () => {
    console.log('🟢 Connexion rétablie – synchronisation des opérations en attente');
    processPendingOperations();
});

async function forceSync() {
    await processPendingOperations();
}

function isNetworkAvailable() {
    return navigator.onLine;
}

async function writeDocument(collection, docId, data, type = 'set') {
    if (isNetworkAvailable()) {
        try {
            if (type === 'add') {
                const ref = await db.collection(collection).add(data);
                const newDoc = { id: ref.id, ...data };
                await cacheSet(collection, ref.id, newDoc);
                return ref.id;
            } else if (type === 'set') {
                await db.collection(collection).doc(docId).set(data, { merge: true });
                const newDoc = { id: docId, ...data };
                await cacheSet(collection, docId, newDoc);
                return docId;
            } else if (type === 'update') {
                await db.collection(collection).doc(docId).update(data);
                const existing = await cacheGet(collection, docId);
                const updated = { ...existing, ...data };
                await cacheSet(collection, docId, updated);
                return docId;
            } else if (type === 'delete') {
                await db.collection(collection).doc(docId).delete();
                await cacheDelete(collection, docId);
                return docId;
            }
        } catch (err) {
            console.warn('Erreur réseau, mise en file d\'attente', err);
            await addPendingOperation({ type, collection, docId, data });
            return null;
        }
    } else {
        await addPendingOperation({ type, collection, docId, data });
        return null;
    }
}

window.CacheDB = {
    set: cacheSet,
    get: cacheGet,
    getAll: cacheGetAll,
    delete: cacheDelete,
    clear: cacheClear,
    sync: processPendingOperations,
    write: writeDocument,
    addPendingOperation,
    isOnline: () => navigator.onLine
};

console.log('☕ Alma Coffee Shop - Cache DB OK');
