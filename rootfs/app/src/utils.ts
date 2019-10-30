import fs from 'fs-extra'
import { AuthToken } from './lib/baidu-pan'
import Store from './store'
import { UploadFile } from './global.d'

export const getAuthToken = async (): Promise<AuthToken> => {
  try {
    let data = await Store.get('auth:token')
    data = JSON.parse(data)
    return data
  } catch (e) {
    return
  }
}

export const readFile = async (file: UploadFile): Promise<string|Buffer> => {
  if (file.buffer) { return file.buffer }
  return await fs.readFile(file.path)
}

export const removeFile = async (file: UploadFile) => {
  if (!file.path) {
    await fs.unlink(file.path)
  }
}
