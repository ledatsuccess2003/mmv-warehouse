import { beforeAll, afterAll, vi } from 'vitest'

/**
 * Nuốt riêng log '[MMV api]'.
 *
 * fail() trong src/lib/api.ts luôn console.error mọi lỗi - đúng cho lúc
 * chạy thật, nhưng phần lớn test ở đây CỐ TÌNH gây lỗi (sai quyền, sai
 * số lượng, sai mã) nên output test ngập tiếng ồn và lỗi thật khó thấy.
 *
 * Chỉ chặn đúng tiền tố đó, mọi console.error khác vẫn hiện nguyên.
 */
const real = console.error

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (args[0] === '[MMV api]') return
    real(...args)
  })
})

afterAll(() => {
  vi.restoreAllMocks()
})
