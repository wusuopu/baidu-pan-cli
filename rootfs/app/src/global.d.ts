export interface ResponseError extends Error {
  httpCode?: number
}
