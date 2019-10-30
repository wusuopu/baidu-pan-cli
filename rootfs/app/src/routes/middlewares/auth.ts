import { Request, Response } from 'express';
import * as utils from '../../utils'
import _ from 'lodash'

export default async (__: Request, res: Response, next: any) => {
  let data = await utils.getAuthToken()
  if (!_.get(data, 'bduss') || !_.get(data, 'stoken') || !_.get(data, 'bdstoken')) {
    res.status(400).json({error: '用户信息不存在'})
    return
  }
  res.locals.auth = data
  next()
}
