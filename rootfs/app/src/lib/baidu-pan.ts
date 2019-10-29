import _ from 'lodash'
import request from 'request-promise'
import path from 'path'
import fs from 'fs-extra'
import logger from './logger'

const PAN_URL = 'http://pan.baidu.com'
const PAN_API_URL = `https://pan.baidu.com/api`
const UPLOAD_API_URL = 'https://nj02ct01.pcs.baidu.com/rest/2.0/pcs/superfile2'
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36'


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

const fetch = async (options: any) => {
  if (!options.headers) { options.headers = {} }
  options.headers['User-Agent'] = USER_AGENT
  return await request(options)
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
  /**
   * @param {string} bduss: 从 .baidu.com 的 cookie 中获取 BDUSS;
   * @param {string} stoken: 从 .pan.baidu.com 的 cookie 中获取 STOKEN;
   * @param {string} bdstoken
   * @param {string} pcsett: 从 .pcs.baidu.com 的 cookie 中获取 pcsett;
   */
  constructor (bduss: string, stoken: string, bdstoken?: string, pcsett?: string) {
    this.bduss = bduss
    this.stoken = stoken
    this.bdstoken = bdstoken
    this.pcsett = pcsett
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
   * @param {string} filename
   * @param {string} targetPath
   *
   */
  async uploadFile (filename: string, targetPath: string) {
    let stat = await fs.stat(filename)
    let headers = { Cookie: buildCookie(this.bduss, this.stoken) }
    // 预创建文件

    let apiUri = `${PAN_API_URL}/precreate`
    let res = await fetch({
      url: apiUri,
      method: 'POST',
      headers,
      qs: buildQuery({
        bdstoken: this.bdstoken,
        startLogTime: Date.now()
      }),
      form: {
        path: path.join(targetPath, path.basename(filename)),
        autoinit: 1,
        target_path: targetPath,
        block_list: '["5910a591dd8fc18c32a8f3df4fdc1761"]',
        local_mtime: (stat.ctimeMs / 1000).toFixed(0)
      }
    })

    let precreateRes = JSON.parse(res)
    let uploadid = precreateRes.uploadid
    if (!uploadid) {
      logger.error(`precreate fail ${res}`)
      throw new UploadError(filename, 'precreate')
    }
    logger.debug(`precreate file ${filename}; ${uploadid}`)

    // 上传文件
    apiUri = UPLOAD_API_URL
    res = await fetch({
      url: apiUri,
      method: 'POST',
      qs: buildQuery({
        method: 'upload',
        BDUSS: this.bduss,
        path: precreateRes.path,
        uploadid,
        uploadsign: 0,
        partseq: 0
      }),
      formData: {
        file: fs.createReadStream(filename)
      }
    })
    let uploadRes = JSON.parse(res)
    if (!uploadRes.md5) {
      logger.error(`upload fail ${res}`)
      throw new UploadError(filename, 'upload')
    }
    logger.debug(`upload file ${filename}; ${res}`)

    // 创建文件
    apiUri = `${PAN_API_URL}/create`
    res = await fetch({
      url: apiUri,
      method: 'POST',
      headers,
      qs: buildQuery({
        isdir: 0,
        rtype: 1,
        bdstoken: this.bdstoken
      }),
      form: {
        path: precreateRes.path,
        size: stat.size,
        uploadid: precreateRes.uploadid,
        target_path: targetPath,
        block_list: `["${uploadRes.md5}"]`,
        local_mtime: (stat.ctimeMs / 1000).toFixed(0)
      }
    })
    let createRes = JSON.parse(res)
    if (!createRes.fs_id) {
      logger.error(`create fail ${res}`)
      throw new UploadError(filename, 'create')
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
}
