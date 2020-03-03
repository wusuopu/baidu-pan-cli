import _ from 'lodash'
import request, { Options } from 'request-promise'
import path from 'path'
import fs from 'fs-extra'
import MD5 from 'md5.js'
import { Readable, Duplex } from 'stream'
import uuid from 'uuid'
import os from 'os'
import logger from './logger'

const PAN_URL = 'http://pan.baidu.com'
const PAN_API_URL = `https://pan.baidu.com/api`
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36'

const SLICE_MD5_SIZE = 256 * 1024         // 计算 slice md5 的字节数
const PER_UPLOAD_SLICE_SIZE = 4194304     // 分片上传，每片上传 4M
const EMPTY_CONTENT_MD5 = 'd41d8cd98f00b204e9800998ecf8427e'    // 空字符串 md5

export interface FileItem {
  server_filename: string,
  category: number,
  unlist: number,
  isdir: number,
  oper_id: number,
  server_ctime: number,
  server_mtime: number,
  local_ctime: number,
  local_mtime: number,
  size: number,
  share: number,
  path: string,
  fs_id: number,
  // isdir 为 1 时，以下属性才存在
  dir_empty?: number,
  empty?: number,
  // isdir 为 0 时，以下属性才存在
  md5?: string,
}
export interface AuthToken {
  bduss: string,
  stoken: string,
  bdstoken?: string,
  pcsett?: string,
  pcs_server?: string,
}

const fetch = async (options: Options) => {
  if (!options.headers) { options.headers = {} }
  options.headers['User-Agent'] = USER_AGENT
  return await request(options)
}
// 计算md5
const strMD5 = (data: string|Buffer):string => {
  return (new MD5()).update(data as Buffer).digest('hex')
}
const streamMD5 = (s: Readable):Promise<string> => {
  return new Promise((resolve) => {
    let m = new MD5()
    s.on('data', chunk => m.update(chunk))
    s.on('end', () => resolve(m.digest('hex')))
  })
}
const buffer2Stream = (buf: string|Buffer): Readable => {
  let steam = new Duplex()
  steam.push(buf)
  steam.push(null)
  return steam
}

/**
 * 构建 headers Cookie 的值
 */
const buildCookie = (bduss: string, stoken: string): string => {
  return `BDUSS=${bduss}; STOKEN=${stoken}`
}

/**
 * 构建 query string 的值
 */
const buildQuery = (qs?: any): any => {
  return _.assign({
    channel: 'chunlei',
    web: 1,
    app_id: 250528,
    bdstoken: undefined,
    logid: 'MTU3MjMxMjc1MDM0OTAuOTExNzA2MDQ1OTc2MDMxOA==',
    clienttype: 0
  }, qs)
}

/**
 * 获取当前时间戳
 */
const getTimestamp = (): string => {
  return (Date.now() / 1000).toFixed(0)
}

export class UploadError extends Error {
  filename: string
  action: string
  constructor (filename: string, action: string) {
    super()
    this.name = 'UploadError'
    this.filename = filename
    this.action = action
    this.message = `${action} ${filename}`
  }
}
export class DeleteError extends Error {
  filelist: string[]
  constructor (filelist: string[]) {
    super()
    this.name = 'DeleteError'
    this.filelist = filelist
    this.message = `delete ${JSON.stringify(filelist)}`
  }
}

export default class BaiduPan {
  bduss: string
  stoken: string
  bdstoken: string
  pcsett: string

  pcsApiUrl: string
  /**
   * @param {string} bduss: 从 .baidu.com 的 cookie 中获取 BDUSS;
   * @param {string} stoken: 从 .pan.baidu.com 的 cookie 中获取 STOKEN;
   * @param {string} bdstoken
   * @param {string} pcsett: 从 .pcs.baidu.com 的 cookie 中获取 pcsett;
   */
  constructor (bduss: string, stoken: string, bdstoken?: string, pcsett?: string, pcsApiHost?: string) {
    this.bduss = bduss
    this.stoken = stoken
    this.bdstoken = bdstoken
    this.pcsett = pcsett

    pcsApiHost = pcsApiHost || 'nj02ct01.pcs.baidu.com'
    // 默认为： https://nj02ct01.pcs.baidu.com/rest/2.0/pcs/superfile2
    this.pcsApiUrl = `https://${pcsApiHost}/rest/2.0/pcs/superfile2`
  }

  async checkCookie (): Promise<boolean> {
    // check cookie
    let res = await fetch({
      url: `${PAN_API_URL}/report/user`,
      method: 'POST',
      headers: {
        Cookie: buildCookie(this.bduss, this.stoken)
      },
      qs: buildQuery(),
      form: {
        timestamp: getTimestamp(),
        action: 'fm_self'
      }
    })
    try {
      res = JSON.parse(res)
    } catch (e) {
    }
    if (res.uinfo) {
      return true
    }

    logger.error(`get user info fail ${res}`)
    return false
  }
  async getBdstoken (): Promise<string> {
    if (!(await this.checkCookie())) {
      return ''
    }

    // get bdstoken
    let url = `${PAN_URL}/disk/home`
    let res = await fetch({
      url,
      headers: {
        Cookie: buildCookie(this.bduss, this.stoken)
      }
    })

    let match = res.match(/"bdstoken"\s*:\s*"([^"]+)"/i)
    if (!match) {
      return ''
    }
    return match[1]
  }
  /**
   * 列出某个目录下的文件
   */
  async listDir (dir: string, page: number = 1): Promise<Array<FileItem>> {
    let res = await fetch({
      url: `${PAN_API_URL}/list`,
      method: 'GET',
      headers: {
        Cookie: buildCookie(this.bduss, this.stoken)
      },
      qs: buildQuery({
        order: 'name',
        desc: 1,
        showempty: 0,
        page,
        num: 100,
        dir,
        t: _.random(1, true),
        bdstoken: this.bdstoken,
        startLogTime: Date.now(),
      })
    })

    res = JSON.parse(res)
    return res.list || []
  }
  // FIXME: 现在貌似不能直接从百度网盘下载文件了，需要使用客户端程序。
  buildDownloadLink (filepath: string): object {
    let headers = {
      'User-Agent': 'netdisk;6.0.0.12;PC;PC-Windows;10.0.16299;WindowsBaiduYunGuanJia',
      'Referer': 'https://pan.baidu.com/disk/home',
      'Cookie': `BDUSS=${this.bduss}; pcsett=${this.pcsett}`
    }
    let url = `https://pcs.baidu.com/rest/2.0/pcs/file?method=download&app_id=624966&path=${encodeURIComponent(filepath)}`

    return { headers, url }
  }
  async addAria2Uri (rpcUri: string, options: {headers: object, url: string}, output: string) {
    const rpcData = {
      jsonrpc: '2.0',
      method: 'aria2.addUri',
      id: new Date().getTime(),
      params: [
        [options.url], {
          out: output,
          header: options.headers
        }
      ]
    }

    let res = await request({url: rpcUri, method: 'POST', json: rpcData})
    return res
  }
  /**
   * 上传文件
   * @param {string} filepath
   * @param {string} targetPath
   * @param {string} filename
   *
   */
  async uploadFile (filepath: string, targetPath: string, filename?: string): Promise<FileItem> {
    if (!filename) { filename = path.basename(filepath) }
    let stat = await fs.stat(filepath)
    if (stat.size === 0) {
      logger.error('文件为空！')
      return
    }
    let localTime = (stat.ctimeMs / 1000).toFixed(0)

    if (stat.size > 1048576000) {      // 大于1M的文件尝试秒传
      let rapiduploadInfo = await this._getRapiduploadInfo(
        filepath,
        targetPath,
        localTime,
        filename,
      )
      if (rapiduploadInfo.errno === 0) {
        logger.info('文件秒传完成')
        // 文件已经存在，不再重复上传
        return rapiduploadInfo.info
      }
    }

    // 预创建文件
    let isSlice = stat.size > PER_UPLOAD_SLICE_SIZE
    let precreateRes = await this._preCreateFile(targetPath, filename, localTime, isSlice)
    let uploadid = precreateRes.uploadid
    if (!uploadid) {
      logger.error(`precreate fail ${JSON.stringify(precreateRes)}`)
      throw new UploadError(filepath, 'precreate')
    }
    logger.debug(`precreate file ${filename}; ${uploadid} ${JSON.stringify(precreateRes.block_list)}`)

    // 上传文件
    let uploadPath = path.join(targetPath, filename)
    let allSlices = []
    if (isSlice) {
      allSlices = await this._uploadFileSlice(filepath, uploadPath, uploadid)
    } else {
      // 整块上传
      let res = await this._uploadFile(
        fs.createReadStream(filepath),
        precreateRes.path, uploadid, 0, stat.size
      )
      if (!res.md5) {
        logger.error(`upload fail ${JSON.stringify(res)}`)
        throw new UploadError(filepath, 'upload')
      }
      allSlices.push(res.md5)
    }

    logger.debug(`upload file ${filename};`)

    // 创建文件
    let createRes = await this._createFile(
      uploadPath,
      stat.size,
      precreateRes.uploadid,
      targetPath,
      allSlices,
      localTime
    )
    if (!createRes.fs_id) {
      logger.error(`create fail ${JSON.stringify(createRes)}`)
      throw new UploadError(filepath, 'create')
    }
    return createRes
  }
  /**
   * 删除文件
   */
  async deleteFiles (filelist: string[]) {
    let headers = { Cookie: buildCookie(this.bduss, this.stoken) }
    let apiUri = `${PAN_API_URL}/filemanager`
    let res = await fetch({
      url: apiUri,
      method: 'POST',
      headers,
      qs: buildQuery({
        opera: 'delete',
        async: 2,
        onnest: 'fail',
        bdstoken: this.bdstoken,
      }),
      form: {
        filelist: JSON.stringify(filelist)
      }
    })

    let deleteRes = JSON.parse(res)
    if (!deleteRes.taskid) {
      logger.error(`delete fail ${res}`)
      throw new DeleteError(filelist)
    }
    logger.debug(`delete task ${res}`)

    return deleteRes
  }
  /**
   * 获取最近的文件上传的服务器列表
   */
  async getUploadHost (): Promise<{client_ip: string, server: string[], host: string}> {
    let apiUri = `https://pcs.baidu.com/rest/2.0/pcs/file`
    let res = await fetch({
      url: apiUri,
      method: 'GET',
      qs: buildQuery({
        method: 'locateupload',
        bdstoken: this.bdstoken
      })
    })
    return JSON.parse(res)
  }

  /**
   * 离线下载
   */
  async offlineDownload (url: string, targetPath: string, code?: string, vcode?: string): Promise<{task_id: number}> {
    let res = await fetch({
      url: `${PAN_URL}/rest/2.0/services/cloud_dl`,
      method: 'POST',
      headers: {
        Cookie: buildCookie(this.bduss, this.stoken)
      },
      qs: buildQuery({bdstoken: this.bdstoken }),
      form: {
        method: 'add_task',
        app_id: 250528,
        save_path: targetPath,
        source_url: url,
        input: code,    // 验证码
        vcode,
      },
    })
    //  需要验证码:
    //  status 403
    //  {"vcode":"3332423865633234636166333465663732323763363637363764323966666433666231353930373930363732303030303030303030303030303031353831353731313430803AAE51ADF07AE5674B87B7706C6713","img":"https:\/\/pan.baidu.com\/genimage?3332423865633234636166333465663732323763363637363764323966666433666231353930373930363732303030303030303030303030303031353831353731313430803AAE51ADF07AE5674B87B7706C6713","error_code":-19,"error_msg":"vcode is needed","request_id":1010162743822390530}

    res = JSON.parse(res)
    return res.task_id
  }

  // 文件上传相关
  private async _getRapiduploadInfo (filepath: string, targetPath: string, localTime: string, filename: string): Promise<any> {
    let readStream = fs.createReadStream(filepath)
    let contentMd5 = await streamMD5(readStream)
    readStream.close()

    let buf = Buffer.alloc(SLICE_MD5_SIZE)
    let fd = await fs.open(filepath, 'r')
    await fs.read(fd, buf, 0, SLICE_MD5_SIZE, 0)
    await fs.close(fd)
    let sliceMd5 = strMD5(buf)
    let stat = await fs.stat(filepath)

    let headers = { Cookie: buildCookie(this.bduss, this.stoken) }
    let apiUri = `${PAN_API_URL}/rapidupload`
    let res = await fetch({
      url: apiUri,
      method: 'POST',
      headers,
      qs: buildQuery({
        rtype: 1,
        bdstoken: this.bdstoken,
        startLogTime: Date.now()
      }),
      form: {
        path: path.join(targetPath, filename),
        'content-length': stat.size,
        'content-md5': contentMd5,
        'slice-md5': sliceMd5,
        target_path: targetPath,
        local_mtime: localTime,
      }
    })
    // {"errno":0,"info":{"size":43235330,"category":6,"fs_id":2095781100430,"request_id":1.4344745714769e+18,"path":"\/temp\/XnViewMP-mac.dmg","isdir":0,"mtime":1583151834,"ctime":1583151834,"md5":"fb5d65ac1t097b9d4d8904d5aad888e1"},"request_id":1434474571476910645}
    return JSON.parse(res)
  }
  // 预创建文件
  private async _preCreateFile (targetPath: string, filename: string, localTime: string, isSlice: boolean = false) {
    let apiUri = `${PAN_API_URL}/precreate`
    let headers = { Cookie: buildCookie(this.bduss, this.stoken) }

    //'5910a591dd8fc18c32a8f3df4fdc1761'
    //'a5fc157d78e6ad1c7e114b056c92821e'
    let blockList = ['5910a591dd8fc18c32a8f3df4fdc1761']
    if (isSlice) { blockList.push('a5fc157d78e6ad1c7e114b056c92821e') }   // 分片上传
    let res = await fetch({
      url: apiUri,
      method: 'POST',
      headers,
      qs: buildQuery({
        bdstoken: this.bdstoken,
        startLogTime: Date.now()
      }),
      form: {
        path: path.join(targetPath, filename),
        autoinit: 1,
        target_path: targetPath,
        block_list: JSON.stringify(blockList),
        local_mtime: localTime,
      }
    })
    return JSON.parse(res)
  }
  // 上传文件
  private async _uploadFile (data: Readable, path: string, uploadid: string, partseq: number, totalSize: number) {
    let uploadedSize = 0
    let uploadedProgress = '0'

    let res = await fetch({
      url: this.pcsApiUrl,
      method: 'POST',
      qs: buildQuery({
        method: 'upload',
        BDUSS: this.bduss,
        path,
        uploadid,
        uploadsign: 0,
        partseq,
      }),
      formData: {
        file: data.on('data', (chunk) => {
          uploadedSize += chunk.length
          let progress = ((uploadedSize / totalSize) * 100).toFixed(0)
          if (progress !== uploadedProgress) {
            uploadedProgress = progress
            logger.debug(`uploaded: ${uploadedProgress}% `)
          }
        })
      }
    })

    return JSON.parse(res)
  }
  // 创建文件
  private async _createFile (path: string, size: number, uploadid: string, targetPath: string, blockList: string[], localTime: string): Promise<FileItem> {
    let apiUri = `${PAN_API_URL}/create`
    let headers = { Cookie: buildCookie(this.bduss, this.stoken) }
    let res = await fetch({
      url: apiUri,
      method: 'POST',
      headers,
      qs: buildQuery({
        isdir: 0,
        rtype: 1,
        bdstoken: this.bdstoken
      }),
      form: {
        path,
        size,
        uploadid,
        target_path: targetPath,
        block_list: JSON.stringify(blockList),
        local_mtime: localTime,
      }
    })
    return JSON.parse(res)
  }
  // 分片上传文件
  private async _uploadFileSlice (filepath: string, uploadPath: string, uploadid: string): Promise<Array<string>> {
    let filename = path.basename(filepath)
    let fd = await fs.open(filepath, 'r')
    let sliceNum = 0
    let buf = Buffer.alloc(PER_UPLOAD_SLICE_SIZE)
    let readResult = await fs.read(fd, buf, 0, PER_UPLOAD_SLICE_SIZE, null)
    let allSlices = []
    while (readResult.bytesRead) {
      logger.info(`准备上传第 ${sliceNum} 片文件`)
      let tmpFile = path.join(os.tmpdir(), `${filename}-${uuid.v1()}`)
      let writeFd = await fs.open(tmpFile, 'w')
      await fs.write(writeFd, buf, 0, readResult.bytesRead, null)
      await fs.close(writeFd)

      let res = await this._uploadFile(
        fs.createReadStream(tmpFile),
        uploadPath,   // 分片上传时，没有 precreateRes.path
        uploadid,
        sliceNum,
        readResult.bytesRead
      )
      if (!res.md5) {
        logger.error(`upload fail ${JSON.stringify(res)}`)
        throw new UploadError(filepath, 'upload')
      }
      sliceNum++
        readResult = await fs.read(fd, buf, 0, PER_UPLOAD_SLICE_SIZE, null)
      allSlices.push(res.md5)
      logger.info(`第 ${res.partseq} 片上传完成: ${res.md5} ${tmpFile}`)
    }

    return allSlices
  }
}
