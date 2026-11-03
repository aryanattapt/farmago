import {
  listEligibleCheckoutPharmacies,
  requestCheckoutQuote,
} from './application/quote.service'
import type { CreateQuoteRequestDto } from './application/quote.dto'
import { PostgresCheckoutRepository } from './infrastructure/checkout.repository'

const repository = new PostgresCheckoutRepository()

export const createCheckoutQuote = (customerId: string, input: CreateQuoteRequestDto) =>
  requestCheckoutQuote(repository, customerId, input)

export const listCheckoutPharmacies = (customerId: string, input: CreateQuoteRequestDto) =>
  listEligibleCheckoutPharmacies(repository, customerId, input)
