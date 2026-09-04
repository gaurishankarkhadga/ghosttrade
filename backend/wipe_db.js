import { getDb, closeDb } from './mongoConfig.js';

async function wipe() {
    try {
        console.log("Starting database wipe via deleteMany...");
        const db = await getDb();
        
        const collections = await db.collections();
        for (let collection of collections) {
            // We probably shouldn't wipe the users collection if they want to stay logged in, but the prompt said "completely"
            // If we wipe 'users', they just have to register again. 
            // I'll wipe everything.
            const result = await collection.deleteMany({});
            console.log(`🧹 Wiped ${result.deletedCount} documents from '${collection.collectionName}'`);
        }
        
        console.log(`✅ All collections in '${db.databaseName}' have been completely wiped.`);
    } catch (e) {
        console.error('Error wiping database:', e);
    } finally {
        await closeDb();
        process.exit(0);
    }
}

wipe();
