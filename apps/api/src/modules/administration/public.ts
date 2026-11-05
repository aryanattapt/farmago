import {
  configureAdminInventory,
  createAdminPharmacy,
  createAdminProduct,
  listAdminCancellationRequests,
  listAdminOrders,
  listAdminPharmacies,
  listAdminProducts,
  listAdminSupportCases,
  updateAdminPharmacy,
  updateAdminProduct,
} from './application/administration.service'
import { PostgresAdministrationRepository } from './infrastructure/administration.repository'

const repository = new PostgresAdministrationRepository()
type ArgsAfterRepository<Fn> = Fn extends (...args: infer Args) => unknown
  ? Args extends [unknown, ...infer Rest]
    ? Rest
    : never
  : never

export const getAdminProducts = () => listAdminProducts(repository)
export const getAdminPharmacies = () => listAdminPharmacies(repository)
export const getAdminOrders = () => listAdminOrders(repository)
export const getAdminCancellationRequests = () => listAdminCancellationRequests(repository)
export const getAdminSupportCases = () => listAdminSupportCases(repository)
export const createAdminProductRecord = (...args: ArgsAfterRepository<typeof createAdminProduct>) =>
  createAdminProduct(repository, ...args)
export const configureAdminInventoryRecord = (
  ...args: ArgsAfterRepository<typeof configureAdminInventory>
) => configureAdminInventory(repository, ...args)
export const updateAdminProductRecord = (...args: ArgsAfterRepository<typeof updateAdminProduct>) =>
  updateAdminProduct(repository, ...args)
export const createAdminPharmacyRecord = (...args: ArgsAfterRepository<typeof createAdminPharmacy>) =>
  createAdminPharmacy(repository, ...args)
export const updateAdminPharmacyRecord = (...args: ArgsAfterRepository<typeof updateAdminPharmacy>) =>
  updateAdminPharmacy(repository, ...args)
