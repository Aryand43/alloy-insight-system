import { Router } from 'express'
import type { BuildSummary } from '../../../src/domain/types.js'
import { getCatalog, toSummary } from '../services/catalog.js'

export const catalogRouter = Router()

catalogRouter.get('/catalog', async (_req, res) => {
  const entries = await getCatalog()
  const body: BuildSummary[] = entries.map(toSummary)
  res.json(body)
})
