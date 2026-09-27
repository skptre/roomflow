import { describe, expect, it } from 'vitest'
import { categoryInfo } from '../domain/categories'
import { categorize } from './categorize'

/** [product_type, title, expected category] — pairs taken from the harvested feeds. */
const MAPPED: [string, string, string][] = [
  ['Sofas & Loveseats', 'Harper 113.5" Leather Left-Facing Pull-Out Sleeper Sectional | Chocolate Brown', 'sectional'],
  ['Sofa', 'Kova Pillow Cushion Sofa 86"', 'sofa'],
  ['Seating', 'Nomad King Sofa', 'sofa'],
  ['Modular Sofas', 'Aspen 39" Modular Corner | Linen White', 'sofa'],
  ['Sectional', 'Kova Pillow Cushion U-Shape', 'sectional'],
  ['Sectionals', 'Two-Piece Form Sectional - In Stock', 'sectional'],
  ['Outdoor Furniture', 'Relay Outdoor 2-Piece Sofa', 'sofa'],
  ['Seating', 'Studio Chair', 'lounge-chair'],
  ['Furniture', 'Giorgio Outdoor Accent Chair', 'lounge-chair'],
  ['Accent Seating', 'Lodge Chair', 'lounge-chair'],
  ['Swivel Chair', 'The Vera Swivel Chair - Deep Pile Mohair Noir', 'lounge-chair'],
  ['Armchair', 'Barton Armchair', 'lounge-chair'],
  ['Dining Chair', 'The Sol Dining Chair - Heritage Belgian Linen', 'dining-chair'],
  ['Bar and Counter Stools', 'Batu Indoor / Outdoor Backless Counter Height Stool', 'dining-chair'],
  ['Ottoman', 'Kova Pillow Cushion Ottoman', 'ottoman'],
  ['Pillows & Throws', 'Kass Throw Pillow by Classic Home', 'pillow'],
  ['Pillows & Throws', 'Grid Knit Cotton Throw Blanket', 'throw'],
  ['Seating', 'Range Ottoman', 'ottoman'],
  ['Benches, Stools & Ottomans', 'Este Bench | Shadow Brown', 'bench'],
  ['Dining Bench', 'Ora Dining Bench', 'bench'],
  ['Beds', 'The Floyd Bed — Upholstered, Original', 'bed'],
  ['Bed', 'The Verne Bed - Deep Pile Mohair Noir', 'bed'],
  ['Nightstands', 'June Nightstand', 'nightstand'],
  ['Dressers', 'Noir 6 Drawer Dresser | Walnut', 'dresser'],
  ['Storage', 'Maro Wardrobe / Armoire | Walnut', 'cabinet'],
  ['Media Centers', 'Nest Media Console', 'cabinet'],
  ['Shelving', 'Nest Shelving', 'bookshelf'],
  ['Bookshelf', 'The Vento Bookshelf', 'bookshelf'],
  ['Coffee Tables', 'Andy Coffee Table', 'coffee-table'],
  ['Accent Tables', 'Torno Side Table | Walnut', 'side-table'],
  ['Accent Table', 'Carta Side Table', 'side-table'],
  ['Dining Tables', 'Preston 96" Dining Table | Walnut', 'dining-table'],
  ['Console Table', 'The Reade Console Table', 'console'],
  ['Table Lamp', 'Rospo Table Lamp', 'table-lamp'],
  ['Lighting', 'Stone Table Lamp', 'table-lamp'],
  ['Lighting', 'Lincoln Desk Lamp', 'table-lamp'],
  ['Lighting', 'Calla Bookshelf Lamp', 'table-lamp'],
  ['RUGS', 'VLR-01 IVORY / GREEN', 'rug'],
  ['Rugs', 'Peak Rug - Navy/Cream', 'rug'],
  ['Indoor Plant', 'Croton Nectarine', 'plant'],
  ['Horizontal', 'Forest Sketch', 'wall-art'],
  ['Vertical', 'Old Pine', 'wall-art'],
  ['Art', 'Organic Abstracts', 'wall-art'],
  ['WALL ART', 'SYCAMORE', 'wall-art'],
  ['Mirrors', 'Nathan Mirror', 'mirror'],
  ['Curtain', 'Siberian Ice Textured Dupioni Silk Room Darkening Curtain', 'curtain'],
  ['Custom Curtain', 'Gardenia Textured Faux Linen Sheer Custom Curtain', 'curtain'],
  ['Pillows & Throws', 'Vintage Pillow No. 216, 22" x 22"', 'pillow'],
  ['PILLOWS', 'PCJ0045 ALDER GOLD / GREEN', 'pillow'],
  ['Decorative Pillows', 'Cozy Bouclé Pillow Cover - Holly', 'pillow'],
  ['Throw Pillows', 'Anders Pillow Cover', 'pillow'],
  ['Throw Blankets', 'Aran Knit Throw Blanket - Camel', 'throw'],
  ['Throws', 'Basketweave Throw (Evergreen)', 'throw'],
  ['Decor', 'Ceramic Vase', 'vase'],
  ['Decorative Accessories', 'Robyn Lantern', 'decor-object'],
  ['', 'The Brasa Sofa - Performance Velvet Taupe', 'sofa'],
  ['Modular Sectional', 'Jones Modular Sectional', 'sectional'],
  ['Cabinet', 'Hadley Cabinet', 'cabinet'],
  ['Round Dining Table', 'Arc Round Dining Table', 'dining-table'],
  ['Daybed', 'Lune Daybed', 'bed'],
  ['Trays', 'Cove Tray', 'decor-object'],
  ['Stools', 'Forma Stool', 'ottoman'],
  ['Blankets', 'Cashmere Throw', 'throw'],
  // Floyd files this chair under Sectionals: an explicit object word in the title wins over a sofa type.
  ['Sectionals', 'Sink Down Lounge Chair', 'lounge-chair'],
  ['Sofas & Loveseats', 'Nolita Leather Ottoman | Olivine Green', 'ottoman'],
]

/** [product_type, title] — listings that are not visible room objects or not buyable as one. */
const EXCLUDED: [string, string][] = [
  ['Slipcover', 'Yogi Curve Sectional Slipcover Only'],
  ['Swatch', 'Clay Performance Linen'],
  ['Swatches', 'Ellis Black Abstract Printed Cotton Swatch'],
  ['Fabric Swatches', 'Linen Box Quilt Fabric Swatch (Dusk)'],
  ['Sample', 'Brume Collection by Elan Byrd Rattan/Marble Sample'],
  ['Content', 'Content: Bundle Content Tile (September Bundle)'],
  ['Bundle', 'Exclusive Fall Bundle'],
  ['Fee', 'Recycling Fee RI'],
  ['Fabric', 'Light Teal Green Heritage Plush Velvet Fabric'],
  ['Pulls', 'James Pull'],
  ['Knobs', 'Belmont Knob'],
  ['Hook', 'Knurled Hook'],
  ['Hardware', 'The Floyd Leg'],
  ['Serviceability', 'Serviceability - The Floyd Leg'],
  ['Sheets', 'Dreamweave Waffle Lounge Around Bundle'],
  ['Sheet Sets', 'Percale Embellished Sheet Set - White/Plum Picot'],
  ['Duvet Covers', 'Breezeweave Crinkle Cotton Duvet Cover'],
  ['Pillowcase Sets', 'Percale Embellished Pillowcase Set - White/Plum Picot'],
  ['Shams', 'Dream Comforter Sham - Stone'],
  ['Comforters', 'Signature Comforter Set - Pewter'],
  ['Bed Blankets', 'Essential Bed Blanket - Honey'],
  ['Towels', 'Super-Plush Turkish Cotton Hand Towels Set of 2'],
  ['Robes', 'Cotton Shorty Robe'],
  ['Mattress', 'T&N Original Mattress II'],
  ['Adjustable Base', 'The Adjustable Base'],
  ['Pillow', 'Down Alternative Pillow Set'],
  ['Pillows', 'Down Alternative Euro Pillow Insert'],
  ['Pillow', 'Zip Comfort Pillow'],
  ['Pillow', 'Original Foam Pillow'],
  ['Bed Add-Ons', 'The Upholstered Bed Frame — Add On'],
  ['Headboards', 'Essential Headboard - CL'],
  ['Roman Shade', 'Dark Merlot Heritage Plush Velvet Roman Shade'],
  ['Shower Curtains', 'Linen Shower Curtain'],
  ['Bath Rugs', 'Organic Plush Tub Mat (Sky)'],
  ['Outdoor Plant', 'Black Hero Double Peony Tulip'],
  ['Consumable', 'Leaf Care Spray'],
  ['Wall Sconce', 'Eduard Wall Sconce'],
  ['Flush Mount', 'Alabax Small Flush Mount'],
  ['Dining Chairs', 'Lev Vegan Leather Dining Chair | Green | Set of 2'],
  ['Outdoor Set', 'Gomera Outdoor Lounge Set with Coffee Table'],
  ['Decorative Accessories', 'Robyn Outdoor Lanterns (Set of 2)'],
  ['Rugs', 'Premium Rug Pad'],
  ['', 'Gift Card'],
  ['Outdoor Furniture', 'Relay Outdoor Dining Table & Chairs Set'],
  ['Seating', 'Nomad Leather Club Chair with Ottoman'],
  ['Ottomans', 'Upholstered Ottoman + Tray'],
  ['Sectional', 'Kova Pillow Cushion Sofa 86" + Ottoman'],
  ['Blankets', 'Breezeweave Crinkle Cotton Bed Blanket'],
  ['Coverlet', 'Washed Linen Coverlet'],
]

describe('categorize', () => {
  it.each(MAPPED)('maps "%s" / "%s" to %s', (productType, title, expected) => {
    const result = categorize({ productType, title, tags: [] })
    expect(result).toEqual({ category: expected })
    expect(categoryInfo(expected), `category ${expected} must exist`).toBeDefined()
  })

  it.each(EXCLUDED)('excludes "%s" / "%s" with a reason', (productType, title) => {
    const result = categorize({ productType, title, tags: [] })
    expect(result.category).toBeNull()
    expect(result).toHaveProperty('excluded')
  })

  it('reports an unmapped listing without guessing', () => {
    expect(categorize({ productType: 'Wellness', title: 'From Soil to Form Oil Diffuser', tags: [] })).toEqual({ category: null, excluded: 'unmapped' })
  })
})
