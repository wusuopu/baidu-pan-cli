import _ from 'lodash'
import request, { Options } from 'request-promise'
import path from 'path'
import fs from 'fs-extra'
import logger from './logger'

const PAN_URL = 'http://pan.baidu.com'
const PAN_API_URL = `https://pan.baidu.com/api`
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
        path: path.join(targetPath, filename),
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
      throw new UploadError(filepath, 'precreate')
    }
    logger.debug(`precreate file ${filename}; ${uploadid}`)

    // 上传文件
    apiUri = this.pcsApiUrl
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
        file: fs.createReadStream(filepath)
      }
    })
    let uploadRes = JSON.parse(res)
    if (!uploadRes.md5) {
      logger.error(`upload fail ${res}`)
      throw new UploadError(filepath, 'upload')
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
    let createRes: FileItem = JSON.parse(res)
    if (!createRes.fs_id) {
      logger.error(`create fail ${res}`)
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
}
