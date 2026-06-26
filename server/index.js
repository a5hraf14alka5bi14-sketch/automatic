import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import menuRoutes from './routes/menu.js'
import ordersRoutes from './routes/orders.js'
import inventoryRoutes from './routes/inventory.js'
import customersRoutes from './routes/customers.js'
import dashboardRoutes from './routes/dashboard.js'
import reportsRoutes from './routes/reports.js'
import notionRoutes from './routes/notion.js'
import { initDb } from './db.js'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/menu', menuRoutes)
app.use('/api/orders', ordersRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/customers', customersRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/notion', notionRoutes)

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

initDb().then(() => {
  app.listen(PORT, 'localhost', () => {
    console.log(`API server running on http://localhost:${PORT}`)
  })
}).catch(err => {
  console.error('Failed to initialize database:', err)
  process.exit(1)
})
