// Generic Joi validation middleware factory.
// Validates req[source] against the schema. On failure returns 400 with a
// concise, user-safe message (no internals). On success leaves req.body intact
// (unknown keys are allowed so route handlers keep working unchanged).
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      allowUnknown: true,
      convert: true,
    })
    if (error) {
      const message = error.details.map(d => d.message).join('; ')
      return res.status(400).json({ error: message })
    }
    req[source] = value
    next()
  }
}
