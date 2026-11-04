# HƯỚNG DẪN TRIỂN KHAI PRODUCTION (ENTERPRISE DEPLOYMENT GUIDE)
## Dự án: IELTS NUANCE MASTERY & REAL-TIME OMNI-SYNC ENGINE

Tài liệu này hướng dẫn từng bước khởi tạo, kiểm thử локал trên macOS Terminal và triển khai Production lên **Vercel** kết hợp cơ sở dữ liệu thời gian thực **Supabase**.

---

### BƯỚC 1: KHỞI TẠO DỰ ÁN NEXT.JS 14 & CÀI ĐẶT THƯ VIỆN

Mở **Terminal** trên macOS và chạy lần lượt các câu lệnh sau:

```bash
# 1. Tạo khung ứng dụng Next.js 14 (App Router, TypeScript, Tailwind CSS, thư mục src/)
npx create-next-app@14 ielts-nuance-engine --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# 2. Di chuyển vào thư mục dự án
cd ielts-nuance-engine

# 3. Cài đặt toàn bộ các package cốt lõi của hệ thống
npm install zustand @supabase/supabase-js @google/generative-ai lucide-react react-window tailwind-merge

# 4. Cài đặt bộ định nghĩa kiểu TypeScript嚴 ngặt cho react-window
npm install -D @types/react-window