import rp from 'request-promise'
import fs from 'fs-extra'
import logger from './logger'


class GoFile {
  server: string;

  // 获取上传的服务器
  async getServer() {
    let res = await rp({
      url: 'https://apiv2.gofile.io/getServer',
      method: 'GET',
    })
    res = JSON.parse(res)
    this.server = res.data.server
  }

  // 上传文件
  async upload(filepath: string): Promise<{code: string, removalCode: string}> {
    if (!this.server) {
      await this.getServer()
    }
    let stat = await fs.stat(filepath)
    let totalSize = stat.size
    let uploadedSize = 0
    let uploadedProgress = '0'

    let url = `https://${this.server}.gofile.io/upload`
    let res = await rp({
      url,
      method: 'POST',
      formData: {
        filesUploaded: fs.createReadStream(filepath).on('data', (chunk) => {
          uploadedSize += chunk.length
          let progress = ((uploadedSize / totalSize) * 100).toFixed(0)
          if (progress !== uploadedProgress) {
            uploadedProgress = progress
            logger.debug(`uploaded: ${uploadedProgress}% `)
          }
        }),
        category: 'file'
      },
      rejectUnauthorized: false,
    })
    return JSON.parse(res).data
  }

  // 获取上传的文件信息
  async getUpload(code: string):
    Promise<{code: string, server: string, uploadTime: number, totalSize: number, files: {[key: number]: {name: string, size: number, md5: string, mimetype: string, link: string}}}>
  {
    if (!this.server) {
      await this.getServer()
    }
    let url = `https://${this.server}.gofile.io/getUpload`
    let res = await rp({
      url,
      method: 'GET',
      qs: {c: code},
      rejectUnauthorized: false,
    })
    return JSON.parse(res).data
  }
  // 删除文件
  async deleteUpload(code: string, removalCode: string) {
    if (!this.server) {
      await this.getServer()
    }
    let url = `https://${this.server}.gofile.io/deleteUpload`
    let res = await rp({
      url,
      method: 'GET',
      qs: {c: code, rc: removalCode},
      rejectUnauthorized: false,
    })

    return JSON.parse(res).status === 'ok'
  }
}

export default new GoFile()
