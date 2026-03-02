import { stringify } from 'csv-stringify/sync'

export function exportToJson<T>(rows: T[]): string {
  return JSON.stringify(rows, null, 2)
}

export function exportToCsv<T extends object>(rows: T[]): string {
  return stringify(rows as Array<Record<string, unknown>>, { header: true })
}
