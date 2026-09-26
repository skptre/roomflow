import { describe, expect, it } from 'vitest'
import { CATEGORIES } from '../domain/categories'
import { defaultRecipeId, getRecipe, recipeAsset, registerRecipes, resolveRecipe } from './registry'
import { validateRecipe, type Recipe } from './recipe'

describe('default recipes', () => {
  it('exist and validate for every catalog category and every captured (RoomPlan) category we draw', () => {
    for (const category of [...Object.keys(CATEGORIES), 'table', 'chair', 'storage']) {
      const id = defaultRecipeId(category)
      expect(id, category).not.toBeNull()
      const recipe = getRecipe(id!)
      expect(recipe, category).toBeDefined()
      expect(validateRecipe(recipe).ok, category).toBe(true)
    }
  })

  it('has no default for categories we cannot draw', () => {
    expect(defaultRecipeId('fireplace')).toBeNull()
    expect(defaultRecipeId('constructor')).toBeNull()
  })

  it('builds a recipe asset for a category, with colors, or a placeholder', () => {
    expect(recipeAsset('sofa')).toEqual({ kind: 'recipe', recipeId: 'default:sofa' })
    expect(recipeAsset('sofa', { upholstery: '#445566' })).toEqual({ kind: 'recipe', recipeId: 'default:sofa', colors: { upholstery: '#445566' } })
    expect(recipeAsset('television')).toEqual({ kind: 'placeholder' })
  })
})

describe('resolveRecipe', () => {
  it('finds a registered recipe, else the category default, else nothing', () => {
    const custom: Recipe = { schemaVersion: 1, id: 'test:registry:sofa', family: 'sofa', blocks: { arm: 'rolled' }, params: {}, tier: 'rules' }
    registerRecipes([custom])
    expect(resolveRecipe('test:registry:sofa', 'sofa')).toEqual(custom)
    expect(resolveRecipe('missing', 'sofa')?.id).toBe('default:sofa')
    expect(resolveRecipe('missing', 'fireplace')).toBeUndefined()
  })

  it('refuses to register an invalid recipe', () => {
    expect(() => registerRecipes([{ schemaVersion: 1, id: 'bad', family: 'sofa', blocks: { arm: 'wing' }, params: {}, tier: 'rules' }])).toThrow(/arm/)
  })
})
