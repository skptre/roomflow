import { describe, expect, it } from 'vitest'
import { designName, selectForSnapshot } from './select'

const p = (id: string, name: string, storeDomain = 'maidenhome.com', category = 'sofa') => ({ id, name, storeDomain, category })

describe('designName', () => {
  it('drops the finish after a separator and a trailing width', () => {
    expect(designName('The Brasa Sofa - Performance Velvet Taupe')).toBe('the brasa sofa')
    expect(designName('Noir 6 Drawer Dresser | Walnut')).toBe('noir 6 drawer dresser')
    expect(designName('Kova Pillow Cushion Sofa 86"')).toBe('kova pillow cushion sofa')
    expect(designName('Nomad King Sofa')).toBe('nomad king sofa')
  })
})

describe('selectForSnapshot', () => {
  it('keeps at most N per store and category, alternating designs before repeating one', () => {
    const products = [
      p('1', 'The Brasa Sofa - Velvet Taupe'),
      p('2', 'The Brasa Sofa - Mohair Noir'),
      p('3', 'The Brasa Sofa - Linen Oat'),
      p('4', 'The Jones Sofa - Linen Oat'),
      p('5', 'The Ames Sofa - Leather Cognac'),
      p('6', 'The Jones Sofa - Velvet Moss'),
    ]
    expect(selectForSnapshot(products, 4).map((x) => x.id)).toEqual(['1', '4', '5', '2'])
  })

  it('caps each store and category independently and keeps feed order within a design', () => {
    const products = [p('a', 'Rug A', 'loloirugs.com', 'rug'), p('b', 'Rug B', 'loloirugs.com', 'rug'), p('c', 'Pillow C', 'loloirugs.com', 'pillow'), p('d', 'Rug D', 'www.burrow.com', 'rug')]
    expect(selectForSnapshot(products, 1).map((x) => x.id)).toEqual(['a', 'c', 'd'])
  })

  it('keeps everything under the cap, in feed order', () => {
    const products = [p('1', 'A'), p('2', 'B')]
    expect(selectForSnapshot(products, 30)).toEqual(products)
  })
})
