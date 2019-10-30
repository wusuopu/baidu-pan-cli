import { Application } from 'express';
import * as health from './health'
import auth from './auth'
import file from './file'
import task from './task'
import checkAuth from './middlewares/auth'

const config = (server: Application) => {
  server.get('/health_check', health.check)
  server.use('/api/auth', auth)
  server.use('/api/files', checkAuth, file)
  server.use('/api/tasks', task)
}

export default {
  config
}
