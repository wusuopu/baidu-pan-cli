import path from 'path'
import fs from 'fs-extra'

let APP_ROOT_PATH = ''
for (let p of module.paths) {
  if (fs.existsSync(path.join(p, 'package.json'))) {
    APP_ROOT_PATH = p
    break
  }
}

const LEVELDB_PATH = process.env.LEVELDB_PATH || path.join(APP_ROOT_PATH, 'tmp/data')

export default {
  APP_ROOT_PATH,
  LEVELDB_PATH
}
