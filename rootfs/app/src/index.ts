import express, { Errback, Request, Response } from 'express';
import expressWinston from 'express-winston'
import bodyParser from 'body-parser'
import fs from 'fs-extra'
import winston from 'winston'
import { ResponseError } from './global.d'
import Constants from './constants'
import routes from './routes'

const app = express();
if ( process.env.NODE_ENV !== 'test'  ) {
  app.use(expressWinston.logger({
    transports: [ new winston.transports.Console() ],
    ignoredRoutes: ['/health_check'],
    meta: true,
    expressFormat: true
  }))
}
app.use(bodyParser.urlencoded({ limit: process.env.BODY_LIMIT_SIZE || '50mb', extended: true }))
app.use(bodyParser.json({ limit: process.env.BODY_LIMIT_SIZE || '50mb' }))
routes.config(app)

app.use((err: ResponseError, req: Request, res: Response, next: Errback) => {
  console.error(req.method, req.path, err)
  if (res.headersSent) {
    return next(err)
  }
  return res.status(err.httpCode || 500).json({error: err.message})
})

const { PORT = 80 } = process.env;

app.get('/', (_: Request, res: Response) => {
  res.send({
    message: 'hello world',
  });
});

if (require.main === module) {
  fs.ensureDirSync(Constants.EXPRESS_TEMP_FILE_FOLDER)
  app.listen(PORT, () => {
    console.log('server started at http://localhost:'+PORT);
  });
}
export default app;
