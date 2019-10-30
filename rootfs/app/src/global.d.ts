import { Request } from 'express';

export interface ResponseError extends Error {
  httpCode?: number
}

export interface UploadFile {
  fieldname?: string
  originalname?: string
  encoding?: string
  mimetype?: string
  size: number
  destination?: string
  filename?: string
  path?: string
  buffer?: string
}

export interface UploadRequest extends Request {
  file?: UploadFile
  files?: UploadFile[]
}
