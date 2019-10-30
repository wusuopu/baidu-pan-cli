import { AuthToken } from './lib/baidu-pan'
import Store from './store'

export const getAuthToken = async (): Promise<AuthToken> => {
  try {
    let data = await Store.get('auth:token')
    data = JSON.parse(data)
    return data
  } catch (e) {
    return
  }
}
