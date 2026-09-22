/**
 * errMsg - dịch một lỗi bất kỳ thành câu người dùng đọc được.
 *
 * Lỗi của supabase-js (PostgrestError) là object thường chứ KHÔNG phải
 * Error. Bản cũ dùng `String(error)` nên MỌI lỗi Supabase hiện lên toast
 * đúng một chữ "[object Object]" - người dùng không biết hỏng ở đâu, và
 * người sửa cũng vậy.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  isSupabaseConfigured: false,
}))

const { errMsg } = await import('./api')

describe('errMsg', () => {
  it('lấy .message của Error', () => {
    expect(errMsg(new Error('Số lượng phải lớn hơn 0'))).toBe('Số lượng phải lớn hơn 0')
  })

  it('lấy .message của object lỗi Supabase thay vì "[object Object]"', () => {
    const postgrestError = {
      code: 'PGRST202',
      message: 'Could not find the function public.log_stock_move in the schema cache',
      details: null,
      hint: null,
    }

    const msg = errMsg(postgrestError)

    expect(msg).toContain('log_stock_move')
    expect(msg).not.toContain('[object Object]')
  })

  it('ghép thêm hint - Postgres thường chỉ đúng chỗ sai ở đó', () => {
    const msg = errMsg({
      message: 'Could not find the function public.log_stock_move',
      hint: 'Perhaps you meant to call the function public.log_roll_cut',
    })

    expect(msg).toContain('log_stock_move')
    expect(msg).toContain('log_roll_cut')
  })

  it('dùng details khi không có hint', () => {
    const msg = errMsg({ message: 'lỗi', details: 'chi tiết' })

    expect(msg).toContain('chi tiết')
  })

  it('bỏ qua hint rỗng, không để lại dấu gạch cụt lủn', () => {
    expect(errMsg({ message: 'chỉ có message', hint: '' })).toBe('chỉ có message')
  })

  it('object không có message thì không ném lỗi', () => {
    expect(() => errMsg({ code: 500 })).not.toThrow()
  })

  it('chuỗi trả về nguyên văn', () => {
    expect(errMsg('hỏng rồi')).toBe('hỏng rồi')
  })

  it('null / undefined không làm sập', () => {
    expect(() => errMsg(null)).not.toThrow()
    expect(() => errMsg(undefined)).not.toThrow()
  })
})
