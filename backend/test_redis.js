import { Redis } from '@upstash/redis';
import 'dotenv/config';

async function test() {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  
  await redis.hset('test:hash', { a: '{"name":"a"}', b: '{"name":"b"}' });
  const all = await redis.hgetall('test:hash');
  console.log("HGETALL:", all);
  
  const hget = await redis.hget('test:hash', 'a');
  console.log("HGET:", hget);
}

test();
