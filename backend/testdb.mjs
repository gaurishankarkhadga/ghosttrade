import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import { MongoClient } from 'mongodb';
const uri = 'mongodb+srv://admin:admin@cluster0.o7sps.mongodb.net/ghosttrade?retryWrites=true&w=majority';
const client = new MongoClient(uri);
async function run() {
  await client.connect();
  const db = client.db('ghosttrade');
  const docs = await db.collection('signals').find({ ticker: 'AAVE-USD' }).sort({ timestamp: -1 }).limit(1).toArray();
  console.log(JSON.stringify(docs, null, 2));
  await client.close();
}
run();
