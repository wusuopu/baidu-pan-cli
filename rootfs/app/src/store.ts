import redis from 'redis'
import bluebird from 'bluebird'
import levelup from 'levelup'
import leveldown from 'leveldown'
import levelttl from 'level-ttl'
import path from 'path'
import _ from 'lodash'
import fs from 'fs-extra'
import Constants from './constants'

bluebird.promisifyAll(redis.RedisClient.prototype)
bluebird.promisifyAll(redis.Multi.prototype)

interface Store {
  key_prefix?: string;
  client: any;
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<boolean>;
  del(key: string): Promise<boolean>;
}

class RedisStore implements Store {
  key_prefix: string;
  client: redis.RedisClient
  constructor (redis_uri: string, key_prefix: string = '') {
    this.key_prefix = key_prefix
    this.client = redis.createClient(redis_uri)
  }
  async get (key: string): Promise<any> {
    return await this.client.get(`${this.key_prefix}${key}`)
  }
  async set (key: string, value: any, ttl?: number): Promise<boolean> {
    if (!_.isString(value)) {
      value = JSON.stringify(value)
    }
    if (ttl) {
      await this.client.set(`${this.key_prefix}${key}`, value, 'EX', ttl)
    } else {
      await this.client.set(`${this.key_prefix}${key}`, value)
    }
    return true
  }
  async del (key: string): Promise<boolean> {
    return await this.client.del(`${this.key_prefix}${key}`)
  }
}

class LevelDBStore implements Store {
  client: any;
  constructor (db_path: string) {
    this.client = levelttl(levelup(leveldown(db_path)))
  }
  async get (key: string): Promise<string> {
    return await this.client.get(key)
  }
  async set (key: string, value: any, ttl?: number): Promise<boolean> {
    if (!_.isString(value)) {
      value = JSON.stringify(value)
    }
    let options: {ttl?: number} = {}
    if (ttl) {
      options.ttl = ttl * 1000
    }
    await this.client.put(key, value, options)
    return true
  }
  async del (key: string): Promise<boolean> {
    return await this.client.del(key)
  }
}

let db: Store
if (process.env.STORE_TYPE === 'redis') {
  db = new RedisStore(process.env.REDIS_URI, process.env.REDIS_PREFIX || '')
} else {
  let dirname = path.dirname(Constants.LEVELDB_PATH)
  fs.ensureDirSync(dirname)
  db = new LevelDBStore(Constants.LEVELDB_PATH)
}

export default db
