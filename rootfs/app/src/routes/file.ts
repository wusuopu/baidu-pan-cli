import { Request, Response } from 'express';
import { UploadRequest } from '../global.d'
import _ from 'lodash'
import multer from 'multer'
import uuid from 'uuid'
import fs from 'fs-extra'
import safeRouter from '../lib/safe-router';
import BaiduPan from '../lib/baidu-pan'
import Constants from '../constants'
import Store from '../store'

const uploadParser = multer({ dest: Constants.EXPRESS_TEMP_FILE_FOLDER })

const router = safeRouter()
export default router

router.post('/', uploadParser.single('file'), async (req: UploadRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({error: '缺少file参数'})
  }
  let targetPath = req.body.targetPath
  if (!targetPath) {
    return res.status(400).json({error: '缺少targetPath参数'})
  }

  let pan = new BaiduPan(res.locals.auth.bduss, res.locals.auth.stoken, res.locals.auth.bdstoken)

  let task = {
    path: req.file.path,
    filename: req.file.originalname,
    mimetype: req.file.mimetype,
    status: 'pending'
  }
  let taskId = uuid.v4()
  await Store.set(`task:${taskId}`, task, 3600 * 24 * 2)   // 有效期为2天

  pan.uploadFile(req.file.path, targetPath, task.filename).then(() => {
    task.status = 'done'
    Store.set(`task:${taskId}`, task, 3600 * 24 * 2)   // 有效期为2天
    fs.unlink(task.path)      // 上传成功之后删除临时文件
  })

  res.json({success: true, task: { id: taskId, ...task }})
})

router.get('/', async (req: Request, res: Response) => {
  let dir = req.query.dir
  if (!dir) {
    return res.status(400).json({error: '缺少dir参数'})
  }

  let pan = new BaiduPan(res.locals.auth.bduss, res.locals.auth.stoken, res.locals.auth.bdstoken)
  let data = await pan.listDir(dir)
  res.json(data)
})

router.delete('/', async (req: Request, res: Response) => {
  let filelist = req.query.filelist
  if (_.isEmpty(filelist) || !_.isArray(filelist)) {
    return res.status(400).json({error: '缺少filelist参数'})
  }

  let pan = new BaiduPan(res.locals.auth.bduss, res.locals.auth.stoken, res.locals.auth.bdstoken)
  await pan.deleteFiles(filelist)
  res.json({success: true})
})

router.post('/offline', async (req: Request, res: Response) => {
  let { targetPath, url, code, vcode } = req.query
  if (!targetPath) {
    return res.status(400).json({error: '缺少targetPath参数'})
  }
  if (!url) {
    return res.status(400).json({error: '缺少url参数'})
  }
  let pan = new BaiduPan(res.locals.auth.bduss, res.locals.auth.stoken, res.locals.auth.bdstoken)
  try {
    let taskId = await pan.offlineDownload(url, targetPath, code, vcode)
    res.json({success: true, taskId})
  } catch (error) {
    res.header('content-type', 'application/json')
       .status(error.response.statusCode)
       .send(error.response.body)
  }
})
