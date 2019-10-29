import winston from 'winston'

const { NODE_ENV = 'development' } = process.env

const logger = winston.createLogger({
  level: NODE_ENV === 'development' ? 'debug' : 'info',
  transports: [
    new winston.transports.Console()
  ],
  exitOnError: false
})

export default logger
