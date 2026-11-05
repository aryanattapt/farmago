import {
  createFulfillmentCheck,
  createShipmentBooking,
  executeFulfillmentCommand,
  getShipmentLabel,
  getShipmentTracking,
  requestShipmentPickup,
  receiveKomerceShipmentWebhook as executeKomerceShipmentWebhook,
} from './application/fulfillment.service'
import { PostgresFulfillmentRepository } from './infrastructure/fulfillment.repository'

const repository = new PostgresFulfillmentRepository()
type ArgsAfterRepository<Fn> = Fn extends (...args: infer Args) => unknown
  ? Args extends [unknown, ...infer Rest]
    ? Rest
    : never
  : never

export const runFulfillmentCommand = (...args: ArgsAfterRepository<typeof executeFulfillmentCommand>) =>
  executeFulfillmentCommand(repository, ...args)
export const saveFulfillmentCheck = (...args: ArgsAfterRepository<typeof createFulfillmentCheck>) =>
  createFulfillmentCheck(repository, ...args)
export const requestShipmentBooking = (...args: ArgsAfterRepository<typeof createShipmentBooking>) =>
  createShipmentBooking(repository, ...args)

export const scheduleShipmentPickup = (...args: ArgsAfterRepository<typeof requestShipmentPickup>) =>
  requestShipmentPickup(repository, ...args)
export const downloadShipmentLabel = (...args: ArgsAfterRepository<typeof getShipmentLabel>) =>
  getShipmentLabel(repository, ...args)

export const fetchCustomerShipmentTracking = (...args: ArgsAfterRepository<typeof getShipmentTracking>) =>
  getShipmentTracking(repository, ...args)
export const receiveKomerceShipmentWebhook = (input: Parameters<typeof executeKomerceShipmentWebhook>[1]) =>
  executeKomerceShipmentWebhook(repository, input)

export const syncPendingShipmentTracking = () => repository.syncPendingShipmentTracking()
