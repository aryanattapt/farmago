import type { User } from '../../../shared/domain/access'
import { ApplicationError } from '../../../shared/application-error'
import type { FulfillmentCheckRequestDto, FulfillmentCommandRequestDto, KomerceDeliveryWebhookDto } from './fulfillment.dto'

export class FulfillmentOperationError extends ApplicationError {}

export interface FulfillmentRepository {
  executeCommand(
    orderId: string,
    actor: User,
    input: FulfillmentCommandRequestDto,
  ): Promise<unknown>
  createCheck(orderId: string, actor: User, input: FulfillmentCheckRequestDto): Promise<unknown>
  createShipmentBooking(orderId: string, actor: User): Promise<unknown>
  requestShipmentPickup(orderId: string, actor: User, input: { pickupDate?: unknown; pickupTime?: unknown; pickupVehicle?: unknown }): Promise<unknown>
  getShipmentTracking(orderId: string, customerId: string): Promise<unknown>
  receiveKomerceWebhook(input: KomerceDeliveryWebhookDto): Promise<unknown>
  getShipmentLabel(orderId: string, actor: User): Promise<{ base64: string }>
}

export function executeFulfillmentCommand(
  repository: FulfillmentRepository,
  orderId: string,
  actor: User,
  input: FulfillmentCommandRequestDto,
) {
  return repository.executeCommand(orderId, actor, input)
}

export function createFulfillmentCheck(
  repository: FulfillmentRepository,
  orderId: string,
  actor: User,
  input: FulfillmentCheckRequestDto,
) {
  return repository.createCheck(orderId, actor, input)
}

export function createShipmentBooking(
  repository: FulfillmentRepository,
  orderId: string,
  actor: User,
) {
  return repository.createShipmentBooking(orderId, actor)
}

export function requestShipmentPickup(
  repository: FulfillmentRepository,
  orderId: string,
  actor: User,
  input: { pickupDate?: unknown; pickupTime?: unknown; pickupVehicle?: unknown },
) {
  return repository.requestShipmentPickup(orderId, actor, input)
}

export function getShipmentLabel(
  repository: FulfillmentRepository,
  orderId: string,
  actor: User,
) {
  return repository.getShipmentLabel(orderId, actor)
}

export function getShipmentTracking(repository: FulfillmentRepository, orderId: string, customerId: string) {
  return repository.getShipmentTracking(orderId, customerId)
}

export function receiveKomerceShipmentWebhook(
  repository: FulfillmentRepository,
  input: KomerceDeliveryWebhookDto,
) {
  return repository.receiveKomerceWebhook(input)
}
