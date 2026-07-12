export const CATS = [
  { id: 'all',        label: 'All',        emoji: '🍽️' },
  { id: 'soups',      label: 'Soups',      emoji: '🍲' },
  { id: 'appetizers', label: 'Appetizers', emoji: '🥟' },
  { id: 'hot-maza',   label: 'Hot Maza',   emoji: '🍢' },
  { id: 'cold-maza',  label: 'Cold Maza',  emoji: '🧆' },
  { id: 'grills',     label: 'Grills',     emoji: '🔥' },
  { id: 'manakish',   label: 'Manakish',   emoji: '🫓' },
  { id: 'shawarma',   label: 'Shawarma',   emoji: '🌯' },
  { id: 'sandwiches', label: 'Sandwiches', emoji: '🥪' },
  { id: 'salads',     label: 'Salads',     emoji: '🥗' },
  { id: 'desserts',   label: 'Desserts',   emoji: '🍮' },
  { id: 'drinks',     label: 'Drinks',     emoji: '🥤' },
  { id: 'coffee-tea', label: 'Coffee & Tea', emoji: '☕' },
  { id: 'juices',     label: 'Fresh Juices', emoji: '🧃' },
]

// Drink categories print on their own KOT slip (drinks station), like the
// restaurant's real thermal printer setup. Everything else goes to the kitchen.
const DRINK_CATEGORIES = new Set(['drinks', 'coffee-tea', 'juices'])

export function stationForCategory(category) {
  return DRINK_CATEGORIES.has(category) ? 'drinks' : 'kitchen'
}
