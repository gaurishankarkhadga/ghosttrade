import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = await MongoClient.connect(process.env.MONGO_URI);
  const db = client.db('ghosttrade');
  const signals = await db.collection('signals').find({evNet: {$ne: null}}).limit(2).toArray();
  console.log("Signals with evNet:", signals.map(s => s.evNet));
  
  const allSignals = await db.collection('signals').find({}).limit(5).toArray();
  console.log("All Signals evNet:", allSignals.map(s => s.evNet));
  await client.close();
}
run();
