import { Router } from 'express'
import type { BuildSummary } from '../../../src/domain/types'
import { getCatalog, toSummary } from '../services/catalog'

export const catalogRouter = Router()

catalogRouter.get('/catalog', async (_req, res) => {
  const entries = await getCatalog()
  const body: BuildSummary[] = entries.map(toSummary)
  res.json(body)
})
