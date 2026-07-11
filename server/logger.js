const IS_PROD = process.env.NODE_ENV === 'production'

const LEVEL_COLOR = {
  info:  '\x1b[36m',
  warn:  '\x1b[33m',
  error: '\x1b[31m',
  debug: '\x1b[90m',
}
const RESET = '\x1b[0m'

function log(level, msg, meta) {
  if (IS_PROD) {
    const entry = { level, time: new Date().toISOString(), msg }
    if (meta && Object.keys(meta).length) Object.assign(entry, meta)
    process.stdout.write(JSON.stringify(entry) + '\n')
  } else {
    const color = LEVEL_COLOR[level] || ''
    const tag = `${color}[${level.toUpperCase()}]${RESET}`
    const metaStr = meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''
    if (level === 'error') {
      process.stderr.write(`${tag} ${msg}${metaStr}\n`)
    } else {
      process.stdout.write(`${tag} ${msg}${metaStr}\n`)
    }
  }
}

export const logger = {
  info:  (msg, meta = {}) => log('info',  msg, meta),
  warn:  (msg, meta = {}) => log('warn',  msg, meta),
  error: (msg, meta = {}) => log('error', msg, meta),
  debug: (msg, meta = {}) => log('debug', msg, meta),
}
