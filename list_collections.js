import dotenv from 'dotenv';
dotenv.config();
import { getDb } from './backend/mongoConfig.js';

async function list() {
  const db = await getDb();
  const cols = await db.listCollections().toArray();
  for (let c of cols) {
    const count = await db.collection(c.name).countDocuments();
    console.log(c.name, count);
  }
  process.exit(0);
}

list().catch(console.error);
