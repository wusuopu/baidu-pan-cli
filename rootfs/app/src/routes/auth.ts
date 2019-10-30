import { Request, Response } from 'express';
import safeRouter from '../lib/safe-router';
import BaiduPan, { AuthToken } from '../lib/baidu-pan'
import * as utils from '../utils'
import Store from '../store'

const router = safeRouter()
export default router

router.post('/', async (req: Request, res: Response) => {
  let { bduss, stoken, bdstoken, pcsett } = req.body
  if (!bduss || !stoken) {
    res.status(400).json({error: '用户信息无效'})
    return
  }
  let data: AuthToken = { bduss, stoken, bdstoken, pcsett }
  if (!data.bdstoken) {
    let pan = new BaiduPan(data.bduss, data.stoken)

    try {
      data.bdstoken = await pan.getBdstoken()
      pan.bdstoken = bdstoken
      let res = await pan.getUploadHost()
      data.pcs_server = res.host
    } catch (e) {
    }
    if (!data.bdstoken) {
      res.status(400).json({error: '用户信息无效'})
      return
    }
  }

  await Store.set('auth:token', data)
  res.json({success: true})
})

router.get('/', async (_: Request, res: Response) => {
  let data = (await utils.getAuthToken()) || {}
  res.json(data)
})
