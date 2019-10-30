# baidu-pan-cli  使用Nodejs开发的一个简单的百度网盘工具

起因是由于我的服务器上有一些大的文件需要备份，所以才自己写了个这么的程序用于将服务器上的文件上传到百度网盘。

## 使用方法
该程序提供命令行和api两种形式调用。

下载源代码后执行命令：
```
yarn
yarn build
```
将 TypeScript 的代码编译成 nodejs 可执行的 js 代码。

### 命令行的方式
编译成功之后可以通过 `node build/prod/cli.js` 命令来运行。相关操作如下。

1. 用户登录
```
先在浏览器中登录用户，然后获取到 .baidu.com 域名下的 BDUSS cookie 和 .pan.baidu.com 域名下的 STOKEN cookie。
node build/prod/cli.js add_config <BDUSS> <STOKEN>
```

2. 列出某个目录下的文件
```
node build/prod/cli.js list <dir>
```

3. 删除某个文件。请谨慎操作！！
```
node build/prod/cli.js delete <file> [files...]
```

4. 上传文件
```
node build/prod/cli.js upload <filename> <target_path>
将本地的 filename 文件上传到网盘的 target_path 目录下。
```

### api调用的方式
先运行服务 `PORT=8080 yarn start`， 若 PORT 变量不指定，则默认使用 80 端口。
或者直接在项目根目录下执行 `docker-compose -f docker-compose.yml up -d`

1. 用户登录
```
POST /api/auth
{ bduss, stoken }
```

2. 列出某个目录下的文件
```
GET /api/files?dir=<dir>
```

3. 删除某个文件。请谨慎操作！！
```
DELETE /api/files?filelist[]=<file1>&filelist[]=<file2>
```

4. 上传文件
```
POST /api/files
{file, targetPath}
使用 multipart/form-data 的形式提交数据。
```

api可以部署成微服务的形式，方便其他有需求的程序来调用。


最后关于文件下载的功能，由于现在网盘限制比较严格，稍微大一点的文件就只能通过网盘的客户端程序进行下载。
而且即便是使用网上的一些插件可以实现下载的功能， 但是也不是太稳定，所以下载的功能这里就没做。
