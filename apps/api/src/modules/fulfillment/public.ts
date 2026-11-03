import {
  createFulfillmentCheck,
  createShipmentBooking,
  executeFulfillmentCommand,
  getShipmentLabel,
  requestShipmentPickup,
} from './application/fulfillment.service'
import { PostgresFulfillmentRepository } from './infrastructure/fulfillment.repository'

const repository = new PostgresFulfillmentRepository()

export const runFulfillmentCommand = (...args: Parameters<typeof executeFulfillmentCommand>) =>
  executeFulfillmentCommand(repository, ...args)
export const saveFulfillmentCheck = (...args: Parameters<typeof createFulfillmentCheck>) =>
  createFulfillmentCheck(repository, ...args)
export const requestShipmentBooking = (...args: Parameters<typeof createShipmentBooking>) =>
  createShipmentBooking(repository, ...args)

export const scheduleShipmentPickup = (...args: Parameters<typeof requestShipmentPickup>) =>
  requestShipmentPickup(repository, ...args)
export const downloadShipmentLabel = (...args: Parameters<typeof getShipmentLabel>) =>
  getShipmentLabel(repository, ...args)
