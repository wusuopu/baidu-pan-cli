import { Application } from 'express';
import * as health from './health'
import auth from './auth'

const config = (server: Application) => {
  server.get('/health_check', health.check)
  server.use('/api/auth', auth)
}

export default {
  config
}
