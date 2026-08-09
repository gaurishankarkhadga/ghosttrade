import { MongoClient } from 'mongodb';
const uri = 'mongodb+srv://gaurishankarkhadga73:uA6W97c676lP9iKk@cluster0.z2g8r.mongodb.net/ghosttrade';
MongoClient.connect(uri).then(async client => {
  const db = client.db();
  const latestPrompt = await db.collection('prompt_logs').find().sort({_id:-1}).limit(1).toArray();
  console.log(JSON.stringify(latestPrompt, null, 2));
  client.close();
});
