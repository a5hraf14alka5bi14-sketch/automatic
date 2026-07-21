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
  name_ar: shortText.allow('', null),
  category: Joi.string().max(100).required(),
  price: money.required(),
  description: longText.allow('', null),
  image_url: Joi.string().max(1000).allow('', null),
  prep_time: Joi.number().integer().min(0).max(100000).allow(null),
  tags: Joi.string().max(500).allow('', null),
  food_cost: money.allow(null),
  available: Joi.boolean(),
  barcode: Joi.string().max(100).allow('', null),
  station: Joi.string().max(50).allow('', null),
})

export const menuUpdateSchema = Joi.object({
  name: shortText,
  name_ar: shortText.allow('', null),
  category: Joi.string().max(100),
  price: money,
  description: longText.allow('', null),
  image_url: Joi.string().max(1000).allow('', null),
  prep_time: Joi.number().integer().min(0).max(100000).allow(null),
  tags: Joi.string().max(500).allow('', null),
  food_cost: money.allow(null),
  available: Joi.boolean(),
  barcode: Joi.string().max(100).allow('', null),
  station: Joi.string().max(50).allow('', null),
})

export const stationCreateSchema = Joi.object({
  name: Joi.string().max(50).required(),
})

export const stationUpdateSchema = Joi.object({
  name: Joi.string().max(50),
  active: Joi.boolean(),
}).min(1)

export const inventoryCreateSchema = Joi.object({
  name: shortText.required(),
  category: Joi.string().max(100).allow('', null),
  quantity: qty.required(),
  unit: Joi.string().max(50).allow('', null),
  min_quantity: qty.allow(null),
  cost: money.allow(null),
  purchase_unit: Joi.string().max(50).allow('', null),
  units_per_purchase_unit: Joi.number().min(0.001).allow(null),
})

export const inventoryUpdateSchema = Joi.object({
  name: shortText,
  category: Joi.string().max(100).allow('', null),
  quantity: qty,
  unit: Joi.string().max(50).allow('', null),
  min_quantity: qty.allow(null),
  cost: money.allow(null),
  adjust: Joi.number(),
  purchase_unit: Joi.string().max(50).allow('', null),
  units_per_purchase_unit: Joi.number().min(0.001).allow(null),
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
  type: Joi.string().valid('dine-in', 'takeaway', 'delivery'),
  // Dine-in orders MUST carry a real table number (chosen explicitly at the POS)
  table_number: Joi.when('type', {
    is: Joi.valid('dine-in').optional(),
    then: Joi.number().integer().min(1).required()
      .messages({ 'any.required': 'Dine-in orders require a table_number', 'number.min': 'Dine-in orders require a table_number' }),
    otherwise: Joi.number().integer().min(0).allow(null),
  }),
  items: Joi.array().items(orderItemSchema).min(1).required(),
  // subtotal / tax / total from client are IGNORED — server recomputes from menu prices + settings
  customer_id: Joi.number().integer().allow(null),
  notes: Joi.string().max(2000).allow('', null),
  discount: money.allow(null),
  discount_type: Joi.string().valid('fixed', 'percent').allow(null),
  rush: Joi.boolean().allow(null),
  station: Joi.string().max(50).allow('', null),
  branch_id: Joi.number().integer().positive().allow(null),
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
  restaurant_name_ar: Joi.string().max(120).allow(''),
  business_legal_name: Joi.string().max(200).allow(''),
  business_legal_name_ar: Joi.string().max(200).allow(''),
  business_cr_no: Joi.string().max(60).allow(''),
  business_tax_card: Joi.string().max(60).allow(''),
  business_phone: Joi.string().max(60).allow(''),
  receipt_footer_ar: Joi.string().max(300).allow(''),
})

// ── Shift schemas ─────────────────────────────────────────────────────────────
// Opening a shift takes no client-supplied fields (opened_by comes from the JWT).
export const openShiftSchema = Joi.object({})

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
  vat_inclusive: Joi.boolean().default(false),
  vat_rate: Joi.number().min(0).max(100).default(5),
  entered_in_purchase_unit: Joi.boolean().default(false),
})

export const createPoSchema = Joi.object({
  supplier_id: Joi.number().integer().allow(null),
  notes: Joi.string().max(1000).allow('', null),
  items: Joi.array().items(poItemSchema).min(1).required(),
})

export const patchPoSchema = Joi.object({
  status: Joi.string().valid('draft', 'ordered', 'partially_received', 'received', 'cancelled').allow(null),
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

// ── QR self-ordering schema (public endpoint, no auth) ─────────────────────────
const qrOrderItemSchema = Joi.object({
  menu_item_id: Joi.number().integer().min(1).required(),
  quantity:     Joi.number().integer().min(1).max(99).required(),
  notes:        Joi.string().max(500).allow('', null),
  modifiers:    Joi.array().items(Joi.object({
    id:   Joi.number().integer(),
    name: Joi.string().max(100).allow('', null),
  }).unknown(true)).allow(null),
})

export const qrOrderSchema = Joi.object({
  table_number: Joi.number().integer().min(1).max(9999).required(),
  items:        Joi.array().items(qrOrderItemSchema).min(1).max(30).required(),
  notes:        Joi.string().max(500).allow('', null),
})
