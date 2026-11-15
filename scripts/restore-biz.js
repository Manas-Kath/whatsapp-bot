const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function restoreDatabase({ backupFile, dbPath = null, force = false } = {}) {
    if (!force) return { success: false, error: 'Refusing to restore without --force.' };
    if (!backupFile) return { success: false, error: 'A backup file path is required.' };

    const source = path.resolve(backupFile);
    const target = path.resolve(dbPath || process.env.BIZ_DB_PATH || path.join(__dirname, '../biz-data/biz.db'));
    if (!fs.existsSync(source)) return { success: false, error: `Backup not found: ${source}` };
    if (source === target) return { success: false, error: 'Backup and database paths must be different.' };

    try {
        const backupDb = new Database(source, { readonly: true });
        let integrity;
        try {
            integrity = backupDb.pragma('integrity_check', { simple: true });
        } finally {
            backupDb.close();
        }
        if (integrity !== 'ok') return { success: false, error: `Backup integrity_check failed: ${integrity}` };

        fs.mkdirSync(path.dirname(target), { recursive: true });
        const beforeRestore = `${target}.before-restore`;
        if (fs.existsSync(target)) fs.copyFileSync(target, beforeRestore);
        fs.copyFileSync(source, target);
        for (const suffix of ['-wal', '-shm']) {
            const sidecar = `${target}${suffix}`;
            if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: true });
        }

        return { success: true, dbPath: target, beforeRestore: fs.existsSync(beforeRestore) ? beforeRestore : null };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const force = args.includes('--force');
    const backupFile = args.find(arg => arg !== '--force');
    const result = restoreDatabase({ backupFile, force });
    if (!result.success) {
        console.error(`[BIZ RESTORE] ${result.error}`);
        console.error('Usage: node scripts/restore-biz.js <backup-file> --force');
        process.exitCode = 1;
    } else {
        console.log(`[BIZ RESTORE] Restored ${result.dbPath}`);
        if (result.beforeRestore) console.log(`[BIZ RESTORE] Previous database kept at ${result.beforeRestore}`);
    }
}

module.exports = { restoreDatabase };
