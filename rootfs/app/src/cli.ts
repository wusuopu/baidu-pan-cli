import program from 'commander'
import fs from 'fs-extra'
import _ from 'lodash'
import BaiduPan, { AuthToken } from './lib/baidu-pan'
import Store from './store'
import * as utils from './utils'

program
  .command('add_config <BDUSS> <STOKEN> [bdstoken [pcsett]]')
  .description('添加用户信息')
  .action(async (bduss, stoken, bdstoken, pcsett) => {
    let data: AuthToken = {bduss, stoken, bdstoken, pcsett}
    if (!data.bdstoken) {
      let pan = new BaiduPan(data.bduss, data.stoken)

      try {
        data.bdstoken = await pan.getBdstoken()
        pan.bdstoken = bdstoken
        let res = await pan.getUploadHost()
        data.pcs_server = res.host
      } catch (e) {
      }
    }
    if (!data.bdstoken) {
      console.error('用户信息无效')
      return
    }
    await Store.set('auth:token', data)
  })

program
  .command('list_config')
  .description('获取用户信息')
  .action(async () => {
    let data = (await utils.getAuthToken()) || {}
    console.log(JSON.stringify(data, undefined, ' '))
  })

program
  .command('upload <filename> <target_path>')
  .description('上传文件')
  .action(async (filename, targetPath) => {
    if (!fs.existsSync(filename)) {
      console.log(`文件 ${filename} 不存在`)
      return
    }
    let data = await utils.getAuthToken()
    if (!_.get(data, 'bdstoken')) {
      console.log(`用户信息不存在`)
      return
    }
    let pan = new BaiduPan(data.bduss, data.stoken, data.bdstoken)
    try {
      let res = await pan.uploadFile(filename, targetPath)
      console.log('上传成功：', res.path)
    } catch (e) {
      console.error('上传失败:', e)
    }
  })

program
  .command('delete <file> [files...]')
  .description('删除文件')
  .action(async (file, files) => {
    let filelist = [file].concat(files)
    let data = await utils.getAuthToken()
    if (!_.get(data, 'bdstoken')) {
      console.log(`用户信息不存在`)
      return
    }
    let pan = new BaiduPan(data.bduss, data.stoken, data.bdstoken)
    try {
      await pan.deleteFiles(filelist)
      console.log('文件已删除!')
    } catch (e) {
      console.error('文件删除失败:', e)
    }
  })

program
  .command('list <dir>')
  .description('获取文件列表')
  .action(async (dir) => {
    let data = await utils.getAuthToken()
    if (!_.get(data, 'bdstoken')) {
      console.log(`用户信息不存在`)
      return
    }
    let pan = new BaiduPan(data.bduss, data.stoken, data.bdstoken)
    try {
      let res = await pan.listDir(dir)
      console.log('文件如下')
      console.log(JSON.stringify(res, undefined, 2))
    } catch (e) {
      console.error('获取文件列表失败:', e)
    }
  })

program
  .command('offline <dir> <url> [<code> <vcode>]')
  .description('获取文件列表')
  .action(async (dir, url, code, vcode) => {
    let data = await utils.getAuthToken()
    if (!_.get(data, 'bdstoken')) {
      console.log(`用户信息不存在`)
      return
    }
    let pan = new BaiduPan(data.bduss, data.stoken, data.bdstoken)
    try {
      let taskid = await pan.offlineDownload(url, dir, code, vcode)
      console.log('离线下载任务：', taskid)
    } catch (e) {
      console.error('创建离线下载任务失败:')
      console.log(JSON.parse(e.response.body))
    }
  })

program
  .command('list_server')
  .description('获取最近的文件上传服务器地址列表')
  .action(async () => {
    let data = await utils.getAuthToken()
    if (!_.get(data, 'bdstoken')) {
      console.log(`用户信息不存在`)
      return
    }
    let pan = new BaiduPan(data.bduss, data.stoken, data.bdstoken)
    try {
      let res = await pan.getUploadHost()
      console.log('服务器地址如下')
      console.log(JSON.stringify(res, undefined, 2))
      data.pcs_server = res.host
      await Store.set('auth:token', data)
    } catch (e) {
      console.error('获取服务器地址列表失败:', e)
    }
  })

program.on('--help', function(){
  console.log('')
});
 
program.parse(process.argv);
