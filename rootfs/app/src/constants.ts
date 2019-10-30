import path from 'path'

const LEVELDB_PATH = process.env.LEVELDB_PATH || path.resolve('tmp/data')
const EXPRESS_TEMP_FILE_FOLDER = process.env.EXPRESS_TEMP_FILE_FOLDER || path.resolve('tmp/files')

export default {
  LEVELDB_PATH,
  EXPRESS_TEMP_FILE_FOLDER
}
