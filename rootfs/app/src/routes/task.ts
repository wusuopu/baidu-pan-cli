import { Request, Response } from 'express';
import safeRouter from '../lib/safe-router';
import Store from '../store'

const router = safeRouter()
export default router

router.get('/:id', async (req: Request, res: Response) => {
  try {
    let task = JSON.parse(await Store.get(`task:${req.params.id}`))
    res.json({success: true, task})
  } catch (e) {
    res.status(404).json({success: false})
  }
})
