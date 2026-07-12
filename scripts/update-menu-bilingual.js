// One-off: replace the menu with the July 2026 bilingual (EN/AR) menu from the printed PDF.
// - Updates existing rows IN PLACE (by id) so recipes, order history and food costs survive.
// - Inserts brand-new dishes.
// - Soft-deletes every active item that is not on the new menu (recoverable).
import { pool } from '../server/db.js'

const U = (id, en, ar, price, cat, desc = null) => ({ id, en, ar, price, cat, desc })
const N = (en, ar, price, cat, desc = null) => ({ id: null, en, ar, price, cat, desc })

const MENU = [
  // ── Soups ──────────────────────────────────────────────────────────────────
  U(893, 'Lentil Soup', 'شوربة عدس', 1.2, 'soups'),
  U(894, 'Chicken Soup', 'شوربة دجاج', 1.3, 'soups'),
  U(895, 'Harira Soup', 'شوربة حريرة', 1.4, 'soups'),

  // ── Crispy Appetizers ──────────────────────────────────────────────────────
  N('Cheese Rolls', 'رقائق الجبنة', 2.0, 'appetizers'),
  U(896, 'Cheese Sambouseh', 'سمبوسك الجبنة', 1.8, 'appetizers'),
  U(897, 'Meat Sambouseh', 'سمبوسك لحم', 1.8, 'appetizers'),
  N('Spinach Pancakes', 'فطاير سبانخ', 1.8, 'appetizers'),
  U(898, 'Fried Kibbeh', 'كبة مقلية', 2.5, 'appetizers'),
  U(899, 'Mixed Pastries', 'معجنات مشكلة', 2.5, 'appetizers',
    'A selection of fried kibbeh, sambouseh, cheese rolls and spinach pies — تشكيلة من الكبة المقلية، السمبوسة، رقائق الجبنة، وفطائر السبانخ'),

  // ── Hot Maza ───────────────────────────────────────────────────────────────
  U(849, 'Fattah with Hummus', 'فتة حمص', 2.0, 'hot-maza',
    'Yogurt with fried bread — زبادي مع الخبز المقلي'),
  U(850, 'Fattah with Mutton', 'فتة لحم ضان', 3.0, 'hot-maza',
    'Yogurt with fried bread — زبادي مع الخبز المقلي'),
  N('Grape Leaves (Hot)', 'ورق عنب', 3.0, 'hot-maza'),
  U(854, 'Falafel (Regular or Spicy)', 'فلافل (عادي - حار)', 1.4, 'hot-maza'),
  U(855, 'Spicy Fried Potatoes', 'بطاطس مقلية حارة', 1.8, 'hot-maza'),
  U(856, 'Chicken Wings', 'أجنحة الدجاج', 2.8, 'hot-maza'),

  // ── Cold Maza ──────────────────────────────────────────────────────────────
  U(1120, 'Traditional Hummus', 'حمص تقليدي', 1.8, 'cold-maza'),
  U(842, 'Hummus Beiruti', 'حمص بيروتي', 1.8, 'cold-maza'),
  U(843, 'Motabel', 'متبل', 1.8, 'cold-maza'),
  U(844, 'Baba Ghanoush', 'بابا غنوج', 1.8, 'cold-maza'),
  U(845, 'Labneh with Beetroot', 'لبنة بالشمندر', 2.2, 'cold-maza'),
  U(846, 'Grape Leaves with Oil', 'ورق عنب بالزيت', 1.8, 'cold-maza'),
  U(847, 'Muhammara', 'محمرة', 2.5, 'cold-maza'),
  U(848, 'Mixed Maza', 'مزة مشكلة', 3.0, 'cold-maza',
    'Hummus, motabel, muhammara, grape leaves & baba ghanoush — حمص، متبل، محمرة، ورق عنب، بابا غنوج'),
  U(851, 'Hummus with Meat', 'حمص باللحم', 3.8, 'cold-maza'),
  N('Hummus with Chicken Shawarma', 'حمص بشاورما الدجاج', 3.8, 'cold-maza'),
  N('Hummus with Meat Shawarma', 'حمص بشاورما اللحم', 3.8, 'cold-maza'),

  // ── From the Grills ────────────────────────────────────────────────────────
  U(891, 'Automatic Mix Grill 1KG', 'مشاوي الأوتوماتيك ١ كيلو', 14.0, 'grills'),
  U(892, 'Automatic Mix Grill 1/2KG', 'مشاوي الأوتوماتيك ١/٢ كيلو', 7.0, 'grills'),
  U(890, 'Mixed Grill with French Fries', 'مشاوي مشكلة مع البطاطس المقلية', 4.7, 'grills',
    'A selection of five types of kebab: lamb, kofta, shish tawook, chicken kebab and arayes — مجموعة من خمسة أنواع كباب: لحم، كفتة، شيش طاووق، كباب دجاج وعرايس'),
  U(886, 'Automatic Chicken 1KG', 'دجاج الأوتوماتيك ١ كيلو', 6.2, 'grills',
    'Boneless chicken marinated with garlic & lemon — دجاج بدون عظم متبل بالثوم والليمون'),
  U(887, 'Automatic Chicken 1/2KG', 'دجاج الأوتوماتيك ١/٢ كيلو', 3.4, 'grills',
    'Boneless chicken marinated with garlic & lemon — دجاج بدون عظم متبل بالثوم والليمون'),
  U(888, 'Grilled Chicken Wings', 'جوانح دجاج مشوي', 3.2, 'grills'),
  U(889, 'Automatic Kabab with French Fries', 'كباب الأوتوماتيك مع البطاطس المقلية', 4.7, 'grills',
    'Minced meat rolls with spices in bread, served with yogurt & tomato sauce — لفائف اللحم المفروم بالتوابل في الخبز، تقدم مع الروب وصلصة الطماطم'),
  U(882, 'Kabab Halabi', 'كباب حلبي', 4.5, 'grills',
    'Minced lamb with Arabic spices, onions and pistachio slices — مفروم لحم الضأن مع بهارات عربية وبصل وشرائح الفستق'),
  N('Kabab (Meat / Chicken)', 'كباب (لحم / دجاج)', 4.3, 'grills'),
  U(879, 'Tikka (Meat / Chicken)', 'تكة (لحم / دجاج)', 4.3, 'grills'),
  U(884, 'Arayes (Meat / Chicken)', 'عرايس (لحم / دجاج)', 3.7, 'grills'),
  U(881, 'Kofta Kabab (Meat / Chicken)', 'كفتة كباب (لحم / دجاج)', 4.7, 'grills'),

  // ── From Stone Oven (Manakish) ─────────────────────────────────────────────
  U(905, 'Manakish Zaatar', 'مناقيش زعتر', 1.3, 'manakish'),
  U(906, 'Manakish Cheese', 'مناقيش جبنة', 1.3, 'manakish'),
  U(907, 'Manakish Cheese with Zaatar', 'مناقيش جبنة بزعتر', 1.5, 'manakish'),
  U(911, 'Manakish Margherita', 'مناقيش مرجريتا', 1.9, 'manakish'),
  U(908, 'Spinach Pide', 'مناقيش السبانخ', 1.2, 'manakish'),
  U(909, 'Lahmacun', 'لحم بعجين', 1.9, 'manakish'),
  U(910, 'Manakish Chicken Shawarma', 'مناقيش شاورما دجاج', 2.0, 'manakish'),
  N('Manakish Meat Shawarma', 'مناقيش شاورما لحم', 2.0, 'manakish'),

  // ── Shawarma ───────────────────────────────────────────────────────────────
  N('Chicken Shawarma Sandwich', 'ساندوتش شاورما دجاج', 0.6, 'shawarma'),
  N('Meat Shawarma Sandwich', 'ساندوتش شاورما لحم', 0.7, 'shawarma'),
  N('Chicken Shawarma with Potatoes Plate', 'صحن شاورما دجاج مع بطاطس', 1.9, 'shawarma'),
  N('Meat Shawarma with Potatoes Plate', 'صحن شاورما لحم مع بطاطس', 1.9, 'shawarma'),
  N('Automatic Rocket with Potatoes (Chicken)', 'صاروخ الأوتوماتيك مع البطاطس - دجاج', 1.8, 'shawarma'),
  N('Automatic Rocket with Potatoes (Meat)', 'صاروخ الأوتوماتيك مع البطاطس - لحم', 1.8, 'shawarma'),
  N('Shawarma with Hot Sauce & Yogurt', 'شاورما بالصلصة الحارة واللبن', 2.5, 'shawarma',
    'Served with spicy tomato sauce, garlic sauce & yogurt — تقدم مع صلصة الطماطم الحارة وصلصة الثوم والروب'),

  // ── Sandwiches ─────────────────────────────────────────────────────────────
  U(865, 'Shish Taouk Sandwich', 'ساندويش شيش طاووق', 0.9, 'sandwiches'),
  U(867, 'Kofta Sandwich', 'ساندويش كفتة', 1.4, 'sandwiches'),
  U(866, 'Tikka Sandwich', 'ساندويش تكا', 1.4, 'sandwiches'),
  U(868, 'Falafel Sandwich', 'ساندويش فلافل', 0.5, 'sandwiches'),
  U(869, 'Falafel Sharooq', 'صاروخ فلافل', 1.2, 'sandwiches'),
  U(870, 'Shish Taouk Sharooq', 'صاروخ شيش طاووق', 2.0, 'sandwiches'),
  U(871, 'Chicken Kebab Sharooq', 'صاروخ كباب دجاج', 2.4, 'sandwiches'),
  U(873, 'Kofta Sharooq', 'صاروخ كفتة', 2.4, 'sandwiches'),
  U(872, 'Tikka Sharooq', 'صاروخ تكا', 2.4, 'sandwiches'),
  U(874, 'Meat Potato Sandwich', 'ساندويش لحم بطاطا', 0.6, 'sandwiches'),
  U(875, 'Meat Tomato Sandwich', 'ساندويش لحم طماطم', 0.6, 'sandwiches'),
  U(876, 'Chicken Liver Sandwich', 'ساندويش كبدة دجاج', 0.6, 'sandwiches'),
  U(877, 'Sheep Liver Sandwich', 'ساندويش كبدة غنم', 0.6, 'sandwiches'),
  U(878, 'Chicken with Mushroom Sandwich', 'ساندويش دجاج بالفطر', 0.6, 'sandwiches'),

  // ── Soft Drinks & Water ────────────────────────────────────────────────────
  U(963, 'Mineral Water (Small)', 'مياه معدنية صغير', 0.3, 'drinks'),
  U(964, 'Soft Drinks', 'مشروبات غازية', 0.6, 'drinks'),
  U(965, 'Laban Ayran', 'لبن عيران', 0.9, 'drinks'),

  // ── Coffee & Tea ───────────────────────────────────────────────────────────
  U(966, 'Turkish Coffee', 'قهوة تركية', 0.8, 'coffee-tea'),
  U(967, 'Nescafe', 'نيسكافيه', 0.8, 'coffee-tea'),
  U(968, 'Red Tea', 'شاي أحمر', 0.8, 'coffee-tea'),
  U(969, 'Solimani Tea', 'شاي سليماني', 0.8, 'coffee-tea'),
  U(970, 'Tea with Mint', 'شاي نعناع', 0.8, 'coffee-tea'),
  U(971, 'Tea with Ginger', 'شاي زنجبيل', 0.8, 'coffee-tea'),

  // ── Fresh Juices ───────────────────────────────────────────────────────────
  U(972, 'Fresh Lemonade with Mint', 'ليموناضة بالنعناع', 1.8, 'juices'),
  U(973, 'Fresh Orange Juice', 'عصير برتقال', 1.8, 'juices'),
  U(974, 'Fresh Carrot Juice', 'عصير جزر', 1.8, 'juices'),
  U(975, 'Fresh Watermelon Juice', 'عصير بطيخ', 1.8, 'juices'),
  U(976, 'Fresh Guava Juice', 'عصير جوافة', 1.8, 'juices'),
  U(977, 'Fresh Mango Juice', 'عصير مانجو', 1.8, 'juices'),
  U(978, 'Fresh Pineapple Juice', 'عصير أناناس', 1.8, 'juices'),
  U(979, 'Fresh Strawberry Juice', 'عصير فراولة', 1.8, 'juices'),
  U(980, 'Fresh Banana Juice', 'عصير موز', 1.8, 'juices'),
  U(981, 'Fresh Pomegranate Juice', 'عصير رمان', 2.0, 'juices'),
  U(982, 'Fresh Grape Juice', 'عصير عنب', 2.0, 'juices'),
  U(983, 'Fresh Cocktail', 'كوكتيل مشكل', 2.0, 'juices',
    'Mango, avocado, strawberry, guava mix cocktail — كوكتيل مشكل: مانجو، أفوكادو، فراولة، جوافة'),
  U(984, 'Mix Juice (You Choose, We Mix)', 'خلط (أنت تختار ونحن نخلط)', 2.0, 'juices'),

  // ── Salads ─────────────────────────────────────────────────────────────────
  U(859, 'Tabbouleh', 'تبولة', 1.9, 'salads'),
  U(860, 'Fattoush', 'فتوش عادي', 1.9, 'salads'),
  N('Fattoush with Prawns', 'فتوش مع القريدس وكرات البطاطس المقلية', 5.9, 'salads',
    'Fattoush with prawns and fried potato balls — فتوش مع القريدس وكرات البطاطس المقلية'),
  U(862, 'Oriental Salad', 'سلطة شرقية', 1.9, 'salads'),
  U(863, 'Jarjeer Salad', 'سلطة جرجير', 1.9, 'salads'),
  U(864, 'Beetroot Salad with Thyme & Arugula', 'سلطة الشمندر بالزعتر والجرجير', 2.5, 'salads'),

  // ── Desserts ───────────────────────────────────────────────────────────────
  U(958, 'Mix Fruits', 'فاكهة مشكلة', 2.0, 'desserts',
    'A selection of fresh seasonal fruits — تشكيلة من الفاكهة الموسمية الطازجة'),
  U(959, 'Um Ali', 'أم علي', 2.5, 'desserts',
    'A layered dough baked with cream and nuts — عجينة طبقية مخبوزة مع الكريمة والمكسرات'),
  U(960, 'Kunafa', 'كنافة', 2.5, 'desserts',
    'Crispy sweetened kunafa with cheese and sugar syrup — كنافة مقرمشة محلاة مع الجبنة وشراب السكر'),
  U(961, 'Rice Pudding', 'أرز بالحليب', 1.5, 'desserts',
    'Traditional Arabic pudding with milk, rice & rose water — حلوى البودينج العربية التقليدية بالحليب والأرز وماء الورد'),
  U(962, 'Muhallebia', 'مهلبية', 1.5, 'desserts'),
]

async function main() {
  // sanity: no duplicate ids / names in the new menu
  const ids = MENU.filter(m => m.id).map(m => m.id)
  if (new Set(ids).size !== ids.length) throw new Error('duplicate ids in MENU')
  const names = MENU.map(m => m.en.toLowerCase())
  if (new Set(names).size !== names.length) throw new Error('duplicate names in MENU')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let updated = 0, inserted = 0
    const keptIds = []

    for (const m of MENU) {
      if (m.id) {
        const r = await client.query(
          `UPDATE menu_items
             SET name=$1, name_ar=$2, category=$3, price=$4,
                 description=COALESCE($5, description),
                 available=true, deleted_at=NULL
           WHERE id=$6 RETURNING id`,
          [m.en, m.ar, m.cat, m.price, m.desc, m.id]
        )
        if (!r.rows.length) throw new Error(`menu item id ${m.id} not found (${m.en})`)
        keptIds.push(m.id)
        updated++
      } else {
        const r = await client.query(
          `INSERT INTO menu_items (name, name_ar, category, price, description, available, prep_time, tags, food_cost)
           VALUES ($1,$2,$3,$4,$5,true,15,'',0) RETURNING id`,
          [m.en, m.ar, m.cat, m.price, m.desc]
        )
        keptIds.push(r.rows[0].id)
        inserted++
      }
    }

    const del = await client.query(
      `UPDATE menu_items
         SET deleted_at=NOW(), available=false
       WHERE deleted_at IS NULL AND id <> ALL($1::int[])
       RETURNING id, name, category`,
      [keptIds]
    )

    await client.query('COMMIT')
    console.log(`Updated in place: ${updated}`)
    console.log(`Inserted new:     ${inserted}`)
    console.log(`Retired (soft-deleted): ${del.rows.length}`)
    for (const r of del.rows) console.log(`  - [${r.category}] ${r.name}`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
