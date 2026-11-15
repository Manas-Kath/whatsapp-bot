const { getDb } = require('./db');

function findPersonByIdentifier(identifier, db = null) {
    if (!identifier) return null;
    const conn = db || getDb();
    const cleanId = String(identifier).trim();
    return conn.prepare(`
        SELECT * FROM people 
        WHERE (wa_lid = ? OR wa_pn = ?) AND active = 1
        LIMIT 1
    `).get(cleanId, cleanId);
}

function getPersonById(id, db = null) {
    const conn = db || getDb();
    return conn.prepare('SELECT * FROM people WHERE id = ?').get(id);
}

function findPersonByName(name, db = null) {
    if (!name) return null;
    const conn = db || getDb();
    return conn.prepare('SELECT * FROM people WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) ORDER BY id LIMIT 1').get(String(name));
}

function getActiveOwnerCount(db = null) {
    const conn = db || getDb();
    return conn.prepare("SELECT count(*) AS count FROM people WHERE active = 1 AND role = 'owner'").get().count;
}

function getAllPeople(db = null) {
    const conn = db || getDb();
    return conn.prepare('SELECT * FROM people ORDER BY id ASC').all();
}

function registerPerson({ name, aliases = [], wa_lid = null, wa_pn = null, role = 'member', lang = 'en', active = 1 }, db = null) {
    const conn = db || getDb();
    const aliasesJson = typeof aliases === 'string' ? aliases : JSON.stringify(aliases);
    
    const stmt = conn.prepare(`
        INSERT INTO people (name, aliases, wa_lid, wa_pn, role, lang, active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(name.trim(), aliasesJson, wa_lid || null, wa_pn || null, role, lang, active);
    return getPersonById(info.lastInsertRowid, conn);
}

function updatePerson(id, fields = {}, db = null) {
    const conn = db || getDb();
    const current = getPersonById(id, conn);
    if (!current) return null;
    if (fields.role !== undefined && !['owner', 'member'].includes(fields.role)) {
        throw new Error('Role must be owner or member');
    }
    const removesOwner = current.active && current.role === 'owner' &&
        (fields.active === 0 || fields.active === false || fields.role === 'member');
    if (removesOwner && getActiveOwnerCount(conn) <= 1) {
        throw new Error('Cannot remove or demote the last active owner');
    }
    const allowed = ['name', 'aliases', 'wa_lid', 'wa_pn', 'role', 'lang', 'active'];
    const sets = [];
    const values = [];

    for (const [k, v] of Object.entries(fields)) {
        if (allowed.includes(k)) {
            sets.push(`${k} = ?`);
            values.push(k === 'aliases' && typeof v !== 'string' ? JSON.stringify(v) : v);
        }
    }

    if (!sets.length) return getPersonById(id, conn);

    values.push(id);
    conn.prepare(`UPDATE people SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return getPersonById(id, conn);
}

function findPersonByAlias(term, db = null) {
    if (!term) return null;
    const conn = db || getDb();
    const people = conn.prepare('SELECT * FROM people WHERE active = 1').all();
    const target = term.trim().toLowerCase();

    for (const p of people) {
        if (p.name.toLowerCase() === target) return p;
        try {
            const aliases = JSON.parse(p.aliases || '[]');
            if (aliases.some(a => String(a).toLowerCase() === target)) {
                return p;
            }
        } catch (e) {}
    }
    return null;
}

module.exports = {
    findPersonByIdentifier,
    getPersonById,
    findPersonByName,
    getActiveOwnerCount,
    getAllPeople,
    registerPerson,
    updatePerson,
    findPersonByAlias
};
