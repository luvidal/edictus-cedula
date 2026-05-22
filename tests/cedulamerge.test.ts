import { describe, it, expect } from 'vitest'
import { mergeCedulaFiles } from '../src/cedulamerge'

describe('cedulamerge', () => {
  it('merges front and back cedula files', () => {
    const result = mergeCedulaFiles([
      {
        ai_fields: JSON.stringify({
          data: {
            rut: '12.345.678-9',
            nombres: 'Juan Carlos',
            apellidos: 'Pérez López',
            fecha_nacimiento: '1990-05-15',
            nacionalidad: 'Chilena',
            foto_base64: 'abc123',
          }
        }),
        filename: 'Cédula de Identidad front.jpg',
      },
      {
        ai_fields: JSON.stringify({
          data: {
            profesion: 'Ingeniero Civil',
          }
        }),
        filename: 'Cédula de Identidad back.jpg',
      },
    ])

    expect(result.nombres_apellidos).toBe('Juan Carlos Pérez López')
    expect(result.cedula_identidad).toBe('12.345.678-9')
    expect(result.fecha_nacimiento).toBe('1990-05-15')
    expect(result.nacionalidad).toBe('Chilena')
    expect(result.profesion).toBe('Ingeniero Civil')
    expect(result.foto_base64).toBe('abc123')
  })

  it('handles files without filename (no partId filtering)', () => {
    const result = mergeCedulaFiles([
      {
        ai_fields: JSON.stringify({
          rut: '12.345.678-9',
          nombres: 'María',
          apellidos: 'González',
          profesion: 'Abogada',
        }),
        filename: null,
      },
    ])

    expect(result.nombres_apellidos).toBe('María González')
    expect(result.cedula_identidad).toBe('12.345.678-9')
    expect(result.profesion).toBe('Abogada')
  })

  it('prefers formatted RUT over unformatted', () => {
    const result = mergeCedulaFiles([
      {
        ai_fields: JSON.stringify({ rut: '12345678-9' }),
        filename: null,
      },
      {
        ai_fields: JSON.stringify({ rut: '12.345.678-9' }),
        filename: null,
      },
    ])

    expect(result.cedula_identidad).toBe('12.345.678-9')
  })

  it('returns empty strings for missing fields', () => {
    const result = mergeCedulaFiles([])

    expect(result.nombres_apellidos).toBe('')
    expect(result.cedula_identidad).toBe('')
    expect(result.fecha_nacimiento).toBe('')
    expect(result.nacionalidad).toBe('')
    expect(result.profesion).toBe('')
    expect(result.foto_base64).toBeNull()
  })

  it('skips files with null ai_fields', () => {
    const result = mergeCedulaFiles([
      { ai_fields: null, filename: 'Cédula front.jpg' },
    ])

    expect(result.nombres_apellidos).toBe('')
  })

  it('front file does not contribute back-only fields', () => {
    const result = mergeCedulaFiles([
      {
        ai_fields: JSON.stringify({
          rut: '12.345.678-9',
          nombres: 'Juan',
          apellidos: 'Pérez',
          profesion: 'Should be ignored from front',
        }),
        filename: 'Cédula de Identidad front.jpg',
      },
    ])

    expect(result.nombres_apellidos).toBe('Juan Pérez')
    expect(result.profesion).toBe('')
  })
})
