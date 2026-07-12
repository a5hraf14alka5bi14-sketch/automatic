import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import { hashPassword, verifyPassword, needsRehash, ARGON2_PARAMS } from '../server/lib/password.js'

describe('password hashing (Argon2id + legacy bcrypt)', () => {
  it('hashPassword produces an Argon2id encoded hash', async () => {
    const hash = await hashPassword('Sup3r$ecret!')
    expect(hash.startsWith('$argon2id$')).toBe(true)
    expect(hash).toContain(`m=${ARGON2_PARAMS.memorySize}`)
    expect(hash).toContain(`t=${ARGON2_PARAMS.iterations}`)
  })

  it('verifyPassword accepts a correct Argon2id password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse')
    expect(await verifyPassword('correct horse', hash)).toBe(true)
    expect(await verifyPassword('wrong horse', hash)).toBe(false)
  })

  it('verifyPassword still validates legacy bcrypt hashes', async () => {
    const legacy = await bcrypt.hash('legacyPass1', 10)
    expect(await verifyPassword('legacyPass1', legacy)).toBe(true)
    expect(await verifyPassword('nope', legacy)).toBe(false)
  })

  it('verifyPassword returns false (never throws) on malformed hashes', async () => {
    expect(await verifyPassword('x', '')).toBe(false)
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('x', null)).toBe(false)
  })

  it('needsRehash flags legacy bcrypt hashes for upgrade', async () => {
    const legacy = await bcrypt.hash('legacyPass1', 10)
    expect(needsRehash(legacy)).toBe(true)
    const strongBcrypt = await bcrypt.hash('legacyPass1', 12)
    expect(needsRehash(strongBcrypt)).toBe(true)
  })

  it('needsRehash does NOT flag a current-parameter Argon2id hash', async () => {
    const hash = await hashPassword('current')
    expect(needsRehash(hash)).toBe(false)
  })

  it('needsRehash flags a weaker Argon2id profile', () => {
    const weak = '$argon2id$v=19$m=4096,t=1,p=1$c29tZXNhbHQ$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNo'
    expect(needsRehash(weak)).toBe(true)
  })
})
