import Joi from 'joi'

const money = Joi.number().min(0)
const qty = Joi.number().min(0)
const shortText = Joi.string().max(255)
const longText = Joi.string().max(2000)
const midText = Joi.string().max(500)

export const passwordSchema = Joi.string()
  .min(8).max(128)
  .pattern(/[A-Z]/).pattern(/[a-z]/).pattern(/[0-9]/)
  .messages({
    'string.min':          'Password must be at least 8 characters',
    'string.max':          'Password must be at most 128 characters',
    'string.pattern.base': 'Password must include an uppercase letter, a lowercase letter, and a number',
  })

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
  barcode: Joi.string().max(100).allow('', null),
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
  barcode: Joi.string().max(100).allow('', null),
})

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
  adjust: Joi.number(),
})

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

const orderItemSchema = Joi.object({
  menu_item_id: Joi.number().integer().allow(null),
  name: Joi.string().max(255).allow('', null),
  quantity: Joi.number().integer().min(1).required(),
  // price is accepted from client but IGNORED for items with menu_item_id (server reprices from DB)
  price: money.allow(null),
  notes: Joi.string().max(500).allow('', null),
  item_notes: Joi.string().max(500).allow('', null),
  modifiers: Joi.array(),
  station: Joi.string().max(50).allow('', null),
})

export const orderCreateSchema = Joi.object({
  type: Joi.string().max(50),
  table_number: Joi.number().integer().min(0).allow(null),
  items: Joi.array().items(orderItemSchema).min(1).required(),
  // subtotal / tax / total from client are IGNORED — server recomputes from menu prices + settings
  customer_id: Joi.number().integer().allow(null),
  notes: Joi.string().max(2000).allow('', null),
  discount: money.allow(null),
  discount_type: Joi.string().valid('fixed', 'percent').allow(null),
  rush: Joi.boolean().allow(null),
  station: Joi.string().max(50).allow('', null),
})

export const orderStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'preparing', 'ready', 'completed', 'cancelled').required(),
  payment_method: Joi.string().max(50).allow('', null),
  loyalty_redemption_points: Joi.number().integer().min(0).allow(null),
  void_reason: Joi.string().max(500).allow('', null),
  void_manager_pin: Joi.string().max(20).allow('', null),
})

export const orderDiscountSchema = Joi.object({
  discount: Joi.number().min(0).required(),
  discount_type: Joi.string().valid('fixed', 'percent').required(),
})

export const orderRushSchema = Joi.object({
  rush: Joi.boolean().required(),
})

export const orderItemDoneSchema = Joi.object({
  done: Joi.boolean().required(),
})

export const settingsUpdateSchema = Joi.object({
  tax_rate: Joi.number().min(0).max(100),
  tables_count: Joi.number().integer().min(0),
  loyalty_points_per_omr: Joi.number().min(0),
})

// ── Shift schemas ─────────────────────────────────────────────────────────────
export const closeShiftSchema = Joi.object({
  actual_cash: Joi.number().min(0).required(),
  notes: Joi.string().max(1000).allow('', null),
})

// ── Purchase Order schemas ─────────────────────────────────────────────────────
const poItemSchema = Joi.object({
  inventory_id: Joi.number().integer().allow(null),
  item_name: Joi.string().max(255).allow('', null),
  quantity: Joi.number().min(0).required(),
  unit: Joi.string().max(50).allow('', null),
  unit_cost: Joi.number().min(0).allow(null),
})

export const createPoSchema = Joi.object({
  supplier_id: Joi.number().integer().allow(null),
  notes: Joi.string().max(1000).allow('', null),
  items: Joi.array().items(poItemSchema).min(1).required(),
})

export const patchPoSchema = Joi.object({
  status: Joi.string().valid('draft', 'ordered', 'received', 'cancelled').allow(null),
  notes: Joi.string().max(1000).allow('', null),
})

// ── User management schemas ────────────────────────────────────────────────────
const VALID_ROLES_LIST = ['admin', 'manager', 'cashier', 'kitchen', 'staff']

export const createUserSchema = Joi.object({
  name: shortText.required(),
  email: Joi.string().email().max(255).required(),
  password: passwordSchema.required(),
  role: Joi.string().valid(...VALID_ROLES_LIST).default('staff'),
})

export const patchUserRoleSchema = Joi.object({
  role: Joi.string().valid(...VALID_ROLES_LIST).required(),
})
