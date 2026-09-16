interface ProductSyncInput { medusaProductId: string; handle: string; title: string; source?: string; }
interface CategorySyncInput { medusaCategoryId: string; handle: string; title: string; source?: string; }

export default class PayloadSyncModuleService {
  async upsertProductContent(input: ProductSyncInput): Promise<ProductSyncInput> { return input; }
  async deleteByMedusaProductId(_id: string): Promise<boolean> { return false; }
  async upsertCategoryContent(input: CategorySyncInput): Promise<CategorySyncInput> { return input; }
  async deleteByMedusaCategoryId(_id: string): Promise<boolean> { return false; }
}
