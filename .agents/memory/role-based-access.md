---
name: Role-based access control
description: Which routes have requireRole guards and the pattern used
---

## Pattern
Router-level middleware for bulk protection (cleaner than per-route):
```js
router.use((req, res, next) => {
  if (req.method === 'GET') return next()
  return requireRole('admin', 'manager')(req, res, next)
})
```

## Applied to
| Route file | Protection |
|------------|-----------|
| `server/routes/menu.js` | All non-GET → admin/manager |
| `server/routes/inventory.js` | All non-GET → admin/manager |
| `server/routes/customers.js` | PATCH /:id/points + DELETE /:id → admin/manager; POST/PATCH remain open (cashiers register customers) |
| `server/routes/settings.js` | PUT → admin/manager (done earlier) |
| `server/routes/users.js` | All write ops → admin (done earlier) |

## NOT yet enforced on the frontend
Role UI gating (hiding admin buttons based on user.role from localStorage) is still in the backlog. Currently backend-only enforcement.

**Why:** Backend enforcement is the security boundary; frontend gating is just UX convenience. Don't skip backend even if frontend is added.
