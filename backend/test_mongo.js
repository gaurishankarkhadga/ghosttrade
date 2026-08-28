import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();
const uri = process.env.MONGODB_URI;
MongoClient.connect(uri).then(async client => {
  const db = client.db();
  const latestPrompt = await db.collection('prompt_logs').find().sort({_id:-1}).limit(1).toArray();
  console.log(JSON.stringify(latestPrompt, null, 2));
  client.close();
});
