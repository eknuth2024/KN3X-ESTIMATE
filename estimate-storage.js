// Estimates and their photos use IndexedDB; the old localStorage copy remains untouched.
class EstimateDocumentStorage {
    constructor(legacyKey) { this.legacyKey = legacyKey; this.db = null; this.cache = null; this.loading = null; }
    validate(data) {
        if (!data || data.version !== 1 || !Array.isArray(data.estimates)) throw new Error('Invalid estimate store');
        const numbers = new Set(), ids = new Set();
        for (const record of data.estimates) {
            if (!record || !Number.isSafeInteger(record.number) || record.number < 1 || !record.id || !record.document || numbers.has(record.number) || ids.has(record.id)) throw new Error('Invalid saved estimate');
            numbers.add(record.number); ids.add(record.id);
        }
        return data;
    }
    snapshot() {
        if (!this.cache) throw new Error('Estimate storage is not ready');
        return structuredClone(this.cache);
    }
    initialize() {
        if (this.loading) return this.loading;
        this.loading = new Promise((resolve,reject) => {
            const request = indexedDB.open('kn3x-estimate-documents',1);
            let settled = false;
            const fail = error => { if (!settled) { settled = true; reject(error); } };
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains('snapshots')) request.result.createObjectStore('snapshots');
            };
            request.onerror = () => fail(request.error || new Error('Cannot open estimate storage'));
            request.onblocked = () => fail(new Error('Estimate storage is blocked by another tab'));
            request.onsuccess = async () => {
                if (settled) { request.result.close(); return; }
                this.db = request.result;
                this.db.onversionchange = () => { this.db.close(); this.db = null; };
                try { await this.transact(null); settled = true; resolve(this); }
                catch (error) { fail(error); }
            };
        });
        return this.loading;
    }
    // One read/write transaction reserves numbers atomically, including across tabs.
    transact(mutator) {
        return new Promise((resolve,reject) => {
            if (!this.db) { reject(new Error('Estimate storage unavailable')); return; }
            let transaction, failure, updated;
            try { transaction = this.db.transaction('snapshots','readwrite'); }
            catch (error) { reject(error); return; }
            const records = transaction.objectStore('snapshots');
            transaction.oncomplete = () => { this.cache = updated; resolve(this.snapshot()); };
            transaction.onabort = () => reject(failure || transaction.error || new Error('Estimate save aborted'));
            transaction.onerror = () => {};
            const request = records.get('finalized');
            request.onsuccess = () => {
                try {
                    const missing = request.result === undefined;
                    let data = request.result;
                    if (missing) {
                        const raw = localStorage.getItem(this.legacyKey);
                        data = raw ? JSON.parse(raw) : {version:1,estimates:[]};
                    }
                    updated = structuredClone(this.validate(data));
                    if (mutator) updated = this.validate(mutator(updated));
                    if (missing || mutator) records.put(updated,'finalized');
                } catch (error) { failure = error; transaction.abort(); }
            };
        });
    }
    async update(mutator) { await this.initialize(); return this.transact(mutator); }
    async reload() { await this.initialize(); return this.transact(null); }
}
