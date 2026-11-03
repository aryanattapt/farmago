import type { AddressInputDto } from './address.dto'
import { ApplicationError } from '../../../shared/application-error'
import { searchShippingDestinations } from '../../shipping/public'

export interface AddressRepository {
  listForUser(userId: string): Promise<unknown[]>
  createForUser(userId: string, address: AddressInputDto): Promise<unknown>
  updateForUser(userId: string, addressId: string, address: AddressInputDto): Promise<boolean>
}

export function listAddresses(repository: AddressRepository, userId: string) {
  return repository.listForUser(userId)
}

export async function createAddress(
  repository: AddressRepository,
  userId: string,
  input: Partial<AddressInputDto>,
) {
  const address = normalizeAddress(input)
  if (
    Object.entries(address).some(([key, value]) => !['rajaongkirDestinationId', 'rajaongkirDestinationLabel'].includes(key) && !value) ||
    address.recipientName.length > 100 ||
    address.addressText.length > 500 ||
    (address.rajaongkirDestinationId != null &&
      (!Number.isSafeInteger(address.rajaongkirDestinationId) || address.rajaongkirDestinationId <= 0))
  )
    throw new ApplicationError(
      400,
      'INVALID_ADDRESS',
      'Lengkapi nama penerima, telepon, alamat, kota, dan kode pos.',
    )
  await validateDestinationSelection(address)
  return repository.createForUser(userId, address)
}

export async function updateAddress(
  repository: AddressRepository,
  userId: string,
  addressId: string,
  input: Partial<AddressInputDto>,
) {
  const address = normalizeAddress(input)
  if (
    Object.entries(address).some(([key, value]) => !['rajaongkirDestinationId', 'rajaongkirDestinationLabel'].includes(key) && !value) ||
    (address.rajaongkirDestinationId != null &&
      (!Number.isSafeInteger(address.rajaongkirDestinationId) || address.rajaongkirDestinationId <= 0))
  )
    throw new ApplicationError(400, 'INVALID_ADDRESS', 'Semua kolom alamat diperlukan.')
  await validateDestinationSelection(address)
  if (!(await repository.updateForUser(userId, addressId, address)))
    throw new ApplicationError(404, 'NOT_FOUND', 'Alamat tidak ditemukan.')
}

function normalizeAddress(input: Partial<AddressInputDto>): AddressInputDto {
  return {
    recipientName: String(input.recipientName ?? '').trim(),
    phone: String(input.phone ?? '').trim(),
    addressText: String(input.addressText ?? '').trim(),
    city: String(input.city ?? '').trim(),
    postalCode: String(input.postalCode ?? '').trim(),
    rajaongkirDestinationId:
      input.rajaongkirDestinationId == null ? null : Number(input.rajaongkirDestinationId),
    rajaongkirDestinationLabel: String(input.rajaongkirDestinationLabel ?? '').trim() || null,
  }
}

async function validateDestinationSelection(address: AddressInputDto) {
  if (address.rajaongkirDestinationId == null) {
    if (address.rajaongkirDestinationLabel)
      throw new ApplicationError(400, 'INVALID_DESTINATION', 'Pilih area tujuan dari hasil RajaOngkir.')
    return
  }
  if (!address.rajaongkirDestinationLabel)
    throw new ApplicationError(400, 'INVALID_DESTINATION', 'Pilih area tujuan dari hasil RajaOngkir.')
  const destinations = await searchShippingDestinations(address.rajaongkirDestinationLabel.slice(0, 100))
  const selected = destinations.find((item) => item.id === address.rajaongkirDestinationId)
  if (
    !selected ||
    selected.cityName.toLocaleLowerCase('id-ID') !== address.city.toLocaleLowerCase('id-ID') ||
    selected.zipCode !== address.postalCode
  )
    throw new ApplicationError(
      400,
      'INVALID_DESTINATION',
      'Area tujuan, kota, atau kode pos tidak cocok dengan data RajaOngkir.',
    )
}
