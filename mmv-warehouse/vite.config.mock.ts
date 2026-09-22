import path from 'node:path'
import { mergeConfig } from 'vitest/config'
import base from './vite.config'

/**
 * Chay app o CHE DO MOC - `npm run dev:mock`.
 *
 * App co hai duong doc/ghi du lieu: nhanh Supabase va nhanh moc trong
 * src/lib/mock.ts, chon theo isSupabaseConfigured (xem src/lib/supabase.ts
 * va muc "Every API function has two implementations" trong CLAUDE.md).
 * Nhanh moc chi bat khi KHONG co bien VITE_SUPABASE_*.
 *
 * Van de: may nao da cau hinh xong thi co .env that, nen nhanh moc khong
 * bao gio chay duoc - chinh nhanh de lo nhat lai la nhanh khong ai thu.
 *
 * Cach lam o day: chi tro envDir ra thu muc goc cua git (mot cap tren,
 * khong co .env). Vite khong tim thay bien nao, isSupabaseConfigured
 * thanh false, app chay bang du lieu mau trong bo nho.
 *
 * KHONG dung, khong doi ten, khong xoa file .env that - chay song song
 * duoc voi `npm run dev` vi dung cong khac.
 */
export default mergeConfig(base, {
  envDir: path.resolve(__dirname, '..'),
  server: { port: 5174 },
  preview: { port: 4174 },
})
