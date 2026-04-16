/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import terminalRoutes from './routes/terminal.js'
import dispatchRoutes from './routes/dispatch.js'
import inventoryRoutes from './routes/inventory.js'
import workOrderRoutes from './routes/workOrders.js'
import materialRoutes from './routes/materials.js'
import skillRoutes from './routes/skills.js'
import settingsRoutes from './routes/settings.js'
import dashboardRoutes from './routes/dashboard.js'
import wageRulesRoutes from './routes/wageRules.js'
import wagesRoutes from './routes/wages.js'
import processRoutes from './routes/processes.js'
import workReportRoutes from './routes/workReports.js'
import workReportItemRoutes from './routes/workReportItems.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/v1/terminal', terminalRoutes)
app.use('/api/v1/dispatch', dispatchRoutes)
app.use('/api/v1/inventory', inventoryRoutes)
app.use('/api/v1/work-orders', workOrderRoutes)
app.use('/api/v1/materials', materialRoutes)
app.use('/api/v1/skills', skillRoutes)
app.use('/api/v1/settings', settingsRoutes)
app.use('/api/v1/dashboard', dashboardRoutes)
app.use('/api/v1/wage-rules', wageRulesRoutes)
app.use('/api/v1/wages', wagesRoutes)
app.use('/api/v1/processes', processRoutes)
app.use('/api/v1/work-reports', workReportRoutes)
app.use('/api/v1/work-report-items', workReportItemRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
