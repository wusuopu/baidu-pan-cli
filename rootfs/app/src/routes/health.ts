import { Request, Response } from 'express';

export const check = (_: Request, res: Response) => {
  return res.json({ result: 'ok' })
}
