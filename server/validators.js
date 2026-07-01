import Joi from 'joi'

// Shared building blocks
const money = Joi.number().min(0)                       // reject negatives
const qty = Joi.number().min(0)
const shortText = Joi.string().max(255)
const longText = Joi.string().max(2000)
const midText = Joi.string().max(500)

// ── Menu ─────────────────────────────────────────────────────────────────────
export const menuCreateSchema = Joi.object({
  name: shortText.required(),
  category: Joi.string().max(100).required(),
  price: money.required(),
  description: longText.allow('', null),
  image_url: Joi.string().max(1000).allow('', null),
  prep_time: Joi.number().integer().min(0).max(100000).allow(null),
  tags: Joi.string().max(500).allow('', null),
  food_cost: money.allow(null),
  available: Joi.boolean(),
})

export const menuUpdateSchema = Joi.object({
  name: shortText,
  category: Joi.string().max(100),
  price: money,
  description: longText.allow('', null),
  image_url: Joi.string().max(1000).allow('', null),
  prep_time: Joi.number().integer().min(0).max(100000).allow(null),
  tags: Joi.string().max(500).allow('', null),
  food_cost: money.allow(null),
  available: Joi.boolean(),
})

// ── Inventory ────────────────────────────────────────────────────────────────
export const inventoryCreateSchema = Joi.object({
  name: shortText.required(),
  category: Joi.string().max(100).allow('', null),
  quantity: qty.required(),
  unit: Joi.string().max(50).allow('', null),
  min_quantity: qty.allow(null),
  cost: money.allow(null),
})

export const inventoryUpdateSchema = Joi.object({
  name: shortText,
  category: Joi.string().max(100).allow('', null),
  quantity: qty,
  unit: Joi.string().max(50).allow('', null),
  min_quantity: qty.allow(null),
  cost: money.allow(null),
  adjust: Joi.number(),   // signed delta (can be negative)
})

// ── Customers ────────────────────────────────────────────────────────────────
export const customerCreateSchema = Joi.object({
  name: shortText.required(),
  email: Joi.string().email().max(255).allow('', null),
  phone: Joi.string().max(50).allow('', null),
  address: midText.allow('', null),
  notes: longText.allow('', null),
})

export const customerUpdateSchema = Joi.object({
  name: shortText,
  email: Joi.string().email().max(255).allow('', null),
  phone: Joi.string().max(50).allow('', null),
  address: midText.allow('', null),
  notes: longText.allow('', null),
})

// ── Orders ───────────────────────────────────────────────────────────────────
const orderItemSchema = Joi.object({
  menu_item_id: Joi.number().integer().allow(null),
  name: Joi.string().max(255).allow('', null),
  quantity: Joi.number().integer().min(1).required(),
  price: money.allow(null),
  notes: Joi.string().max(500).allow('', null),
  modifiers: Joi.array(),
})

export const orderCreateSchema = Joi.object({
  type: Joi.string().max(50),
  table_number: Joi.number().integer().min(0).allow(null),
  items: Joi.array().items(orderItemSchema).min(1).required(),
  subtotal: money.allow(null),
  tax: money.allow(null),
  total: money.allow(null),
  customer_id: Joi.number().integer().allow(null),
  notes: Joi.string().max(2000).allow('', null),
})

export const orderStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'preparing', 'ready', 'completed', 'cancelled').required(),
  payment_method: Joi.string().max(50).allow('', null),
})

// ── Settings ─────────────────────────────────────────────────────────────────
// Only the numeric keys are constrained; other keys pass through (allowUnknown).
export const settingsUpdateSchema = Joi.object({
  tax_rate: Joi.number().min(0).max(100),
  tables_count: Joi.number().integer().min(0),
  loyalty_points_per_omr: Joi.number().min(0),
})
